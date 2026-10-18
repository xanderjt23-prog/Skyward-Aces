// ============================================================================
// Combat: projectiles. Bullets are traced as segments against the hit boxes
// of every aircraft near them (spatial grid broad phase). Only projectiles
// fired by aircraft simulated on this machine ("real") deal damage; the rest
// are cosmetic copies of what remote players fire.
// ============================================================================
class Combat {
  constructor(match) {
    this.m = match; this.bullets = []; this.free = []; this.rockets = []; this.bombs = []; this.missiles = []; this.flares = []; this.shells = [];
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
      bm.v.y -= 9.81 * dt; bm.v.multiplyScalar(1 - 0.02 * dt);
      // guided bombs glide towards the nearest enemy target under them
      if (bm.s.guided && bm.target) { const to = bm.target.clone().sub(bm.p); const h = Math.hypot(to.x, to.z), sp = bm.v.length(); if (h > 5) { const want = to.normalize().multiplyScalar(sp); bm.v.lerp(want, Math.min(1, dt * 0.8)); } }
      bm.p.addScaledVector(bm.v, dt);
      if (bm.mesh) { bm.mesh.position.copy(bm.p); bm.mesh.lookAt(bm.p.clone().add(bm.v)); bm.mesh.rotateY(Math.PI); }
      const gy = w.groundAt(bm.p.x, bm.p.z);
      if (bm.p.y < gy + 0.5) { bm.p.y = gy; this.explode(bm.p, bm.s.dmg, bm.s.rad, bm.s.dmg * 0.1, bm.s.rad * 0.5, bm.owner, bm.team, bm.real, 'bomb', true); this.removeMesh(bm); return false; }
      return true;
    });
    // ---- flares
    this.flares = this.flares.filter(f => { f.life -= dt; f.v.y -= 9.81 * 0.3 * dt; f.v.multiplyScalar(1 - 1.2 * dt); f.p.addScaledVector(f.v, dt); FX.puff('flare', f.p, f.v); return f.life > 0; });
    // ---- missiles
    this.missiles = this.missiles.filter(ms => this.updateMissile(ms, dt));
    // ---- flak shells: burst at the fuse time
    this.shells = this.shells.filter(s => {
      s.t -= dt; s.v.y -= 9.81 * dt; s.p.addScaledVector(s.v, dt);
      if (s.t <= 0) { FX.puff('flak', s.p); Sound.flak(s.p);
        this.explode(s.p, 0, 0, s.dmg, s.rad, null, s.team, s.real, 'flak', false, s.owner); return false; }
      return true;
    });
    FX.drawTracers(this.bullets);
  }
  updateMissile(ms, dt) {
    const m = this.m, s = ms.s;
    ms.t += dt; ms.life -= dt;
    const burn = ms.t < 2.5;
    const sp = ms.v.length();
    if (burn) ms.v.addScaledVector(ms.dir, (s.speed * 1.3 - sp) * dt * 0.9 + 60 * dt);
    else ms.v.multiplyScalar(1 - 0.05 * dt);
    // seeker
    let tgt = ms.decoy ? ms.decoy.p : ms.target && ms.target.alive ? ms.target.pos : null;
    if (ms.decoy && ms.decoy.life <= 0) { ms.decoy = null; tgt = null; ms.lost = true; }
    if (!ms.decoy && ms.target && !ms.lost) {
      // flares within the seeker view may seduce an IR missile
      if (s.seek === 'ir') for (const f of this.flares) {
        if (f.owner !== ms.target || f.tried.has(ms)) continue; f.tried.add(ms);
        if (Math.random() > s.ccm * 0.9 + 0.05) { ms.decoy = f; break; }
      }
      // semi-active missiles need the launcher's radar to keep the target in front of it
      if (s.seek === 'sarh' && ms.owner && ms.owner.alive) { const to = ms.target.pos.clone().sub(ms.owner.pos).normalize(), f = new V3(0, 0, -1).applyQuaternion(ms.owner.quat); if (to.dot(f) < 0.5) ms.lost = true; }
      // past the seeker gimbal limit: lost
      if (ms.target && ms.t > 0.4) { const to = ms.target.pos.clone().sub(ms.p).normalize(); if (to.dot(ms.v.clone().normalize()) < Math.cos(Math.min(80, s.fov * 2.2) * Math.PI / 180)) ms.lost = true; }
      if (ms.target && ms.target.missileWarn !== undefined && ms.target.alive) ms.target.missileWarn = Math.max(ms.target.missileWarn, 1);
    }
    if (ms.lost && !ms.decoy) tgt = null;
    if (tgt && ms.t > 0.25) {
      // proportional navigation, limited to the missile's G
      const tv = ms.decoy ? ms.decoy.v : ms.target.vel, rel = tgt.clone().sub(ms.p), d = rel.length();
      const tof = d / Math.max(200, ms.v.length()), aim = tgt.clone().addScaledVector(tv, tof * 0.9).sub(ms.p).normalize();
      const cur = ms.v.clone().normalize(), maxTurn = s.g * 9.81 / Math.max(100, ms.v.length()) * dt;
      const ang = Math.acos(Math.max(-1, Math.min(1, cur.dot(aim))));
      if (ang > 1e-4) { const k = Math.min(1, maxTurn / ang); cur.lerp(aim, k).normalize(); }
      ms.dir.copy(cur); ms.v.copy(cur.multiplyScalar(ms.v.length()));
    }
    ms.prev.copy(ms.p); ms.p.addScaledVector(ms.v, dt);
    FX.puff('missile', ms.p);
    if (ms.mesh) { ms.mesh.position.copy(ms.p); ms.mesh.lookAt(ms.p.clone().add(ms.v)); ms.mesh.rotateY(Math.PI); }
    let boom = ms.life <= 0 || ms.p.y < m.world.groundAt(ms.p.x, ms.p.z);
    // proximity fuse against any enemy (not only the target)
    if (!boom && ms.t > 0.5) for (const c of this.near(ms.p)) { if (c.team === ms.team || !c.alive || c === ms.owner) continue;
      const d = this.segDist(ms.prev, ms.p, c.pos); if (d < 9 + c.dm.radius * 0.3) { boom = true; ms.hitCraft = c; break; } }
    if (ms.decoy && ms.p.distanceTo(ms.decoy.p) < 8) boom = true;
    if (boom) { const big = s.mass > 150; this.explode(ms.p, 200, 8, big ? 520 : 380, big ? 16 : 12, ms.owner, ms.team, ms.real, 'missile', false); this.removeMesh(ms); return false; }
    return true;
  }
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
    const mesh = Models.bomb(s.mass); this.m.scene.add(mesh); if (owner === this.m.player) Sound.clunk();
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
    const mesh = Models.missile(2.8, 0.09); this.m.scene.add(mesh); Sound.launch(p, 'missile');
    const dir = new V3(0, 0, -1).applyQuaternion(owner.quat || new THREE.Quaternion());
    if (owner.isAA) dir.copy(target.pos).sub(p).normalize().add(new V3(0, 0.3, 0)).normalize();
    const ms = { p: p.clone(), prev: p.clone(), v: v.clone().addScaledVector(dir, 30), dir, owner, team: owner.team, s, target, life: s.life, t: 0, mesh, real: owner.isAA ? this.m.isHost : owner.local };
    this.missiles.push(ms);
    if (ms.real && this.m.net) this.m.sendFx({ k: 'm', id: owner.isAA ? -1 : owner.id, aa: owner.isAA ? owner.baseIdx : undefined, s: sid, tg: target.id, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] });
    return ms;
  }
  flare(owner, cosmetic) {
    const right = new V3(1, 0, 0).applyQuaternion(owner.quat);
    for (const s of [-1, 1]) this.flares.push({ p: owner.pos.clone(), v: owner.vel.clone().multiplyScalar(0.6).addScaledVector(right, s * 25).add(new V3(0, -10, 0)), life: 3.2, owner, tried: new Set() });
    for (const ms of this.missiles) if (ms.target === owner) ms.target.missileWarn = 1;
    if (!cosmetic && owner.local && this.m.net) this.m.sendFx({ k: 'f', id: owner.id });
  }
  flak(p, v, fuse, dmg, rad, team, owner) { this.shells.push({ p: p.clone(), v: v.clone(), t: fuse, dmg, rad, team, real: this.m.isHost, owner }); }
  removeMesh(o) { if (o.mesh) { this.m.scene.remove(o.mesh); o.mesh = null; } }
  clear() { for (const l of [this.rockets, this.bombs, this.missiles]) for (const o of l) this.removeMesh(o); this.bullets = []; this.rockets = []; this.bombs = []; this.missiles = []; this.flares = []; this.shells = []; }
}
