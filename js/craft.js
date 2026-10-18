// ============================================================================
// Craft: one aircraft in a battle. Owned locally (the player, or bots on the
// host) it runs the flight model, damage ticks and weapons; owned remotely it
// is moved from network state. Either way it has a model and hit boxes.
// ============================================================================
const V3 = THREE.Vector3;
const CONV = [0, 150, 220, 300, 400, 500, 500, 500]; // gun convergence by era (m)

class Craft {
  static SERVICE_TIME = 12;
  constructor(match, spec) {
    this.match = match; this.spec = spec;
    this.id = spec.id; this.team = spec.team; this.name = spec.name; this.isBot = !!spec.bot; this.human = !spec.bot;
    this.def = PLANES[spec.plane]; this.lo = spec.loadout || { belts: {}, stores: [], mods: {} };
    this.local = false; // set by the match: simulated on this machine?
    this.pos = new V3(); this.vel = new V3(); this.quat = new THREE.Quaternion(); this.rates = new V3();
    this.ctl = { pitch: 0, roll: 0, yaw: 0, throttle: 1 };
    this.alive = false; this.everSpawned = false; this.deadT = 0; this.respawnAt = 0;
    this.stats = { kills: 0, deaths: 0, assists: 0, tanks: 0, bases: 0, basePoints: 0, score: 0, damage: 0, crewKills: 0, wingKills: 0, fires: 0, crashKills: 0, missileKills: 0, giantKills: 0, bigBases: 0, basesDestroyed: 0 };
    this.lives = spec.lives != null ? spec.lives : Infinity;
    this.model = Models.aircraft(this.def); this.model.visible = false; match.scene.add(this.model);
    this.smokeT = 0; this.fireFxT = 0; this.flareT = -99; this.lastHitT = -99; this.missileWarn = 0; this.lockT = 0; this.lockTarget = null;
    this.netFlags = 0; this.dmgVer = 0; this.sentDmgVer = -1;
  }
  get alt() { return this.pos.y; }
  get fx() { return this.dm.fx; }
  // ---- (re)spawn with a fresh airframe, fuel and ammunition
  spawn(pos, heading, speed) {
    const d = this.def;
    this.dm = Damage.create(d, this.lo.mods, { hpMul: this.spec.hpMul });
    this.loadStores();
    this.perf = Flight.perf(d, this.lo.mods, this.mass);
    this.fuel = 1; this.endurance = d.kind === 'jet' ? 900 : 1500;
    this.pos.copy(pos); this.quat.setFromEuler(new THREE.Euler(0, heading, 0, 'YXZ'));
    this.vel.set(0, 0, -1).applyQuaternion(this.quat).multiplyScalar(speed);
    this.speed = speed; this.alpha = 0; this.beta = 0; this.gLoad = 1; this.stalled = false; this.afterburner = false;
    this.rates.set(0, 0, 0); this.ctl.throttle = 1; this.ctl.pitch = this.ctl.roll = this.ctl.yaw = 0;
    this.guns = this.buildGuns(); this.turrets = this.buildTurrets();
    this.flares = d.flares * (this.lo.mods.flares ? 2 : 1);
    this.alive = true; this.everSpawned = true; this.wreck = false; this.spawnT = this.match.time; this.model.visible = true;
    const u = this.model.userData; u.wingL.visible = u.wingR.visible = true; this.model.rotation.set(0, 0, 0);
    this.crashed = false; this.dmgVer++; this.onGround = false; this.gearDown = false; this.serviceT = 0; this.serviced = false; this.brakes = false; this.missileWarn = 0; this.lockTarget = null; this.lockT = 0;
    if (this.ai) this.ai.reset();
  }
  buildGuns() {
    const d = this.def, lay = Models.layout(d), conv = CONV[d.era], out = [];
    const mk = (gid, n, mount, beltId, pod) => {
      const g = GUNS[gid], b = BELTS[beltId] || BELTS.std, bar = [];
      for (let i = 0; i < n; i++) {
        let p;
        if (pod) p = new V3((i % 2 ? 1 : -1) * lay.S * 0.2, lay.wingY - 0.5, lay.wingZ - lay.chord * 0.3);
        else if (mount === 'wing') { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2); p = new V3(s * (lay.fr + lay.S * (0.12 + k * 0.035)), lay.wingY, lay.wingZ - lay.chord * 0.5); }
        else if (mount === 'sync') p = new V3((i - (n - 1) / 2) * 0.25, lay.fr * 0.95, -lay.L * 0.4);
        else p = new V3((i - (n - 1) / 2) * 0.3, lay.jet ? -lay.fr * 0.2 : 0, -lay.L * 0.5);
        const dir = new V3(0, 0, -conv).sub(p).normalize();
        if (mount !== 'wing' && !pod) dir.set(0, 0, -1);
        bar.push({ p, dir });
      }
      // very fast guns are simulated with fewer, heavier projectiles (same damage per second)
      const simRpm = Math.min(g.rpm, 1500), bundle = g.rpm / simRpm;
      const ammo = pod ? 0 : g.ammo * n;
      out.push({ gid, g, belt: b, beltId, bar, interval: 60 / simRpm, bundle, cd: 0, ammo, max: ammo, next: 0, pod: pod || null,
        shell: { dmg: g.dmg * b.dmg * bundle, pen: b.pen, fire: b.fire, he: g.he ? (0.3 + g.cal / 40) * Math.sqrt(b.he) : 0, struct: b.struct, cal: g.cal },
        col: g.cal >= 20 ? [1, 0.55, 0.25] : [1, 0.85, 0.5] });
    };
    for (const [gid, n, mount] of d.guns) mk(gid, n, mount, this.lo.belts[gid] || 'std');
    for (const st of (this.stations || [])) if (st.s.kind === 'g') { mk(st.s.gun, st.s.guns * st.pylons, 'pod', 'std', st); }
    return out;
  }
  buildTurrets() {
    const d = this.def;
    return d.turrets.map(([gid, n, arc], i) => {
      const g = GUNS[gid]; const crew = this.dm.comps.find(c => c.type === 'crew' && c.turret === i);
      return { gid, g, n, arc, pos: Models.turretPos(d, arc), cd: 0, ammo: g.ammo * n * 2, crew, target: null, retarget: 0, burst: 0,
        shell: { dmg: g.dmg, pen: 1, fire: 1, he: g.he ? 0.3 + g.cal / 40 : 0, struct: 1, cal: g.cal } };
    });
  }
  // ---- per-frame simulation (local crafts only)
  update(dt) {
    if (!this.alive) return;
    const m = this.match;
    if (this.dm.destroyed || this.dm.fx.ctrl === 0) { this.ctl.throttle = Math.min(this.ctl.throttle, this.dm.destroyed ? 0 : 1); }
    Flight.step(this, dt);
    // rough air in bad weather
    if (m.world.turb > 0 && !this.onGround) this.vel.addScaledVector(m.world.gust, dt * (0.6 + 400 / Math.max(400, this.mass) * 0.4));
    Damage.tick(this.dm, dt, this.speed / this.perf.vmax);
    // structural failure from over-G when the wings are already damaged
    if (this.gLoad > this.perf.gMax * 1.35) for (const c of this.dm.comps) if (c.type === 'wing' && !c.dead && c.hp / c.max < 0.5 && Math.random() < dt * 2) { Damage.apply(this.dm, [{ ci: this.dm.comps.indexOf(c), dmg: c.max }], { attacker: null, time: m.time }); }
    this.processDamageEvents();
    // weapons
    for (const g of this.guns) { g.cd -= dt; if (g.firing && this.dm.fx.ctrl) this.fireGun(g); g.firing = false; }
    for (const t of this.turrets) this.updateTurret(t, dt);
    // ---- ground / sea contact: in Realistic mode a gentle touchdown on the wheels is a landing, anything else a crash
    const lay = Models.layout(this.def), gy = m.world.groundAt(this.pos.x, this.pos.z);
    const clear = this.gearDown || lay.fixed && m.cfg.realistic ? lay.gearH : 1.5;
    if (this.pos.y < gy + clear) {
      if (this.canTouchDown(gy)) { this.pos.y = gy + clear; this.rollOnGround(dt); }
      else { this.pos.y = gy + 1.5; m.onCrash(this, gy < 1); return; }
    } else if (this.onGround && this.pos.y > gy + clear + 0.4) this.onGround = false;
    if (this.pos.y > 15000) this.vel.y = Math.min(this.vel.y, 0);
  }
  canTouchDown(gy) {
    const m = this.match; if (!m.cfg.realistic || this.dm.destroyed || this.wreck) return false;
    if (!(this.gearDown || Models.layout(this.def).fixed)) return false;     // belly landing
    if (m.world.heightAt(this.pos.x, this.pos.z) < 0.3) return false;         // water
    if (this.onGround) return true;
    const f = new V3(0, 0, -1).applyQuaternion(this.quat), r = new V3(1, 0, 0).applyQuaternion(this.quat);
    const pitch = Math.asin(Math.max(-1, Math.min(1, f.y))), bank = Math.abs(Math.asin(Math.max(-1, Math.min(1, r.y))));
    const slope = Math.abs(m.world.groundAt(this.pos.x + 12, this.pos.z) - m.world.groundAt(this.pos.x - 12, this.pos.z)) + Math.abs(m.world.groundAt(this.pos.x, this.pos.z + 12) - m.world.groundAt(this.pos.x, this.pos.z - 12));
    const ok = this.vel.y > -9 && bank < 0.35 && pitch > -0.14 && this.speed < this.perf.vs * 1.9 + 15 && slope < 5;
    // a hard landing (6-9 m/s sink) survives, but bends the airframe
    if (ok && this.vel.y < -6) { const dmg = (-this.vel.y - 6) / 3; Damage.apply(this.dm, this.dm.comps.map((c, i) => ({ ci: i, dmg: (c.type === 'fuselage' || c.type === 'wing' ? 0.35 : 0.1) * c.max * dmg })).filter(h => this.dm.comps[h.ci].type !== 'crew'), { attacker: null, time: m.time }); this.processDamageEvents(); if (this === m.player) m.events.push({ t: m.time, e: 'hard', text: 'Hard landing!' }); }
    return ok && !this.dm.destroyed;
  }
  // rolling on the wheels: no sideways slip, rolling friction and brakes, wings held level, nose-wheel / tail-wheel steering
  rollOnGround(dt) {
    const m = this.match; this.onGround = true;
    // the wheels keep it down unless the pilot pulls up
    if (this.vel.y < 0 || this.ctl.pitch < 0.15) this.vel.y = Math.min(0, Math.max(this.vel.y, 0));
    const f = new V3(0, 0, -1).applyQuaternion(this.quat), fh = new V3(f.x, 0, f.z).normalize();
    let along = this.vel.dot(fh);
    const decel = (0.3 + (this.brakes ? 4 : 0) + (this.ctl.throttle < 0.05 ? 0.4 : 0)) * dt;
    along = along > 0 ? Math.max(0, along - decel) : Math.min(0, along + decel);
    this.vel.set(fh.x * along, this.vel.y, fh.z * along);
    let h = Math.atan2(-fh.x, -fh.z), pitch = Math.max(-0.03, Math.min(0.26, Math.asin(Math.max(-1, Math.min(1, f.y)))));
    h -= this.ctl.yaw * Math.min(1, Math.abs(along) / 6) * 0.6 * dt;
    this.quat.setFromEuler(new THREE.Euler(pitch, h, 0, 'YXZ')); this.rates.z = 0; this.rates.y = 0;
    // servicing at our own airfield: stop on (or next to) the runway
    const home = m.bases.find(b => b.home && b.team === this.team && !b.dead && b.runway && b.runway.c.distanceTo(new V3(this.pos.x, b.runway.c.y, this.pos.z)) < b.runway.len / 2 + 400);
    if (home && this.speed < 3) { this.serviceT = (this.serviceT || 0) + dt; if (this.serviceT >= Craft.SERVICE_TIME && !this.serviced) { this.serviced = true; this.resupply(); } }
    else if (this.speed > 8) { this.serviceT = 0; this.serviced = false; }
    this.atHome = !!home;
  }
  toggleGear() {
    const m = this.match;
    if (!m.cfg.realistic) return;
    if (Models.layout(this.def).fixed) { if (this === m.player) UI.toast('This aircraft has fixed landing gear'); return; }
    if (this.onGround) { if (this === m.player) UI.toast('Cannot raise the gear on the ground'); return; }
    this.gearDown = !this.gearDown; if (this === m.player) Sound.clunk();
  }
  // refuel, rearm and repair (Realistic mode, after landing at home)
  resupply() {
    this.dm = Damage.create(this.def, this.lo.mods, { hpMul: this.spec.hpMul });
    this.loadStores(); this.perf = Flight.perf(this.def, this.lo.mods, this.mass);
    this.guns = this.buildGuns(); this.turrets = this.buildTurrets();
    this.flares = this.def.flares * (this.lo.mods.flares ? 2 : 1); this.fuel = 1;
    const u = this.model.userData; u.wingL.visible = u.wingR.visible = true;
    this.dmgVer++;
    if (this === this.match.player) this.match.events.push({ t: this.match.time, e: 'service', text: 'Refuelled, rearmed and repaired' });
  }
  loadStores() {
    const d = this.def;
    this.mass = d.mass + (this.lo.mods.armor ? 40 : 0);
    this.stations = d.hp.map((st, i) => { const id = this.lo.stores[i]; if (!id || !STORES[id] || !storeAllowed(d, id, st)) return null; const s = STORES[id];
      this.mass += s.mass * st[3]; return { id, s, n: st[3] * (s.count || 1), pylons: st[3], label: st[0], gunAmmo: s.kind === 'g' ? GUNS[s.gun].ammo * s.guns * st[3] : 0 }; }).filter(Boolean);
  }
  processDamageEvents() {
    const dm = this.dm;
    while (dm.events.length) {
      const e = dm.events.shift(); this.dmgVer++;
      const u = this.model.userData;
      if (e === 'wingL' || e === 'wingR') { const w = e === 'wingL' ? u.wingL : u.wingR; if (w.visible) { w.visible = false; this.match.spawnDebris(this, w); } }
      if (this.local) this.match.onDamageEvent(this, e);
    }
  }
  // fire one gun group (called while the trigger is held)
  fireGun(g) {
    const ammoRef = g.pod ? g.pod : g;
    if (g.pod ? g.pod.gunAmmo <= 0 : g.ammo <= 0) return;
    let guard = 0;
    while (g.cd <= 0 && guard++ < 6) {
      g.cd += g.interval / g.bar.length;
      const b = g.bar[g.next]; g.next = (g.next + 1) % g.bar.length;
      if (g.pod) g.pod.gunAmmo -= g.bundle; else g.ammo = Math.max(0, g.ammo - g.bundle);
      const p = b.p.clone().applyQuaternion(this.quat).add(this.pos);
      const disp = 0.0025 + (g.g.cal > 20 ? 0.002 : 0);
      const dir = b.dir.clone().add(new V3((Math.random() - 0.5) * disp, (Math.random() - 0.5) * disp, 0)).normalize().applyQuaternion(this.quat);
      const v = dir.multiplyScalar(g.g.ms).add(this.vel);
      // every 2nd-5th round is a tracer, depending on the belt
      const tr = g.belt.tracer > 0 && (Math.random() < 0.35 * g.belt.tracer + (g.bundle > 1 ? 0.3 : 0));
      this.match.combat.bullet(p, v, this, g.shell, tr ? g.col : null, g.g.ms > 900 ? 2.2 : 2.6);
      if (g.pod ? g.pod.gunAmmo <= 0 : g.ammo <= 0) break;
    }
    if (g.cd < -0.1) g.cd = 0;
    Sound.fire(this.id + ':' + this.guns.indexOf(g), g.g, g.bar.length, this.pos, this === this.match.player);
    this.firingGuns = this.match.time;
  }
  setTrigger(on) { if (on) for (const g of this.guns) g.firing = true; }
  totalAmmo() { let a = 0, m = 0; for (const g of this.guns) if (!g.pod) { a += g.ammo; m += g.max; } return { a, m }; }
  // ---- defensive gunners (also on the player's aircraft): automatic
  updateTurret(t, dt) {
    t.cd -= dt; t.retarget -= dt;
    if (!t.crew || t.crew.dead || t.ammo <= 0 || this.dm.destroyed) return;
    const m = this.match;
    if (t.retarget <= 0) { t.retarget = 0.6 + Math.random() * 0.5; t.target = m.nearestEnemy(this, 900, c => this.inArc(t, c.pos)); }
    const tg = t.target; if (!tg || !tg.alive || tg.dm.destroyed) return;
    const wp = t.pos.clone().applyQuaternion(this.quat).add(this.pos);
    const d = tg.pos.distanceTo(wp); if (d > 900 || !this.inArc(t, tg.pos)) return;
    if (t.burst <= 0 && Math.random() < dt * 1.2) t.burst = 0.6 + Math.random() * 1.2;
    if (t.burst > 0) {
      t.burst -= dt;
      while (t.cd <= 0) {
        t.cd += 60 / t.g.rpm / t.n;
        const tof = d / t.g.ms, lead = tg.pos.clone().addScaledVector(tg.vel.clone().sub(this.vel), tof);
        const err = 0.03 + d / 900 * 0.035; // gunners in a bouncing turret are far from perfect
        const dir = lead.sub(wp).normalize().add(new V3((Math.random() - 0.5) * err, (Math.random() - 0.5) * err, (Math.random() - 0.5) * err)).normalize();
        this.match.combat.bullet(wp, dir.multiplyScalar(t.g.ms).add(this.vel), this, t.shell, Math.random() < 0.4 ? [1, 0.8, 0.5] : null, 1.6);
        t.ammo--;
      }
      Sound.fire(this.id + ':t' + t.arc, t.g, t.n, wp, false);
    } else if (t.cd < 0) t.cd = 0;
    this.firingTurret = m.time;
  }
  inArc(t, wpos) {
    const l = wpos.clone().sub(this.pos).applyQuaternion(this.quat.clone().invert()).normalize();
    switch (t.arc) { case 'rear': return l.z > -0.1 && l.y > -0.35; case 'tail': return l.z > 0.3; case 'dorsal': return l.y > -0.05; case 'ventral': return l.y < 0.15; case 'nose': return l.z < -0.3; }
    return true;
  }
  // ---- secondary weapons
  stationsOf(kind) { return this.stations.filter(s => s.s.kind === kind && s.n > 0); }
  count(kind) { return this.stationsOf(kind).reduce((a, s) => a + s.n, 0); }
  releaseMass(s, n) { this.mass -= s.s.mass / (s.s.count || 1) * n; this.perf = Flight.perf(this.def, this.lo.mods, this.mass); }
  dropBomb() {
    const st = this.stationsOf('b').sort((a, b) => b.s.mass - a.s.mass)[0]; if (!st || this.dm.destroyed) return false;
    const n = Math.min(st.n, st.pylons >= 2 ? 2 : 1);
    for (let i = 0; i < n; i++) { const lay = Models.layout(this.def); const off = new V3(n > 1 ? (i ? 1 : -1) * Math.min(3, lay.S * 0.2) : 0, -lay.fr - 0.5, 0).applyQuaternion(this.quat);
      // bombs tumble and scatter a little on release (more from high altitude level bombers)
      const agl = this.pos.y - this.match.world.groundAt(this.pos.x, this.pos.z), sc = 1.5 + agl * (this.def.role === 'bomber' ? 0.004 : 0.0015), v = this.vel.clone().add(new V3((Math.random() - 0.5) * sc, 0, (Math.random() - 0.5) * sc));
      this.match.combat.bomb(this.pos.clone().add(off), v, this, st.s); }
    st.n -= n; this.releaseMass(st, n); return true;
  }
  // where a bomb released now would land (same ballistics as Combat's bombs), or null
  bombImpact() {
    const p = this.pos.clone(), v = this.vel.clone(), w = this.match.world;
    for (let i = 0; i < 600; i++) { v.y -= 9.81 * 0.1; v.multiplyScalar(1 - 0.002); p.addScaledVector(v, 0.1); const gy = w.groundAt(p.x, p.z); if (p.y <= gy) { p.y = gy; return p; } }
    return null;
  }
  fireRockets() {
    const st = this.stationsOf('r')[0]; if (!st || this.dm.destroyed) return false;
    const salvo = st.id === 'r4m' ? Math.min(st.n, 6) : Math.min(st.n, 2), lay = Models.layout(this.def);
    for (let i = 0; i < salvo; i++) { const off = new V3((i % 2 ? 1 : -1) * lay.S * 0.25, lay.wingY - 0.4, lay.wingZ).applyQuaternion(this.quat);
      const dir = new V3((Math.random() - 0.5) * 0.008, (Math.random() - 0.5) * 0.008, -1).normalize().applyQuaternion(this.quat);
      this.match.combat.rocket(this.pos.clone().add(off), dir, this.vel.clone(), this, st.s); }
    st.n -= salvo; this.releaseMass(st, salvo); return true;
  }
  // best missile & target for the current nose direction (used for the lock tone and AI)
  missileStation() { const l = this.stationsOf('m'); if (!l.length) return null; return l.sort((a, b) => (b.s.seek === 'ir') - (a.s.seek === 'ir'))[0]; }
  seekerTarget(st, aimDir) {
    const s = st.s, m = this.match; let best = null, bs = 1e9; const fwd = aimDir || new V3(0, 0, -1).applyQuaternion(this.quat);
    const range = s.range * (this.lo.mods.radar && s.radar ? 1.25 : 1);
    for (const c of m.crafts) {
      if (!c.alive || c.team === this.team || c.dm.destroyed) continue;
      const to = c.pos.clone().sub(this.pos), d = to.length(); if (d > range || d < 150) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, to.dot(fwd) / d))) * 180 / Math.PI;
      if (ang > s.fov) continue;
      if (s.seek === 'ir') { // rear-aspect seekers need to see the hot tailpipe
        const tf = new V3(0, 0, -1).applyQuaternion(c.quat), aspect = tf.dot(to) / d; // >0: we are behind it
        if (s.rear && aspect < 0.45) continue;
        if (!s.rear && aspect < -0.3 && d > s.range * 0.5) continue;
        if (c.def.kind !== 'jet' && d > range * 0.6) continue; // piston engines are cooler
      }
      if (c.def.stealth && d > range * c.def.stealth) continue;
      const score = ang * 40 + d / 100; if (score < bs) { bs = score; best = c; }
    }
    return best;
  }
  fireMissile(target) {
    const st = this.missileStation(); if (!st || !target || this.dm.destroyed) return false;
    const lay = Models.layout(this.def), side = st.n % 2 ? 1 : -1;
    const off = new V3(side * Math.min(lay.S * 0.35, 4), lay.wingY - 0.5, lay.wingZ).applyQuaternion(this.quat);
    this.match.combat.missile(this.pos.clone().add(off), this.vel.clone(), this, st.s, target, st.id);
    st.n--; this.releaseMass(st, 1); return true;
  }
  dropFlares() {
    if (this.flares <= 0 || this.match.time - this.flareT < 0.6) return false;
    this.flares = Math.max(0, this.flares - 2); this.flareT = this.match.time; this.match.combat.flare(this); return true;
  }
  // ---- visuals (every craft, every frame)
  render(dt) {
    const o = this.model;
    if (!this.alive && !this.wreck) { o.visible = false; return; }
    o.visible = true; o.position.copy(this.pos); o.quaternion.copy(this.quat);
    const u = o.userData, thr = this.ctl.throttle * (this.dm ? Math.max(...this.dm.fx.thrust, 0) : 1);
    for (const p of u.props) p.rotation.z += dt * (12 + thr * 60);
    if (u.gear) u.gear.visible = !!(this.gearDown || (this.netFlags & 16) && !this.local);
    const ab = this.afterburner || (this.netFlags & 4);
    for (const gl of u.glows) { gl.visible = !!ab && !this.wreck; if (ab) gl.scale.set(1, 1, 0.8 + Math.random() * 0.4); }
    // smoke and fire trails from damaged components
    if (this.dm) {
      this.smokeT -= dt; this.fireFxT -= dt;
      const m = this.match, cam = m.cameraPos, dist = cam ? cam.distanceTo(this.pos) : 0, rate = dist > 3000 ? 0.12 : 0.04;
      if (this.smokeT <= 0) {
        this.smokeT = rate;
        for (const c of this.dm.comps) {
          const wp = c.c.clone().applyQuaternion(this.quat).add(this.pos);
          if (c.fire > 0) FX.puff('fire', wp, this.vel);
          else if (c.type === 'engine' && (c.dead || c.hp / c.max < 0.5)) FX.puff(c.dead ? 'oil' : 'smoke', wp, this.vel);
          else if (c.type === 'fuel' && c.leak > 0.002 && this.fuel > 0) FX.puff('leak', wp, this.vel);
        }
        if (this.wreck) FX.puff('fire', this.pos, this.vel, 1.5);
      }
      // contrails at altitude / wingtip vortices in hard turns
      if (this.alive && !this.wreck && dist < 2500 && (this.pos.y > 6000 || (this.gLoad > 5 && this.speed > 120))) {
        const lay = Models.layout(this.def); for (const s of [-1, 1]) FX.puff('contrail', new V3(s * lay.S / 2, lay.wingY, lay.wingZ + lay.sweep).applyQuaternion(this.quat).add(this.pos), null, 0.6);
      }
      if (ab && dist < 3000) for (const e of Models.layout(this.def).engines) if (e.jet) FX.puff('ab', new V3(e.x, e.y, Models.layout(this.def).L * 0.55).applyQuaternion(this.quat).add(this.pos), this.vel, e.r * 1.4);
    }
  }
  // ---- network state
  packState() {
    const p = this.pos, q = this.quat, v = this.vel, r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
    let f = 0; const t = this.match.time;
    if (t - (this.firingGuns || -9) < 0.15) f |= 1; if (t - (this.firingTurret || -9) < 0.15) f |= 2; if (this.afterburner) f |= 4; if (this.wreck) f |= 8; if (this.gearDown) f |= 16;
    const s = [this.id, this.alive ? 1 : 0, r1(p.x), r1(p.y), r1(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r1(v.x), r1(v.y), r1(v.z), Math.round(this.ctl.throttle * 100), f];
    return s;
  }
  applyState(s, t) {
    const wasAlive = this.alive;
    this.alive = !!s[1] || !!(s[13] & 8); this.wreck = !!(s[13] & 8);
    if (!this.alive) { this.model.visible = false; return; }
    if (!wasAlive || !this.dm) { this.remoteSpawn(); this.pos.set(s[2], s[3], s[4]); this.quat.set(s[5], s[6], s[7], s[8]).normalize(); }
    this.net = { pos: new V3(s[2], s[3], s[4]), quat: new THREE.Quaternion(s[5], s[6], s[7], s[8]).normalize(), vel: new V3(s[9], s[10], s[11]), t };
    this.vel.copy(this.net.vel); this.ctl.throttle = s[12] / 100; this.netFlags = s[13];
    if (s[13] & 1) this.firingGuns = this.match.time; if (s[13] & 2) this.firingTurret = this.match.time;
  }
  remoteSpawn() {
    this.dm = Damage.create(this.def, this.lo.mods, { hpMul: this.spec.hpMul }); this.perf = Flight.perf(this.def, this.lo.mods, this.def.mass);
    this.guns = this.buildGuns(); this.turrets = this.buildTurrets(); this.stations = [];
    const u = this.model.userData; u.wingL.visible = u.wingR.visible = true; this.everSpawned = true; this.spawnT = this.match.time;
  }
  // smooth remote motion: dead-reckon from the last state and ease out the error
  remoteUpdate(dt) {
    if (!this.alive || !this.net) return;
    const n = this.net, age = Math.min(0.5, this.match.time - n.t);
    const target = n.pos.clone().addScaledVector(n.vel, age);
    this.pos.addScaledVector(this.vel, dt); this.pos.lerp(target, Math.min(1, dt * 8));
    if (this.pos.distanceTo(target) > 60) this.pos.copy(target);
    this.quat.slerp(n.quat, Math.min(1, dt * 10));
    const t = this.match.time;
    // remote guns: show cosmetic tracers while the owner's trigger is down
    if (t - (this.firingGuns || -9) < 0.2 && this.guns) for (const g of this.guns) { g.cd -= dt; if (g.cd <= 0) { g.cd = g.interval * 2;
      const b = g.bar[Math.floor(Math.random() * g.bar.length)], p = b.p.clone().applyQuaternion(this.quat).add(this.pos);
      this.match.combat.bullet(p, b.dir.clone().applyQuaternion(this.quat).multiplyScalar(g.g.ms).add(this.vel), this, g.shell, Math.random() < 0.5 ? g.col : null, 2, true); }
      Sound.fire(this.id + ':' + this.guns.indexOf(g), g.g, g.bar.length, this.pos, false); }
  }
}
