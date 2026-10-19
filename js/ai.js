// ============================================================================
// Bot pilots. Each bot flies with the same autopilot as the player's mouse
// aim. Priorities: don't hit the ground > stay in bounds > evade missiles /
// attackers > the job (fighter sweep, ground attack, bomber run, escort).
// ============================================================================
class BotBrain {
  constructor(craft, skill) { this.c = craft; this.skill = skill == null ? 0.5 + Math.random() * 0.4 : skill; this.reset(); }
  reset() { this.target = null; this.ground = null; this.think = 0; this.jinkT = 0; this.jink = new V3(); this.burst = 0; this.mode = 'air'; this.lockT = 0; this.missileCd = 4 + Math.random() * 4; this.rocketCd = 0; this.pullOut = 0; this.noise = new V3(); this.noiseT = 0; this.bombRun = false; }
  update(dt) {
    const c = this.c, m = c.match; if (!c.alive || c.dm.destroyed || !c.dm.fx.ctrl) return;
    const P = c.perf, role = c.def.role;
    if (c.spec.passive) { // tutorial targets: hold height and weave gently, never fight back
      this.passT = (this.passT || 0) + dt; const f = new V3(0, 0, -1).applyQuaternion(c.quat), hd = Math.atan2(-f.x, -f.z) + Math.sin(this.passT * 0.15 + c.id) * 0.004;
      const dir = new V3(-Math.sin(hd), 0, -Math.cos(hd)); this.holdY = this.holdY || c.pos.y; dir.y = (this.holdY - c.pos.y) * 0.004; dir.normalize();
      if (Math.abs(c.pos.x) > m.half * 0.8 || Math.abs(c.pos.z) > m.half * 0.8) { dir.set(-c.pos.x, 0, -c.pos.z).normalize(); }
      Flight.steer(c, dir, c.ctl, { allowPush: false }); c.ctl.throttle = 0.75; return; }
    this.think -= dt; this.missileCd -= dt; this.rocketCd -= dt; this.noiseT -= dt;
    if (this.noiseT <= 0) { this.noiseT = 0.4 + Math.random() * 0.6; const k = (1 - this.skill) * 0.03; this.noise.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
    // Realistic mode take-off: roll down the runway, rotate, climb out, raise the gear
    if (c.onGround || c.climbOut) {
      const f = new V3(0, 0, -1).applyQuaternion(c.quat), fh = new V3(f.x, 0, f.z).normalize(), agl = c.pos.y - m.world.groundAt(c.pos.x, c.pos.z);
      const dir = fh.clone(); dir.y = c.onGround ? (c.speed > P.vs * 1.3 ? 0.22 : 0) : 0.3;
      Flight.steer(c, dir.normalize(), c.ctl); c.ctl.throttle = 1.1; c.ctl.yaw = 0; if (c.onGround) c.ctl.roll = 0;
      if (!c.onGround && agl > 35) c.gearDown = false;
      if (!c.onGround && agl > 150) c.climbOut = false;
      return;
    }
    if (c.gearDown && !c.onGround) c.gearDown = false;
    if (this.think <= 0) { this.think = 0.8 + Math.random() * 0.8; this.choose(); }
    const fwd = new V3(0, 0, -1).applyQuaternion(c.quat);
    let dir = null, throttle = 1, fire = false, keepBank = false;
    // ---- terrain avoidance: look ahead along the velocity
    // height needed to pull out of the current descent at a moderate G, plus a margin
    const pullG = Math.max(1, Math.min(P.gMax * 0.6, 3.5, (c.speed / P.vs) * (c.speed / P.vs) * 0.5) - 1);
    const sink = Math.max(0, -c.vel.y), need = sink * sink / (2 * 9.81 * pullG) + sink * 1.8;
    const agl = c.pos.y - m.world.groundAt(c.pos.x, c.pos.z);
    const look = Math.max(2.5, c.speed / 60);
    const ahead = c.pos.clone().addScaledVector(c.vel, look), gAhead = Math.max(m.world.groundAt(ahead.x, ahead.z), m.world.groundAt(c.pos.x, c.pos.z));
    const minAlt = (this.mode === 'ground' ? 50 : 150) + need;
    const low = ahead.y < gAhead + minAlt || c.pos.y - gAhead < need + 60;
    if (low || this.pullOut > 0) {
      if (low) this.pullOut = 1.5; else this.pullOut -= dt;
      // turn towards the lowest terrain ahead (scan seven headings) while climbing as hard as the speed allows
      const hd = Math.atan2(-fwd.x, -fwd.z); let best = null, bh = Infinity;
      for (const da of [0, -0.6, 0.6, -1.2, 1.2, -1.9, 1.9]) {
        const h = hd + da, dx = -Math.sin(h), dz = -Math.cos(h); let mx = 0;
        for (let d = 200; d <= Math.max(1200, c.speed * 10); d += 200) mx = Math.max(mx, m.world.groundAt(c.pos.x + dx * d, c.pos.z + dz * d));
        const score = mx + Math.abs(da) * 60; if (score < bh) { bh = score; best = new V3(dx, 0, dz); }
      }
      dir = best; dir.y = c.speed > P.vs * 1.7 ? 0.7 : 0.25; dir.normalize(); throttle = 1.1;
    }
    // ---- bounds
    const H = m.half * 0.92;
    if (!dir && (Math.abs(c.pos.x) > H || Math.abs(c.pos.z) > H)) { dir = new V3(-c.pos.x, 0, -c.pos.z).normalize(); dir.y = 0.1; }
    // ---- altitude ceiling (keeps bots in the fight)
    if (!dir && c.pos.y > m.ceiling) { dir = fwd.clone(); dir.y = -0.3; dir.normalize(); }
    // ---- missile evasion
    if (!dir && c.missileWarn > 0.5 && this.skill > 0.3) {
      const ms = m.combat.missiles.find(x => x.target === c && !x.decoy);
      if (ms && ms.p.distanceTo(c.pos) < 3500) {
        if (c.flares > 0 && Math.random() < dt * 6) c.dropFlares();
        const away = c.pos.clone().sub(ms.p).normalize(); const perp = new V3().crossVectors(away, new V3(0, 1, 0)).normalize();
        dir = perp.multiplyScalar(Math.sign(perp.dot(fwd)) || 1).add(new V3(0, -0.15, 0)).normalize(); throttle = 0.6; keepBank = true;
      }
    }
    // ---- being shot at: jink
    if (!dir && m.time - c.lastHitT < 1.5 && this.skill > 0.35 && this.mode !== 'bomber') {
      this.jinkT -= dt; if (this.jinkT <= 0) { this.jinkT = 0.7 + Math.random(); this.jink.set(Math.random() - 0.5, (Math.random() - 0.4) * 0.6, Math.random() - 0.5).normalize(); }
      dir = fwd.clone().add(this.jink.clone().multiplyScalar(1.4)).normalize(); keepBank = true;
    }
    if (!dir) {
      if (this.mode === 'bomber') { const r = this.bomberRun(dt); dir = r.dir; throttle = r.throttle; }
      else if (this.mode === 'ground' && this.ground) { const r = this.groundRun(dt); dir = r.dir; throttle = r.throttle; }
      else if (this.target && this.target.alive) { const r = this.dogfight(dt, fwd); dir = r.dir; throttle = r.throttle; fire = r.fire; keepBank = r.keepBank; }
      else if (this.protect && this.protect.alive) { // hold station above and behind the bombers
        const b = this.protect, bf = new V3(0, 0, -1).applyQuaternion(b.quat), side = (c.id % 2 ? 1 : -1) * (120 + (c.id % 5) * 60);
        const slot = b.pos.clone().addScaledVector(bf, -250).add(new V3(bf.z * side, 250 + (c.id % 3) * 80, -bf.x * side));
        dir = slot.clone().addScaledVector(b.vel, 3).sub(c.pos); const d = dir.length(); dir.normalize();
        throttle = d > 800 ? 1.05 : Math.max(0.35, Math.min(1, b.speed / c.perf.vmax + (d - 200) / 1500));
      }
      else { // patrol towards the enemy side at a sensible altitude
        const goal = this.patrolPoint || (this.patrolPoint = new V3((Math.random() - 0.5) * m.half, 0, (c.team === 0 ? -1 : 1) * m.half * 0.2));
        dir = goal.clone().sub(c.pos); dir.y = (m.patrolAlt - c.pos.y) * 0.4; dir.normalize(); throttle = 0.9;
        if (Math.hypot(goal.x - c.pos.x, goal.z - c.pos.z) < 600) this.patrolPoint = null;
      }
    }
    // don't dive steeply near the ground, and don't overspeed in a dive
    if (this.pullOut <= 0) { const minY = agl < 500 ? -0.2 : agl < 1500 ? -0.45 : -0.8; if (dir.y < minY) { dir = dir.clone(); dir.y = minY; dir.normalize(); } }
    if (c.speed > P.vmax * 1.05 && c.vel.y < -20) throttle = Math.min(throttle, 0.3);
    Flight.steer(c, dir, c.ctl, { keepBank, allowPush: false });
    // pilots fly within their skill: a rookie uses only about half of the aircraft's turn, an ace all of it
    c.ctl.pitch = Math.max(-1, Math.min(0.45 + this.skill * 0.6, c.ctl.pitch));
    // combat flaps in a slow turning fight, up again when fast
    if (c.def.combatFlaps && !c.flapsBroken) c.flaps = this.mode === 'air' && c.speed < P.vs * 2 && c.ctl.pitch > 0.5 ? 1 : 0;
    // bots feel G too: they unload before blacking out
    if (c.gStress > 0.5 && c.ctl.pitch > 0.3) c.ctl.pitch = 0.3;
    c.ctl.throttle = c.def.ab ? throttle : Math.min(throttle, 1.1);
    if (fire) c.setTrigger(true);
    // avoid stalling: unload when slow
    if (c.speed < P.vs * 1.35 && c.ctl.pitch > 0.2) { c.ctl.pitch = 0.2; c.ctl.throttle = 1.1; }
  }
  choose() {
    const c = this.c, m = c.match, role = c.def.role;
    if (role === 'bomber' || c.spec.task === 'bomb') { this.mode = 'bomber'; this.ground = this.ground && !this.ground.dead ? this.ground : m.taskTarget(c); return; }
    // ground attack when carrying ordnance (or an attacker), and there is something to hit
    const hasOrd = c.count('b') + c.count('r') > 0;
    if ((hasOrd || role === 'attack' || c.spec.task === 'ground') && m.hasEnemyBases(c.team)) {
      // stick with an attack run unless jumped by a fighter
      const threat = m.nearestEnemy(c, 700), stay = this.mode === 'ground' && this.ground && !this.ground.dead && m.time - c.lastHitT > 3;
      if (stay || !threat || role === 'attack' || (this.mode !== 'air' && Math.random() < 0.7)) {
        this.mode = 'ground';
        if (!this.ground || this.ground.dead) {
          this.ground = m.taskTarget(c) || m.nearestEnemyBase(c.team, c.pos);
          const tank = m.vehicles.list.filter(v => !v.dead && v.team !== c.team).sort((a, b) => a.pos.distanceTo(c.pos) - b.pos.distanceTo(c.pos))[0];
          if (tank && c.def.role !== 'bomber' && (!this.ground || tank.pos.distanceTo(c.pos) < this.ground.pos.distanceTo(c.pos) * 1.3 || Math.random() < 0.45)) this.ground = tank;
        }
        if (this.ground) return;
      }
    }
    this.mode = 'air';
    // escorts stay with their bombers and only engage fighters that come close to them
    if (c.spec.task === 'escort') {
      const flock = m.crafts.filter(e => e.alive && !e.wreck && e.team === c.team && (e.spec.task === 'bomb' || e.def.role === 'bomber'));
      if (flock.length) {
        this.protect = flock.reduce((a, e) => (e.pos.distanceTo(c.pos) < a.pos.distanceTo(c.pos) ? e : a));
        const threat = m.crafts.filter(e => e.alive && !e.wreck && e.team !== c.team && flock.some(b => b.pos.distanceTo(e.pos) < 2200) || (e.alive && e.team !== c.team && m.time - c.lastHitT < 3 && e.pos.distanceTo(c.pos) < 800));
        this.target = threat.length ? threat.reduce((a, e) => (e.pos.distanceTo(c.pos) < a.pos.distanceTo(c.pos) ? e : a)) : null;
        return;
      }
      this.protect = null;
    }
    // interceptors go for the bombers, unless a fighter is on their tail
    if (c.spec.task === 'intercept') {
      const bombers = m.crafts.filter(e => e.alive && !e.wreck && e.team !== c.team && (e.spec.task === 'bomb' || e.def.role === 'bomber'));
      const jumped = m.time - c.lastHitT < 4 || m.crafts.some(e => e.alive && e.team !== c.team && e.ai && e.ai.target === c && e.pos.distanceTo(c.pos) < 600);
      if (bombers.length && !jumped) { this.target = bombers.reduce((a, e) => (e.pos.distanceTo(c.pos) < a.pos.distanceTo(c.pos) ? e : a)); return; }
    }
    // fighter: pick the most convenient enemy (distance, angle, low altitude penalty), prefer bombers when escorting/intercepting
    let best = null, bs = Infinity;
    const fwd = new V3(0, 0, -1).applyQuaternion(c.quat);
    for (const e of m.crafts) {
      if (!e.alive || e.team === c.team || e.dm.destroyed) continue;
      const to = e.pos.clone().sub(c.pos), d = to.length(); const ang = Math.acos(Math.max(-1, Math.min(1, to.dot(fwd) / d)));
      let s = d + ang * 600 + (e === this.target ? -500 : 0);
      if (e.def.role === 'bomber' && c.spec.task === 'intercept') s -= 2500;
      if (m.attackersOf && m.attackersOf(e) > 2) s += 800; // don't all chase the same target
      if (s < bs) { bs = s; best = e; }
    }
    this.target = best;
  }
  dogfight(dt, fwd) {
    const c = this.c, t = this.target, m = c.match;
    const rel = t.pos.clone().sub(c.pos), d = rel.length();
    const g = c.guns.find(x => x.ammo > 0 || (x.pod && x.pod.gunAmmo > 0)) || c.guns[0];
    // bullets inherit our own velocity: lead by the relative velocity, and lift for the drop
    const ms = g ? g.g.ms : 800, tof = d / ms;
    const lead = t.pos.clone().addScaledVector(t.vel.clone().sub(c.vel), tof * (0.85 + this.skill * 0.2)).add(new V3(0, 9.81 * tof * tof * 0.5, 0));
    const dir = (d > 1800 ? t.pos.clone().sub(c.pos) : lead.sub(c.pos)).normalize().add(this.noise.clone().multiplyScalar(1 + (1 - this.skill) * 2)).normalize();
    // energy: climb above a far target, use the throttle to avoid overshooting a close one
    if (d > 2500) dir.y += Math.max(-0.2, Math.min(0.25, (t.pos.y + 300 - c.pos.y) / 3000));
    let throttle = d > 1500 ? 1.1 : 1;
    const closing = -rel.clone().normalize().dot(t.vel.clone().sub(c.vel));
    if (d < 350 && closing > 40 && fwd.dot(rel.clone().normalize()) > 0.8) throttle = 0.4;
    // fire when the nose is on the lead point
    const off = Math.acos(Math.max(-1, Math.min(1, fwd.dot(dir))));
    const range = c.def.era <= 2 ? 450 : c.def.era <= 4 ? 700 : 1000;
    let fire = false;
    if (d < range && off < 0.025 + (1 - this.skill) * 0.03 + 6 / d) { this.burst = 0.3 + Math.random() * 0.6; }
    // snap shots: close behind the target, spray while pulling lead
    else if (d < 350 && off < 0.12 && this.burst <= 0 && Math.random() < dt * 3) this.burst = 0.25;
    if (this.burst > 0) { this.burst -= dt; fire = d < range * 1.2; }
    // missiles
    const st = c.missileStation();
    if (st && this.missileCd <= 0 && d < st.s.range * 0.75 && d > 400) {
      const seen = c.seekerTarget(st);
      if (seen === t) { this.lockT += dt * 3; if (this.lockT > 1.2) { c.fireMissile(t); this.missileCd = 6 + Math.random() * 6; this.lockT = 0; } } else this.lockT = 0;
    }
    // rockets at bombers (R4M-style)
    if (this.rocketCd <= 0 && c.count('r') > 0 && t.def.role === 'bomber' && d < 700 && off < 0.04) { c.fireRockets(); this.rocketCd = 1.5; }
    return { dir, throttle, fire, keepBank: off > 0.2 };
  }
  // dive on a base: rockets and guns on the way in, bombs at the computed release point
  groundRun(dt) {
    const c = this.c, m = c.match, b = this.ground;
    if (b.dead) { this.ground = null; this.think = 0; return { dir: new V3(0, 0.3, -1).applyQuaternion(c.quat).normalize(), throttle: 1 }; }
    const tp = b.pos.clone(); tp.y += 3;
    const rel = tp.clone().sub(c.pos), hd = Math.hypot(rel.x, rel.z), alt = c.pos.y - b.pos.y;
    const hasBombs = c.count('b') > 0, hasRockets = c.count('r') > 0;
    let dir, throttle = 1;
    const fwd = new V3(0, 0, -1).applyQuaternion(c.quat);
    if (this.egress > 0) { this.egress -= dt; dir = fwd.clone(); dir.y = 0.35; return { dir: dir.normalize(), throttle: 1.1 }; }
    if (hasBombs && !hasRockets && c.def.role !== 'attack') {
      // level / shallow bombing run: aim for the release point
      const impact = BotBrain.impact(c, b.pos.y), miss = Math.hypot(impact.x - b.pos.x, impact.z - b.pos.z);
      const wantAlt = b.pos.y + Math.max(250, Math.min(700, c.speed * 4));
      dir = new V3(rel.x, 0, rel.z).normalize(); dir.y = (wantAlt - c.pos.y) / 1500;
      // small targets (tanks): release when the bombs' blast will reach them
      if (miss < Math.max(b.radius, 28) * 0.55 && alt > 40) { c.dropBomb(); if (c.count('b') === 0) this.egress = 6; }
      else if (hd < 200) this.egress = 3;
      return { dir: dir.normalize(), throttle };
    }
    // dive attack: rockets / guns
    if (hd > 2200) { dir = new V3(rel.x, 0, rel.z).normalize(); dir.y = (b.pos.y + 700 - c.pos.y) / 2000; return { dir: dir.normalize(), throttle: 1 }; }
    dir = rel.clone().normalize();
    const off = Math.acos(Math.max(-1, Math.min(1, fwd.dot(dir)))), d = rel.length();
    if (d < 1000 && off < 0.05) {
      if (hasRockets && this.rocketCd <= 0) { c.fireRockets(); this.rocketCd = 0.35; }
      else c.setTrigger(true);
      if (hasBombs && alt > 40) { const ip = BotBrain.impact(c, b.pos.y); if (Math.hypot(ip.x - b.pos.x, ip.z - b.pos.z) < Math.max(b.radius, 28) * 0.6) c.dropBomb(); }
    }
    if (d < 380 || alt < 120) this.egress = 3.5;
    return { dir, throttle: 0.8 };
  }
  // bombers: fly at altitude to the target, drop everything, go home
  bomberRun(dt) {
    const c = this.c, m = c.match, b = this.ground;
    const fwd = new V3(0, 0, -1).applyQuaternion(c.quat);
    if (!b || b.dead || c.count('b') === 0) {
      const home = new V3(c.pos.x, 0, (c.team === 0 ? 1 : -1) * m.half);
      if (m.mode === 'destroy' && Math.abs(home.z - c.pos.z) < 1500 && !c.human) { m.recycle(c); return { dir: new V3(0, 0, -1).applyQuaternion(c.quat), throttle: 0.9 }; }
      const dir = home.sub(c.pos); dir.y = 0; return { dir: dir.normalize(), throttle: 0.9 }; }
    const impact = BotBrain.impact(c, b.pos.y), miss = Math.hypot(impact.x - b.pos.x, impact.z - b.pos.z);
    if (miss < b.radius * 0.7) { this.dropCd = (this.dropCd || 0) - dt; if (this.dropCd <= 0) { c.dropBomb(); this.dropCd = 0.4; } }
    const rel = b.pos.clone().sub(c.pos); const dir = new V3(rel.x, 0, rel.z).normalize();
    dir.y = ((this.cruise || (this.cruise = c.pos.y)) - c.pos.y) / 800;
    return { dir: dir.normalize(), throttle: 0.95 };
  }
  // where a bomb released now would land (same drag as Combat's bombs)
  static impact(c, groundY) {
    const p = c.pos.clone(), v = c.vel.clone();
    for (let i = 0; i < 400 && p.y > groundY; i++) { v.y -= 9.81 * 0.1; v.multiplyScalar(1 - 0.002); p.addScaledVector(v, 0.1); }
    return p;
  }
}
