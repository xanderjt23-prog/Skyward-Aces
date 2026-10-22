// ============================================================================
// Ground vehicles: tanks that drive around their team's territory, following
// the terrain and avoiding water. Armour means rifle-calibre bullets barely
// scratch them; cannon, rockets and bombs are what kills tanks. In Destroy a
// destroyed tank scores 0.5 points. The host moves them; clients follow.
// ============================================================================
const TANK_HP = [0, 300, 450, 700, 900, 1100, 1300, 1500];
const TANK_SPEED = [0, 1.8, 4, 8, 10, 12, 13, 14]; // m/s on good ground
const TANK_NAMES = [null, 'Mark IV', 'Light tank', 'Medium tank', 'Tank', 'Main battle tank', 'Main battle tank', 'Main battle tank'];
class Vehicles {
  constructor(m, specs) {
    this.m = m; this.list = [];
    for (const sp of specs || []) this.add(sp);
  }
  add(sp) {
    const m = this.m, era = m.era, mesh = Vehicles.model(era, sp.team);
    const v = { id: sp.id, idx: this.list.length, team: sp.team, pos: new V3(sp.x, 0, sp.z), heading: sp.h || 0, hp: TANK_HP[era], max: TANK_HP[era], dead: false, radius: 6, mesh, log: {},
      kind: 'tank', name: TANK_NAMES[era], wp: null, speed: TANK_SPEED[era] * (0.8 + ((sp.id.length * 7 + this.list.length * 13) % 10) / 25), tpos: null, th: 0 };
    // start on dry land near the planned spot
    for (let r = 0; r < 2000 && m.world.heightAt(v.pos.x, v.pos.z) < 3; r += 60) { const a = r * 0.37; v.pos.x = sp.x + Math.cos(a) * r; v.pos.z = sp.z + Math.sin(a) * r; }
    v.pos.y = m.world.groundAt(v.pos.x, v.pos.z);
    mesh.position.copy(v.pos); mesh.rotation.y = v.heading; m.scene.add(mesh);
    this.list.push(v); return v;
  }
  // the tank of its era (props.js): WW1 rhomboid, then a sloped hull on tracks and road wheels with turret and gun;
  // the team colour on the turret roof
  static model(era, team) {
    const b = new Models.Builder(); Props.tankBody(Props.at(b, 0, 0, 0), era, Models.TEAM_COL[team]);
    return new THREE.Mesh(b.build(), Models.mat('vc'));
  }
  // host: drive between waypoints in the team's half, turning slowly; clients: glide to the host's positions
  update(dt) {
    const m = this.m, w = m.world;
    for (const v of this.list) {
      if (v.dead) { if (Math.random() < dt * 2) FX.puff('smoke', v.pos.clone().add(new V3(0, 2, 0))); continue; }
      if (m.isHost) {
        if (!v.wp || Math.hypot(v.wp.x - v.pos.x, v.wp.z - v.pos.z) < 30) v.wp = this.waypoint(v);
        const want = Math.atan2(-(v.wp.x - v.pos.x), -(v.wp.z - v.pos.z));
        let dh = want - v.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        v.heading += Math.max(-0.4 * dt, Math.min(0.4 * dt, dh));
        const step = v.speed * dt * (Math.abs(dh) > 0.6 ? 0.3 : 1), nx = v.pos.x - Math.sin(v.heading) * step, nz = v.pos.z - Math.cos(v.heading) * step;
        if (w.heightAt(nx, nz) > 2.5 && Math.abs(w.heightAt(nx, nz) - w.heightAt(v.pos.x, v.pos.z)) < step * 0.9 + 0.3) { v.pos.x = nx; v.pos.z = nz; } else v.wp = this.waypoint(v);
      } else if (v.tpos) { v.pos.lerp(v.tpos, Math.min(1, dt * 1.5)); let dh = v.th - v.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2; v.heading += dh * Math.min(1, dt * 2); }
      v.pos.y = w.groundAt(v.pos.x, v.pos.z);
      v.mesh.position.copy(v.pos); v.mesh.rotation.y = v.heading;
      // tilt with the slope
      const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading), pitch = Math.atan2(w.groundAt(v.pos.x + fx * 3, v.pos.z + fz * 3) - w.groundAt(v.pos.x - fx * 3, v.pos.z - fz * 3), 6);
      v.mesh.rotation.x = pitch;
    }
  }
  waypoint(v) {
    const m = this.m, s = v.team === 0 ? 1 : -1, w = m.world;
    for (let t = 0; t < 20; t++) {
      const x = (Math.random() - 0.5) * m.half * 1.4, z = s * (0.08 + Math.random() * 0.6) * m.half;
      if (w.heightAt(x, z) > 3 && Math.hypot(x - v.pos.x, z - v.pos.z) < m.half * 0.6) return new V3(x, 0, z);
    }
    return new V3(v.pos.x + (Math.random() - 0.5) * 400, 0, v.pos.z + (Math.random() - 0.5) * 400);
  }
  // a bullet / shell segment against the tanks (only near the ground). Returns the tank hit or null.
  traceBullet(b) {
    for (const v of this.list) {
      if (v.dead || v.team === b.team) continue;
      const c = v.pos.clone().add(new V3(0, 1.5, 0)); if (Math.abs(b.p.x - c.x) > 30 || Math.abs(b.p.z - c.z) > 30) continue;
      if (this.m.combat.segDist(b.prev, b.p, c) < 3) return v;
    }
    return null;
  }
  // armour: how much of a round's damage gets through
  static armourFactor(shell) { const c = shell.cal || 8, p = shell.pen || 1; return c < 10 ? 0.04 * p : c < 16 ? 0.2 * p : c < 26 ? 0.5 * p : 0.9 * p; }
  hit(v, dmg, owner) {
    const m = this.m; if (v.dead) return;
    if (!m.isHost) { m.send({ t: 'vh', i: v.idx, d: Math.round(dmg * 10) / 10, a: owner ? owner.id : null }); return; }
    v.hp -= dmg; if (owner && owner.id != null && !owner.isAA) v.log[owner.id] = (v.log[owner.id] || 0) + dmg;
    if (v.hp <= 0) this.destroy(v);
  }
  destroy(v, byId) {
    const m = this.m; if (v.dead) return; v.dead = true; v.hp = 0;
    FX.explosion(v.pos.clone().add(new V3(0, 2, 0)), 1.2, true); Sound.boom(1.2, v.pos);
    v.mesh.material = v.mesh.material.clone(); v.mesh.material.color = new THREE.Color(0x2a2a2a);
    let by = byId != null ? m.byId[byId] : null;
    if (byId == null) { let bd = 0; for (const k in v.log) if (v.log[k] > bd && m.byId[k] && m.byId[k].team !== v.team) { bd = v.log[k]; by = m.byId[k]; } }
    if (m.isHost && m.mode === 'destroy') m.scores[1 - v.team] += 0.5;
    if (by) { by.stats.tanks = (by.stats.tanks || 0) + 1; by.stats.score += 0.5; }
    m.feed.push({ t: m.time, text: `${by ? by.name : 'Team'} destroyed a ${v.name} (+0.5)`, team: 1 - v.team, me: by === m.player });
    if (by === m.player) m.events.push({ t: m.time, e: 'tank', text: `+0.5  ${v.name} destroyed` });
    if (m.isHost && m.net) m.broadcast({ t: 'vk', i: v.idx, by: by ? by.id : null });
  }
  // network: compact positions for the snapshot
  pack() { return this.list.map(v => [Math.round(v.pos.x), Math.round(v.pos.z), Math.round(v.heading * 100) / 100, Math.round(v.hp)]); }
  unpack(arr) { arr.forEach((a, i) => { const v = this.list[i]; if (!v || v.dead) return; v.tpos = new V3(a[0], 0, a[1]); v.th = a[2]; v.hp = a[3]; }); }
  dispose() { for (const v of this.list) this.m.scene.remove(v.mesh); }
}
