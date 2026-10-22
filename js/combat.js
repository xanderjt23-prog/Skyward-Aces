// ============================================================================
// Combat: projectiles. Bullets are traced as segments against the hit boxes
// of every aircraft near them (spatial grid broad phase). Only projectiles
// fired by aircraft simulated on this machine ("real") deal damage; the rest
// are cosmetic copies of what remote players fire.
// ============================================================================
const s_ccm = ms => ms.s.ccm || 0.5;
class Combat {
  constructor(match) {
    this.m = match; this.bullets = []; this.free = []; this.rockets = []; this.bombs = []; this.missiles = []; this.flares = []; this.chaff = []; this.shells = [];
    this.grid = new Map(); this.CELL = 250; this._o = new V3(); this._d = new V3(); this._iq = new THREE.Quaternion();
  }
  bullet(p, v, owner, shell, col, life, cosmetic) {
    const b = this.free.pop() || { p: new V3(), v: new V3(), prev: new V3() };
    b.p.copy(p); b.prev.copy(p); b.v.copy(v); b.owner = owner; b.team = owner ? owner.team : -1; b.shell = shell; b.tracer = !!col; b.col = col; b.life = life || 2.5;
    b.real = !cosmetic && (owner ? owner.local : this.m.isHost); b.aa = owner && owner.isAA;
    this.bullets.push(b);
    if (this.bullets.length > 9000) { const o = this.bullets.shift(); this.free.push(o); }
  }
  buildGrid() {
    this.grid.clear(); const C = this.CELL;
    for (const c of this.m.crafts) { if (!c.alive || !c.dm) continue;
      const k = Math.floor(c.pos.x / C) * 73856093 ^ Math.floor(c.pos.z / C) * 19349663; let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(c); }
  }
  near(p) {
    const C = this.CELL, ix = Math.floor(p.x / C), iz = Math.floor(p.z / C), out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const l = this.grid.get((ix + dx) * 73856093 ^ (iz + dz) * 19349663); if (l) for (const c of l) out.push(c); }
    return out;
  }
  // segment a->b against an aircraft. Returns trace result or null.
  traceCraft(c, a, b, shell) {
    const iq = this._iq.copy(c.quat).invert();
    const o = this._o.copy(a).sub(c.pos).applyQuaternion(iq), d = this._d.copy(b).sub(a).applyQuaternion(iq);
    const len = d.length(); if (len < 1e-6) return null; d.divideScalar(len);
    if (o.length() > c.dm.radius + len + 2) return null;
    const r = Damage.trace(c.dm, o, d, len, shell);
    if (r) { r.fromBehind = d.z < -0.5; r.local = r.point; }
    return r;
  }
  update(dt) {
    const m = this.m, w = m.world;
    this.buildGrid();
    // ---- bullets
    const keep = [];
    for (const b of this.bullets) {
      b.life -= dt; b.prev.copy(b.p);
      b.v.y -= 9.81 * dt; b.v.multiplyScalar(1 - 0.12 * dt);
      b.p.addScaledVector(b.v, dt);
      let dead = b.life <= 0;
      // tanks (only for rounds near the ground)
      if (!dead && b.real && !b.aa && m.vehicles.list.length && b.p.y - w.groundAt(b.p.x, b.p.z) < 25) {
        const v = m.vehicles.traceBullet(b);
        if (v) { dead = true; FX.puff(b.shell.he ? 'hehit' : 'spark', b.p, null, 0.6); m.vehicles.hit(v, b.shell.dmg * Vehicles.armourFactor(b.shell) * (b.shell.struct || 1), b.owner); }
      }
      if (!dead) {
        const gy = w.groundAt(b.p.x, b.p.z);
        if (b.p.y < gy) { dead = true; if (m.cameraPos && m.cameraPos.distanceToSquared(b.p) < 1.5e6) FX.puff(gy < 1 ? 'splash' : 'dust', b.p, null, 0.3);
          if (b.real && !b.aa) m.groundHit(b.p, b.shell.dmg * b.shell.struct * 0.35, b.shell.he > 0 ? 4 : 1.5, b.owner, b.team, 'gun'); }
      }
      if (!dead) for (const c of this.near(b.p)) {
        if (c === b.owner || !c.alive || (b.team === c.team && c.team >= 0)) continue;
        const r = this.traceCraft(c, b.prev, b.p, b.shell);
        if (r) {
          dead = true;
          const wp = r.point.clone().applyQuaternion(c.quat).add(c.pos);
          FX.puff(b.shell.he ? 'hehit' : 'spark', wp, c.vel, b.shell.he ? 0.6 + b.shell.cal / 40 : 1);
          if (b.real) m.hitCraft(c, r.hits, { attacker: b.owner, fire: b.shell.fire, pen: b.shell.pen, cal: b.shell.cal, fromBehind: r.fromBehind, kind: 'gun' });
          break;
        }
      }
      if (dead) this.free.push(b); else keep.push(b);
    }
    this.bullets = keep;
    // ---- rockets: fast, slightly ballistic, impact or proximity fuse
    this.rockets = this.rockets.filter(r => {
      r.life -= dt; r.t += dt;
      if (r.t < 1.2) r.v.addScaledVector(r.dir, r.s.speed * 1.2 * dt);
      r.v.y -= 9.81 * dt; r.prev.copy(r.p); r.p.addScaledVector(r.v, dt);
      if (Math.random() < 0.6) FX.puff('rocket', r.p);
      if (r.mesh) { r.mesh.position.copy(r.p); r.mesh.lookAt(r.p.clone().add(r.v)); r.mesh.rotateY(Math.PI); }
      const gy = w.groundAt(r.p.x, r.p.z);
      let boom = r.life <= 0 || r.p.y < gy;
      if (!boom) for (const c of this.near(r.p)) { if (c === r.owner || c.team === r.team || !c.alive) continue;
        if (c.pos.distanceTo(r.p) < c.dm.radius * 0.6 + 2) { boom = true; break; } }
      if (boom) { this.explode(r.p, r.s.dmg, r.s.rad, r.s.airDmg, 6, r.owner, r.team, r.real, 'rocket', r.p.y < gy + 2); this.removeMesh(r); return false; }
      return true;
    });
    // ---- bombs
    this.bombs = this.bombs.filter(bm => {
      bm.t = (bm.t || 0) + dt; Combat.bombStep(bm.s, bm.p, bm.v, dt, bm.t, true);
      // guided bombs glide towards the nearest enemy target under them
      if (bm.s.guided && bm.target) { const to = bm.target.clone().sub(bm.p); const h = Math.hypot(to.x, to.z), sp = bm.v.length(); if (h > 5) { const want = to.normalize().multiplyScalar(sp); bm.v.lerp(want, Math.min(1, dt * 0.8)); } }
      if (bm.mesh) { bm.mesh.position.copy(bm.p); bm.mesh.lookAt(bm.p.clone().add(bm.v)); bm.mesh.rotateY(Math.PI); }
      const gy = w.groundAt(bm.p.x, bm.p.z);
      if (bm.p.y < gy + 0.5) { bm.p.y = gy; this.explode(bm.p, bm.s.dmg, bm.s.rad, bm.s.dmg * 0.1, bm.s.rad * 0.5, bm.owner, bm.team, bm.real, 'bomb', true); this.removeMesh(bm); return false; }
      return true;
    });
    // ---- flares
    this.flares = this.flares.filter(f => { f.life -= dt; f.v.y -= 9.81 * 0.3 * dt; f.v.multiplyScalar(1 - 1.2 * dt); f.p.addScaledVector(f.v, dt); FX.puff('flare', f.p, f.v); return f.life > 0; });
    // ---- chaff: a cloud of foil that stops almost at once and drifts down
    this.chaff = this.chaff.filter(c => { c.life -= dt; c.v.multiplyScalar(1 - 3 * dt); c.v.y -= 2 * dt; c.p.addScaledVector(c.v, dt); if (Math.random() < dt * 8) FX.puff('chaff', c.p); return c.life > 0; });
    // ---- missiles
    this.missiles = this.missiles.filter(ms => this.updateMissile(ms, dt));
    this.sensors();
    // ---- flak shells: burst at the fuse time
    this.shells = this.shells.filter(s => {
      s.t -= dt; s.v.y -= 9.81 * dt; s.p.addScaledVector(s.v, dt);
      if (s.t <= 0) { FX.puff('flak', s.p); Sound.flak(s.p);
        this.explode(s.p, 0, 0, s.dmg, s.rad, null, s.team, s.real, 'flak', false, s.owner); return false; }
      return true;
    });
    FX.drawTracers(this.bullets);
  }
  // ---- missile flight: a rocket motor (boost, then sustainer or ramjet if it has one), drag from the airframe's real
  // diameter and mass and the air density, gravity, and proportional navigation limited by the lift the fins can make
  // at this speed and height (a missile coasting slowly in thin air can hardly turn), with the drag of turning on top
  updateMissile(ms, dt) {
    const m = this.m, s = ms.s;
    ms.t += dt; ms.life -= dt;
    const v = Math.max(1, ms.v.length()), rho = Math.exp(-Math.max(0, ms.p.y) / 9000), dir = this._d.copy(ms.v).divideScalar(v);
    const P = Combat.phys(s);
    ms.motor = ms.t < P.burn ? 2 : ms.t < P.burn + P.sus ? 1 : 0;
    let ax = -P.k * rho * v * v;
    if (ms.motor === 2) ax += P.thrust; else if (ms.motor === 1) ax += P.k * rho * P.cruise * P.cruise;
    // seeker and guidance
    const tgt = ms.t > 0.25 ? this.track(ms, dt) : null;
    ms.nG = 0;
    if (tgt && v > 150) {
      const R = tgt.p.clone().sub(ms.p), Vr = tgt.v.clone().sub(ms.v), R2 = Math.max(1, R.lengthSq());
      const om = new V3().crossVectors(R, Vr).divideScalar(R2);                       // line-of-sight rotation rate
      const a = new V3().crossVectors(om, ms.v).multiplyScalar(4);                     // proportional navigation, N = 4
      a.y += 9.81; a.addScaledVector(dir, -a.dot(dir));                                 // hold the trajectory against gravity
      const nMax = Math.min(s.g, s.g * rho * v * v / (P.cruise * P.cruise)) * 9.81;
      if (a.length() > nMax) a.setLength(nMax);
      ms.nG = a.length() / 9.81; ms.v.addScaledVector(a, dt);
    }
    ax -= ms.nG * 9.81 / 6;                                                             // drag of pulling G (lift / drag ~6)
    ms.v.addScaledVector(dir, ax * dt); ms.v.y -= 9.81 * dt;
    if (!ms.motor && ms.v.length() < 200) ms.lost = true;                               // too slow to steer: falls away
    ms.dir.copy(ms.v).normalize();
    ms.prev.copy(ms.p); ms.p.addScaledVector(ms.v, dt);
    if (ms.motor) FX.puff('missile', ms.p);
    if (ms.mesh) { ms.mesh.position.copy(ms.p); ms.mesh.lookAt(ms.p.clone().add(ms.v)); ms.mesh.rotateY(Math.PI); }
    let boom = ms.life <= 0 || ms.p.y < m.world.groundAt(ms.p.x, ms.p.z);
    // proximity fuse against any enemy (not only the target)
    // (it detonates at the point of closest approach along this frame's path, not where the frame ends)
    let at = ms.p;
    if (!boom && ms.t > 0.5) for (const c of this.near(ms.p)) { if (c.team === ms.team || !c.alive || c === ms.owner) continue;
      const d = this.segDist(ms.prev, ms.p, c.pos); if (d < 12 + c.dm.radius * 0.3) { boom = true; ms.hitCraft = c; at = this.segPoint(ms.prev, ms.p, c.pos); break; } }
    if (ms.decoy && ms.decoy.flare && ms.p.distanceTo(ms.decoy.p) < 8) boom = true;
    if (boom) { const big = s.mass > 150; this.explode(at.clone(), 200, 8, big ? 520 : 380, big ? 16 : 12, ms.owner, ms.team, ms.real, 'missile', false); this.removeMesh(ms); return false; }
    return true;
  }
  // the seeker: where the missile is steering (point and velocity), or null when it has nothing. Also raises the
  // target's warnings: a radar warning receiver hears the illuminating or active radar, a missile approach warner sees
  // the plume (both only on aircraft fitted with them, see bombers.js)
  track(ms, dt) {
    const m = this.m, s = ms.s, T = ms.target, now = m.time;
    if (ms.decoy) { if (ms.decoy.life <= 0) { ms.decoy = null; ms.lost = true; return null; } return { p: ms.decoy.p, v: ms.decoy.v }; }
    if (ms.lost || !T || !T.alive) return null;
    const toT = T.pos.clone().sub(ms.p), d = toT.length(), fwd = ms.v.clone().normalize();
    const inGimbal = () => ms.t < 0.4 || toT.dot(fwd) / d > Math.cos(Math.min(80, s.fov * 2.2) * Math.PI / 180);
    if (s.seek === 'ir') {
      if (!inGimbal()) { ms.lost = true; return null; }
      // flares near the target and in the seeker's view may seduce it; better seekers reject more of them
      for (const f of this.flares) {
        if (f.owner !== T || f.tried.has(ms) || f.p.distanceTo(T.pos) > 300) continue; f.tried.add(ms);
        if (Math.random() < (1 - s.ccm) * 0.6) { ms.decoy = f; return { p: f.p, v: f.v }; }
      }
      return { p: T.pos, v: T.vel };
    }
    // radar guided. The launcher's radar (an aircraft's, within its +-60 deg scan, or a SAM site's) tracks the target
    // unless the target hides in the ground clutter by flying across the beam (a notch) long enough
    const L = ms.owner, radarOk = L && (L.isAA ? L.hp > 0 : L.alive && L.def && L.def.radar && T.pos.clone().sub(L.pos).normalize().dot(new V3(0, 0, -1).applyQuaternion(L.quat)) > 0.5);
    const illum = radarOk && !this.notched(ms, 'l', L.pos, T, dt);
    if (illum) T.wLock = now;
    if (s.seek === 'sarh') {
      if (!inGimbal()) { ms.lost = true; return null; }
      if (!illum) { ms.dark = (ms.dark || 0) + dt; if (ms.dark > 1.5) ms.lost = true; return ms.last ? this.predict(ms) : null; }
      ms.dark = 0; T.wLaunch = now;
      const c = this.chaffed(ms, T, 'l'); if (c) return c;
      ms.last = { p: T.pos.clone(), v: T.vel.clone(), t: now }; return { p: T.pos, v: T.vel };
    }
    // active radar: datalink updates from the launcher while it tracks, inertial otherwise; near the predicted position
    // the missile's own radar switches on ("pitbull") and from then on it guides itself
    if (!ms.active) {
      if (illum || !ms.last) ms.last = { p: T.pos.clone(), v: T.vel.clone(), t: now };
      const pr = this.predict(ms);
      if (pr.p.distanceTo(ms.p) > (s.seekR || 12000)) return pr;
      ms.active = true;
      if (!inGimbal() || d > (s.seekR || 12000) * 1.3 || (T.def.stealth && d > (s.seekR || 12000) * T.def.stealth)) { ms.lost = true; return pr; }
    }
    if (!inGimbal() || this.notched(ms, 'a', ms.p, T, dt)) { ms.lost = true; return null; }
    T.wLaunch = now;
    const c = this.chaffed(ms, T, 'a'); if (c) return c;
    return { p: T.pos, v: T.vel };
  }
  predict(ms) { const k = this.m.time - ms.last.t; return { p: ms.last.p.clone().addScaledVector(ms.last.v, k), v: ms.last.v }; }
  // a notch: the target's own velocity nearly square to the radar beam (its Doppler falls into the ground clutter the
  // radar filters out) while the radar looks down at it or it is low. Held long enough, the radar drops it; chaff in
  // the air shortens that a lot. Better radars (ccm) hold on longer.
  notched(ms, key, rp, T, dt) {
    const los = T.pos.clone().sub(rp), d = los.length(); los.divideScalar(Math.max(1, d));
    const radial = Math.abs(T.vel.dot(los)), agl = T.pos.y - this.m.world.groundAt(T.pos.x, T.pos.z);
    const lookDown = rp.y - T.pos.y > d * 0.03 || agl < 600;
    const k = 'notch' + key;
    if (radial < 35 && lookDown) ms[k] = (ms[k] || 0) + dt; else ms[k] = Math.max(0, (ms[k] || 0) - dt * 2);
    const chaff = this.chaff.some(c => c.owner === T && c.life > 2);
    return ms[k] > (chaff ? 0.25 : 0.6 + s_ccm(ms) * 1.8);
  }
  // fresh chaff near the target: each bundle gets one chance to pull the radar off it (much better in a notch)
  chaffed(ms, T, key) {
    for (const c of this.chaff) {
      if (c.owner !== T || c.tried.has(ms) || c.p.distanceTo(T.pos) > 200) continue; c.tried.add(ms);
      const notch = (ms['notch' + key] || 0) > 0.15;
      if (Math.random() < (1 - s_ccm(ms)) * (notch ? 0.95 : 0.1) + (notch ? 0.1 : 0)) { ms.decoy = c; return { p: c.p, v: c.v }; }
    }
    return null;
  }
  // what the target's sensors report each frame (timestamps: a warning holds while it is renewed)
  sensors() {
    const now = this.m.time;
    for (const ms of this.missiles) {
      const T = ms.target; if (!T || !T.alive || ms.lost && !ms.decoy) continue; const d = ms.p.distanceTo(T.pos);
      if ((ms.motor && d < 10000) || d < 2000) T.wMaws = now;                         // the plume, or the missile itself close by
      if (d < 2500 && ms.p.clone().sub(T.pos).dot(T.vel) > -d * T.vel.length() * 0.5) T.wSeen = now; // the pilot sees it coming
    }
    for (const c of this.m.crafts) { if (!c.def) continue; const r = t => t != null && now - t < 0.3;
      const sensed = (c.def.rwr && r(c.wLaunch)) || (c.def.maws && r(c.wMaws));
      if (sensed || r(c.wSeen)) c.missileWarn = Math.max(c.missileWarn || 0, 1); }
  }
  // drag factor k (deceleration = k * density ratio * v^2, from Cd 0.35 on the body cross-section), boost thrust (reaches
  // the rated speed from a typical launch speed by burn-out), the cruise speed a sustainer / ramjet holds and the speed
  // the fins reach full G at sea level
  // one step of a falling bomb (moves p and v): gravity and drag 0.5 rho v^2 Cd A / m, with the drag rise near the
  // speed of sound; a Snakeye's fins open half a second after release. Shared by the bombs, the CCIP sight and the bots
  // so the pipper shows exactly where the bomb will land.
  static bombStep(s, p, v, dt, t) {
    const sp = v.length(), rho = 1.225 * Math.exp(-Math.max(0, p.y) / 9000), mach = sp / 330;
    const area = s.ret && t > 0.5 ? 0.5 : Math.PI * (s.dia || 0.3) * (s.dia || 0.3) / 4, cd = s.ret && t > 0.5 ? 1.2 : (s.cd || 0.3) * (1 + 1.6 * Math.max(0, Math.min(1, (mach - 0.8) / 0.4)));
    const dec = 0.5 * rho * sp * cd * area / Math.max(1, s.mass);
    v.y -= 9.81 * dt; v.multiplyScalar(Math.max(0, 1 - dec * dt)); p.addScaledVector(v, dt);
  }
  static phys(s) {
    if (s._ph) return s._ph;
    const A = Math.PI * (s.dia || 0.2) * (s.dia || 0.2) / 4, k = 0.5 * 0.35 * A * 1.225 / Math.max(20, s.mass), burn = s.burn || 3, cruise = s.speed * 0.75;
    return (s._ph = { k, burn, sus: s.sus || 0, thrust: (s.speed - 250) / burn + k * 0.5 * cruise * cruise, cruise });
  }
  segPoint(a, b, p) { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6))); return a.clone().addScaledVector(ab, t); }
  segDist(a, b, p) { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6))); return a.clone().addScaledVector(ab, t).distanceTo(p); }
  // explosion: ground damage (bases) and air blast (aircraft hit boxes)
  explode(p, groundDmg, groundRad, airDmg, airRad, owner, team, real, kind, onGround, aaOwner) {
    const m = this.m, cd = m.cameraPos ? m.cameraPos.distanceTo(p) : 0;
    if (kind !== 'flak') { FX.explosion(p, Math.max(0.4, Math.min(3, (groundRad || airRad) / 18)), onGround); Sound.boom(Math.min(2.5, Math.max(groundRad, airRad) / 22 + 0.3), p); }
    if (onGround && p.y < 1.5) FX.puff('splash', p, null, 3);
    if (!real) return;
    if (groundDmg > 0) m.groundHit(p, groundDmg, groundRad, owner, team, kind);
    if (airDmg > 0) for (const c of this.near(p)) {
      if (!c.alive || c.team === team || c === owner) continue;
      const iq = this._iq.copy(c.quat).invert(), lp = p.clone().sub(c.pos).applyQuaternion(iq);
      if (lp.length() > airRad + c.dm.radius) continue;
      const hits = Damage.blast(c.dm, lp, airDmg, airRad);
      if (hits.length) m.hitCraft(c, hits, { attacker: owner || aaOwner, fire: 1.5, pen: 1, cal: 30, kind, aa: !owner });
    }
  }
  bomb(p, v, owner, s) {
    const mesh = Models.bomb(s); this.m.scene.add(mesh); if (owner === this.m.player) Sound.clunk();
    const bm = { p: p.clone(), v: v.clone(), owner, team: owner.team, s, mesh, real: owner.local };
    if (s.guided) { const b = this.m.nearestEnemyBase(owner.team, p, 4000); if (b) bm.target = b.pos.clone(); }
    this.bombs.push(bm);
    if (owner.local && this.m.net) this.m.sendFx({ k: 'b', id: owner.id, s: Object.keys(STORES).find(k => STORES[k] === s), p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] });
  }
  rocket(p, dir, v, owner, s) {
    const mesh = Models.missile(1.6, 0.06); this.m.scene.add(mesh); Sound.launch(p, 'rocket');
    this.rockets.push({ p: p.clone(), prev: p.clone(), v: v.clone().addScaledVector(dir, 40), dir: dir.clone(), owner, team: owner.team, s, life: 6, t: 0, mesh, real: owner.local });
    if (owner.local && this.m.net) this.m.sendFx({ k: 'r', id: owner.id, s: Object.keys(STORES).find(k => STORES[k] === s), p: [p.x, p.y, p.z], d: [dir.x, dir.y, dir.z], v: [v.x, v.y, v.z] });
  }
  missile(p, v, owner, s, target, sid) {
    const mesh = Models.missile(s.len || 2.8, (s.dia || 0.18) / 2); this.m.scene.add(mesh); Sound.launch(p, 'missile');
    const dir = new V3(0, 0, -1).applyQuaternion(owner.quat || new THREE.Quaternion());
    if (owner.isAA) dir.copy(target.pos).sub(p).normalize().add(new V3(0, 0.3, 0)).normalize();
    const ms = { p: p.clone(), prev: p.clone(), v: v.clone().addScaledVector(dir, 30), dir, owner, team: owner.team, s, target, life: s.life, t: 0, mesh, real: owner.isAA ? this.m.isHost : owner.local };
    this.missiles.push(ms);
    if (ms.real && this.m.net) this.m.sendFx({ k: 'm', id: owner.isAA ? -1 : owner.id, aa: owner.isAA ? owner.baseIdx : undefined, s: sid, tg: target.id, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] });
    return ms;
  }
  flare(owner, cosmetic) {
    const right = new V3(1, 0, 0).applyQuaternion(owner.quat);
    for (const s of [-1, 1]) this.flares.push({ p: owner.pos.clone(), v: owner.vel.clone().multiplyScalar(0.6).addScaledVector(right, s * 25).add(new V3(0, -10, 0)), life: 3.2, owner, tried: new Set(), flare: true });
    if (owner.def && owner.def.chaff) this.chaff.push({ p: owner.pos.clone(), v: owner.vel.clone().multiplyScalar(0.3), life: 4, owner, tried: new Set() });
    if (!cosmetic && owner.local && this.m.net) this.m.sendFx({ k: 'f', id: owner.id });
  }
  flak(p, v, fuse, dmg, rad, team, owner) { this.shells.push({ p: p.clone(), v: v.clone(), t: fuse, dmg, rad, team, real: this.m.isHost, owner }); }
  removeMesh(o) { if (o.mesh) { this.m.scene.remove(o.mesh); o.mesh = null; } }
  clear() { for (const l of [this.rockets, this.bombs, this.missiles]) for (const o of l) this.removeMesh(o); this.bullets = []; this.rockets = []; this.bombs = []; this.missiles = []; this.flares = []; this.chaff = []; this.shells = []; }
}
