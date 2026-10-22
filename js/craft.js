// ============================================================================
// Craft: one aircraft in a battle. Owned locally (the player, or bots on the
// host) it runs the flight model, damage ticks and weapons; owned remotely it
// is moved from network state. Either way it has a model and hit boxes.
// ============================================================================
const V3 = THREE.Vector3;
const CONV = [0, 150, 220, 300, 400, 500, 500, 500]; // gun convergence by era (m)

const _ax = new THREE.Vector3();
class Craft {
  static SERVICE_TIME = 12;
  static FLAP_NAMES = ['up', 'combat', 'take-off', 'landing'];
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
    this.model = Models.aircraft(this.def, this.lo.livery); this.model.visible = false; match.scene.add(this.model);
    this.smokeT = 0; this.fireFxT = 0; this.flareT = -99; this.lastHitT = -99; this.missileWarn = 0; this.lockT = 0; this.lockTarget = null;
    this.netFlags = 0; this.dmgVer = 0; this.sentDmgVer = -1;
  }
  get alt() { return this.pos.y; }
  get fx() { return this.dm.fx; }
  // ---- (re)spawn with a fresh airframe, fuel and ammunition
  spawn(pos, heading, speed) {
    const d = this.def;
    this.dm = Damage.create(d, this.lo.mods, { hpMul: this.spec.hpMul });
    this.loadStores(); this.buildStoreMeshes();
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
    this.gVision = 0; this.gStress = 0; this.glocT = 0; this.flaps = 0; this.flapsBroken = false; this.flapOver = 0; this.airbrakeOut = false; this.gunMode = 0;
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
    // a pilot blacked out by G (G-LOC) lets go of the stick
    if (this.glocT > 0) { this.ctl.pitch = this.ctl.roll = this.ctl.yaw = 0; this.ctl.manual = false; }
    Flight.step(this, dt);
    this.gTick(dt);
    // flaps down too fast get torn off (or jam)
    if (this.flaps && this.speed > this.perf.vmax * Flight.FLAP_VFE[this.flaps]) { this.flapOver += dt; if (this.flapOver > 1.5) { this.flaps = 0; this.flapsBroken = true; if (this === m.player) m.events.push({ t: m.time, e: 'flaps', text: 'Flaps torn off — too fast!' }); } } else this.flapOver = 0;
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
  // ---- the pilot's G tolerance (grey-out / tunnel vision, G-LOC blackout, red-out)
  //  above gTol the vision narrows and greys; holding more than ~2 G beyond it builds up towards G-LOC (unconscious ~5 s);
  //  below -2.5 G the vision reddens and -3.5 G and worse builds up too
  gTick(dt) {
    const g = this.gLoad || 1, tol = this.perf.gTol, hard = tol + 2;
    const target = g > tol ? Math.min(1, (g - tol) / 2.2) : g < -2.5 ? -Math.min(1, (-g - 2.5) / 1.5) : 0;
    const v = this.gVision || 0, k = Math.abs(target) > Math.abs(v) ? dt / 1.1 : dt / 0.7; // blood drains slower than it returns
    this.gVision = v + (target - v) * Math.min(1, k);
    // the brain keeps ~4-6 s of oxygen after the blood pressure at eye level drops, so G-LOC comes several seconds after a
    // hard pull, not at once; above the tolerance the pilot also tires (straining), so even 9 G with a G-suit ends in G-LOC
    // after tens of seconds. Below the tolerance it recovers.
    let s = this.gStress || 0;
    if (g > hard) s += ((g - hard) * 0.12 + (g - tol) * 0.015) * dt; else if (g > tol) s += (g - tol) * 0.015 * dt; else if (g < -3.5) s += (-g - 3.5) * 0.25 * dt; else s -= 0.22 * dt;
    this.gStress = Math.max(0, s);
    if (this.glocT > 0) { this.glocT -= dt; if (this.glocT <= 0) this.gStress = 0.45; }
    else if (this.gStress >= 1 && this.dm.fx.ctrl) { this.glocT = 4.5 + Math.random() * 1.5; if (this === this.match.player) this.match.events.push({ t: this.match.time, e: 'gloc', text: 'G-LOC — blacked out!' }); }
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
  setFlaps(dir) {
    const d = this.def, m = this.match;
    if (d.flaps !== 'manual') { if (this === m.player) UI.toast(d.flaps === 'auto' ? 'This aircraft has automatic manoeuvre flaps' : 'This aircraft has no flaps'); return; }
    if (this.flapsBroken) { if (this === m.player) UI.toast('The flaps are damaged'); return; }
    const notches = d.combatFlaps ? [0, 1, 2, 3] : [0, 2, 3], i = notches.indexOf(this.flaps);
    this.flaps = notches[Math.max(0, Math.min(notches.length - 1, (i < 0 ? 0 : i) + dir))];
    if (this === m.player) { UI.toast('Flaps: ' + Craft.FLAP_NAMES[this.flaps]); Sound.clunk(); }
  }
  // gun groups: 0 all, 1 machine guns only, 2 cannons only (>= 20 mm)
  gunGroups() { const mg = this.guns.some(g => g.g.cal < 20), can = this.guns.some(g => g.g.cal >= 20); return mg && can; }
  cycleGuns() {
    if (!this.gunGroups()) { if (this === this.match.player) UI.toast('All guns fire together on this aircraft'); return; }
    this.gunMode = (this.gunMode + 1) % 3; if (this === this.match.player) UI.toast('Guns: ' + ['all', 'machine guns only', 'cannons only'][this.gunMode]);
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
    this.loadStores(); this.buildStoreMeshes(); this.perf = Flight.perf(this.def, this.lo.mods, this.mass);
    this.guns = this.buildGuns(); this.turrets = this.buildTurrets();
    this.flares = this.def.flares * (this.lo.mods.flares ? 2 : 1); this.fuel = 1;
    const u = this.model.userData; u.wingL.visible = u.wingR.visible = true;
    this.dmgVer++;
    if (this === this.match.player) this.match.events.push({ t: this.match.time, e: 'service', text: 'Refuelled, rearmed and repaired' });
  }
  // ---- ordnance hanging on the pylons, shown until it is released
  buildStoreMeshes() {
    if (this.storeGroup) { this.model.remove(this.storeGroup); this.storeGroup = null; }
    const d = this.def, lay = Models.layout(d), grp = new THREE.Group(), pylonMat = Models.mat('vc');
    for (const st of this.stations) {
      st.meshes = [];
      const sp0 = Loadout.position(d, st.slot, 0, null); st.local = new V3(sp0.x, sp0.y, sp0.z); // release point, also for internal bays
      if (st.slot.bay) continue;                                                     // carried internally
      for (let k = 0; k < st.pylons; k++) {
        const mk = Models.storeMesh(st.s, st.id), p = Loadout.position(d, st.slot, k, mk);
        mk.position.set(p.x, p.y, p.z); grp.add(mk); st.local.set(p.x, p.y, p.z);
        if (!p.tip) { const top = p.wing ? lay.wingY : -lay.fr * (st.slot.band === 1 ? 0.75 : 1), h = Math.max(0.05, top - p.y - mk.userData.r);
          const py = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, Math.min(1.2, mk.userData.len * 0.4)), pylonMat); py.position.set(p.x, p.y + mk.userData.r + h / 2, p.z);
          py.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(py.geometry.attributes.position.count * 3).fill(0.3), 3)); grp.add(py); }
        st.meshes.push(mk);
      }
      st.full = st.n;
    }
    this.storeGroup = grp; this.model.add(grp);
  }
  // hide released stores (outer pylons empty first)
  updateStoreMeshes() {
    for (const st of this.stations || []) { if (!st.meshes || !st.meshes.length) continue;
      const per = st.full / st.meshes.length, left = Math.ceil(st.n / Math.max(1, per) - 1e-6);
      st.meshes.forEach((m, i) => { m.visible = i < left; }); }
  }
  loadStores() {
    this._wslots = null; // weapon slots are rebuilt from the new loadout
    const d = this.def;
    this.mass = d.mass + (this.lo.mods.armor ? 40 : 0);
    const sl = Loadout.slots(d), ids = Loadout.of(d, this.lo);
    this.stations = sl.map((slot, i) => { const id = ids[i]; if (!id || !STORES[id] || !Loadout.allowed(d, slot, id)) return null; const s = STORES[id];
      this.mass += s.mass * slot.pylons; return { id, s, n: slot.pylons * (s.count || 1), pylons: slot.pylons, label: slot.name, slot, gunAmmo: s.kind === 'g' ? GUNS[s.gun].ammo * s.guns * slot.pylons : 0 }; }).filter(Boolean);
  }
  processDamageEvents() {
    const dm = this.dm;
    while (dm.events.length) {
      const e = dm.events.shift(); this.dmgVer++;
      const u = this.model.userData;
      if (e === 'wingL' || e === 'wingR') { const w = e === 'wingL' ? u.wingL : u.wingR; if (w.visible) { w.visible = false; this.match.spawnDebris(this, w); }
        // everything hanging on that wing goes with it (the same weapon on the other wing stays usable)
        const side = e === 'wingL' ? -1 : 1;
        for (const st of this.stations || []) if (st.slot && st.slot.side === side && st.slot.band >= 2 && st.n > 0) { this.releaseMass(st, st.n); st.n = 0; for (const mk of st.meshes || []) mk.visible = false; } }
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
  setTrigger(on) { if (on) for (const g of this.guns) if (this.gunMode === 0 || (this.gunMode === 1) === (g.g.cal < 20)) g.firing = true; }
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
  // weapon slots: every store type carried (missiles first, infrared before radar, then bombs, rockets), fixed for the sortie
  // so the keys never shift as weapons are used up
  weaponSlots() {
    if (!this._wslots) { const ids = [...new Set(this.stations.filter(s => s.s.kind !== 'g').map(s => s.id))], ord = id => { const st = STORES[id]; return ({ m: 0, b: 2, r: 3 })[st.kind] + (st.kind === 'm' && st.seek !== 'ir' ? 1 : 0); };
      this._wslots = ids.sort((a, b) => ord(a) - ord(b)); }
    return this._wslots;
  }
  countOf(id) { return this.stations.filter(s => s.id === id).reduce((a, s) => a + s.n, 0); }
  // the next pylon(s) to release from: of the given type (or the first in line), outboard pylons first, and its loaded
  // mirror on the other wing so the aircraft stays balanced
  releaseSet(kind, pick) {
    const l = this.stationsOf(kind).filter(s => !pick || pick(s)).sort((a, b) => b.slot.rank - a.slot.rank || a.slot.side - b.slot.side); if (!l.length) return [];
    const a = l[0], b = a.slot.mirror >= 0 ? l.find(s => s.slot.i === a.slot.mirror && s.id === a.id) : null; return b ? [a, b] : [a];
  }
  releasePoint(st) { const p = st.local ? st.local.clone() : new V3(0, -Models.layout(this.def).fr - 0.5, 0); return p.applyQuaternion(this.quat).add(this.pos); }
  count(kind) { return this.stationsOf(kind).reduce((a, s) => a + s.n, 0); }
  releaseMass(s, n) { this.mass -= s.s.mass / (s.s.count || 1) * n; this.perf = Flight.perf(this.def, this.lo.mods, this.mass); }
  dropBomb(id) {
    if (this.dm.destroyed) return false;
    const heavy = this.stationsOf('b').reduce((m, s) => Math.max(m, s.s.mass), 0), set = this.releaseSet('b', id ? s => s.id === id : s => s.s.mass === heavy); if (!set.length) return false;
    for (const st of set) { const n = st.slot.bay ? Math.min(st.n, 2) : 1; // a bay releases two at a time, an external pylon its one bomb
      for (let i = 0; i < n; i++) {
        // bombs tumble and scatter a little on release (more from high altitude level bombers)
        const agl = this.pos.y - this.match.world.groundAt(this.pos.x, this.pos.z), sc = 1.5 + agl * (this.def.role === 'bomber' ? 0.004 : 0.0015), v = this.vel.clone().add(new V3((Math.random() - 0.5) * sc, 0, (Math.random() - 0.5) * sc));
        this.match.combat.bomb(this.releasePoint(st).add(new V3(i ? 0.6 : 0, 0, 0).applyQuaternion(this.quat)), v, this, st.s); }
      st.n -= n; this.releaseMass(st, n); }
    return true;
  }
  // where a bomb released now would land (same ballistics as Combat's bombs), or null
  bombImpact() {
    const p = this.pos.clone(), v = this.vel.clone(), w = this.match.world;
    for (let i = 0; i < 600; i++) { v.y -= 9.81 * 0.1; v.multiplyScalar(1 - 0.002); p.addScaledVector(v, 0.1); const gy = w.groundAt(p.x, p.z); if (p.y <= gy) { p.y = gy; p.tti = (i + 1) * 0.1; return p; } }
    return null;
  }
  // where to put the nose so the guns hit the target now (bullets inherit our velocity; drop lifted)
  leadPoint(t) {
    const g = this.guns.find(x => x.ammo > 0) || this.guns[0], ms = g ? g.g.ms : 800, d = t.pos.distanceTo(this.pos), tof = d / ms;
    return t.pos.clone().addScaledVector(t.vel.clone().sub(this.vel), tof).add(new V3(0, 4.9 * tof * tof, 0));
  }
  fireRockets(id) {
    if (this.dm.destroyed) return false; const set = this.releaseSet('r', id ? s => s.id === id : null); if (!set.length) return false;
    for (const st of set) { const salvo = st.id === 'r4m' ? Math.min(st.n, 3) : 1;
      for (let i = 0; i < salvo; i++) { const dir = new V3((Math.random() - 0.5) * 0.008, (Math.random() - 0.5) * 0.008, -1).normalize().applyQuaternion(this.quat);
        this.match.combat.rocket(this.releasePoint(st), dir, this.vel.clone(), this, st.s); }
      st.n -= salvo; this.releaseMass(st, salvo); }
    return true;
  }
  // best missile & target for the current nose direction (used for the lock tone and AI)
  // the selected missile type (cycled with its key); by default the first infrared type
  missileTypes() { return [...new Set(this.stationsOf('m').map(s => s.id))]; }
  missileStation(id) { if (id) return this.releaseSet('m', s => s.id === id)[0] || null; const types = this.missileTypes(); if (!types.length) return null;
    if (!types.includes(this.missileSel)) this.missileSel = types.slice().sort((a, b) => (STORES[b].seek === 'ir') - (STORES[a].seek === 'ir'))[0];
    return this.releaseSet('m', s => s.id === this.missileSel)[0] || null; }
  cycleMissile() { const t = this.missileTypes(); if (t.length < 2) return false; this.missileStation(); this.missileSel = t[(t.indexOf(this.missileSel) + 1) % t.length]; return true; }
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
    const st = this.missileStation(arguments[1]); if (!st || !target || this.dm.destroyed) return false;
    this.match.combat.missile(this.releasePoint(st), this.vel.clone(), this, st.s, target, st.id);
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
    this.updateStoreMeshes();
    if (u.gear) u.gear.visible = !!(this.gearDown || (this.netFlags & 16) && !this.local);
    // flaps and air brakes move at a real hydraulic / electric pace (a few seconds end to end), not instantly
    if (u.movers && u.movers.length) {
      const notch = this.local ? this.flaps : (this.netFlags >> 6) & 3, brake = this.local ? this.airbrakeOut : !!(this.netFlags & 32);
      let flapT = this.flapsBroken ? 0 : [0, 12, 25, 45][notch] || 0;
      if (this.def.flaps === 'auto' && this.alive) flapT = Math.max(0, Math.min(18, (this.alpha * 57.3 - 4) * 1.6)) * (this.speed < this.perf.vmax * 0.6 ? 1 : 0); // manoeuvre flaps follow the AoA
      this.flapA = (this.flapA || 0) + Math.max(-dt * 9, Math.min(dt * 9, flapT - (this.flapA || 0)));
      this.brakeA = (this.brakeA || 0) + Math.max(-dt * 0.8, Math.min(dt * 0.8, (brake ? 1 : 0) - (this.brakeA || 0))); // ~1.3 s to open
      this.brakeA = Math.max(0, Math.min(1, this.brakeA));
      for (const m of u.movers) { const h = m.userData.hinge, ang = h.kind === 'flap' ? this.flapA * h.sign : this.brakeA * (h.max || 45) * h.sign;
        m.quaternion.setFromAxisAngle(_ax.set(h.axis[0], h.axis[1], h.axis[2]), ang * Math.PI / 180); }
    }
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
    if (t - (this.firingGuns || -9) < 0.15) f |= 1; if (t - (this.firingTurret || -9) < 0.15) f |= 2; if (this.afterburner) f |= 4; if (this.wreck) f |= 8; if (this.gearDown) f |= 16; if (this.airbrakeOut) f |= 32; f |= (this.flaps & 3) << 6;
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
    this.loadStores(); this.buildStoreMeshes(); this.guns = this.buildGuns(); this.turrets = this.buildTurrets();
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
