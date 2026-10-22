// ============================================================================
// Tutorials: short guided flights, picked from the Play menu. Each one puts you in an aircraft that suits the lesson
// (owned or not), sets up the scene (runway, targets, a target drone) and walks through steps, each with its own
// instruction and a check that moves on when you have done it. Keys in the instructions follow your bindings.
// In normal battles there is no instructional text; this is where it lives.
// ============================================================================
const Tutorial = (() => {
  const K = a => Input.label(Input.bind(a));
  // the number key of the first weapon type on the player's aircraft that passes `test` (each type has its own key)
  const WK = test => { const p = Game.match && Game.match.player, i = p ? p.weaponSlots().findIndex(id => id && test(STORES[id])) : -1; return i < 0 ? '?' : K('weapon' + (i + 1)); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const agl = (m, p) => p.pos.y - m.world.groundAt(p.pos.x, p.pos.z);
  const bankDeg = p => { const ax = Flight.axes(p); return Math.atan2(-ax.right.y, ax.up.y) * 180 / Math.PI; };
  const diveDeg = p => Math.asin(Math.max(-1, Math.min(1, p.vel.y / Math.max(1, p.speed)))) * 180 / Math.PI;
  const pitchDeg = p => Math.asin(Math.max(-1, Math.min(1, new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat).y))) * 180 / Math.PI;
  const upY = p => new THREE.Vector3(0, 1, 0).applyQuaternion(p.quat).y;             // 1 upright, -1 inverted
  const hdgDeg = p => { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat); return Math.atan2(-f.x, -f.z) * 180 / Math.PI; };
  const wrap = a => ((a + 540) % 360) - 180;
  // what an aircraft can carry: some pylon takes a store that passes `test`
  const carries = (pl, test) => Loadout.slots(pl).some(s => Object.keys(STORES).some(id => test(STORES[id]) && Loadout.allowed(pl, s, id)));
  const isIR = s => s.kind === 'm' && s.seek === 'ir', isRadar = s => s.kind === 'm' && s.seek !== 'ir';
  const enemyBase = m => m.bases.find(b => b.team === 1);
  const home = m => m.bases.find(b => b.home && b.runway);
  // a deterministic loadout: every pylon that takes the wanted kind gets the heaviest store of it that fits (symmetric)
  function loadout(pl, kind, prefer) {
    const sl = Loadout.slots(pl), stores = sl.map(() => null); let kg = 0;
    for (const s of sl) { if (stores[s.i] || (s.mirror >= 0 && s.mirror < s.i)) continue; const both = s.mirror >= 0 ? [s.i, s.mirror] : [s.i];
      const ok = Object.keys(STORES).filter(id => STORES[id].kind === (typeof kind === 'function' ? kind(s) : kind) && Loadout.allowed(pl, s, id) && kg + STORES[id].mass * s.pylons * both.length <= pl.payload);
      const id = (prefer && ok.find(x => prefer.includes(x))) || ok.sort((a, b) => STORES[b].mass - STORES[a].mass)[0]; if (!id) continue;
      for (const i of both) stores[i] = id; kg += STORES[id].mass * s.pylons * both.length; }
    return { belts: {}, stores, perSlot: true, mods: {} };
  }
  // air-to-air fit: heat seekers on the wingtip rails, the best radar missile on the pylons that take one (the newest
  // of each type the aircraft can carry; the F-16C gets AIM-9L/M Sidewinders and AIM-120 AMRAAMs)
  function missileFit(pl) { const sl = Loadout.slots(pl), best = (s, test) => Object.keys(STORES).filter(id => test(STORES[id]) && Loadout.allowed(pl, s, id)).sort((a, b) => STORES[b].range - STORES[a].range)[0] || null;
    const ir = sl.map(s => best(s, isIR)), rad = sl.map(s => best(s, isRadar));
    return { belts: {}, perSlot: true, mods: {}, stores: sl.map((s, i) => s.band === 5 && ir[i] ? ir[i] : rad[i] && s.band >= 1 && s.band !== 5 ? rad[i] : ir[i]) }; }
  // the name of the first store on the player's aircraft that passes `test`
  const WN = test => { const p = Game.match && Game.match.player, id = p && p.weaponSlots().find(id => id && test(STORES[id])); return id ? STORES[id].name.replace(/ \(.*\)$/, '') : 'missile'; };
  const target = (id, plane, x, y, z, extra) => ({ id, team: 1, name: 'Target', plane, bot: true, owner: 'H', skill: 0, task: 'air', loadout: { belts: {}, stores: [], mods: {} }, lives: 1, passive: true, spawnAt: [x, y, z], tid: id, ...(extra || {}) });

  // ================================================================ maneuver guides
  // A step can show the way:
  //   gates: k => [[x, y, f], ...]  a path in the frame of the player's position and heading when the step began
  //          (x right, y up, f forward), sized from k.R (the 4 G turn radius at the current speed). Fly through the
  //          rings in order; stray too far and the path is laid out again from where you are.
  //   rel:   { who, pts: [[x, y, f], ...], r }  rings that ride along with another aircraft (its heading and the
  //          vertical), for maneuvers flown against an opponent
  //   setup(c) once, script(c, dt) every frame: the other aircraft fly scripted, kinematic paths (see botMove)
  const V3 = THREE.Vector3, UP = new V3(0, 1, 0);
  function frame(p) { const f = new V3(0, 0, -1).applyQuaternion(p.quat).setY(0); if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize(); return { o: p.pos.clone(), f, r: new V3().crossVectors(f, UP).normalize() }; }
  const at = (F, x, y, fz) => F.o.clone().addScaledVector(F.r, x).addScaledVector(UP, y).addScaledVector(F.f, fz);
  const turnR = p => { const v = Math.max(p.speed, p.perf.vs * 1.8); return Math.max(220, Math.min(1400, v * v / (9.81 * 4))); };
  const arc = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
  // ---- the paths (local [x right, y up, f forward]); every one starts a little ahead of the aircraft
  const PATH = {
    // wingover: a climbing turn to near-vertical, the nose falls through the turn at low speed, a dive back the other way
    wingover: k => arc(14, t => { const a = Math.PI * t; return [k.R * 0.9 * (1 - Math.cos(a)), 1.0 * k.R * Math.sin(a), 0.35 * k.R + k.R * 0.9 * Math.sin(a)]; }),
    // pitchback: half a loop flown in a plane banked 45 degrees: the heading reverses, less height gained than an Immelmann
    pitchback: k => { const r = k.R * 0.9, s = Math.SQRT1_2; return arc(14, t => { const a = Math.PI * t, w = r * (1 - Math.cos(a)); return [w * s, w * s, 0.35 * k.R + r * Math.sin(a)]; }).concat([[2 * r * s, 2 * r * s, 0.35 * k.R - 0.5 * k.R]]); },
    // stall turn (hammerhead): straight up, pivot on the rudder at the top, straight down and pull out the other way
    stallturn: k => { const r = k.R * 0.7, h = k.R * 0.5, f0 = 0.35 * k.R;
      return arc(6, t => { const a = Math.PI / 2 * t; return [0, r * (1 - Math.cos(a)), f0 + r * Math.sin(a)]; }).concat([[0, r + h, f0 + r], [30, r + h * 0.5, f0 + r]],
        arc(6, t => { const a = Math.PI / 2 * t; return [30, r - r * Math.sin(a), f0 + r * Math.cos(a)]; }), [[30, 0, f0 - 0.4 * k.R]]); },
    // displacement (barrel) roll: a helix round the old flight path, ending displaced and on the same heading
    barrel: k => { const rr = k.R * 0.35, L = k.R * 2.4; return arc(16, t => { const a = 2 * Math.PI * t; return [rr * (1 - Math.cos(a)), rr * Math.sin(a), 0.3 * k.R + L * t]; }); },
    // high-g barrel roll: a tight, violent one at close range
    hardBarrel: k => { const rr = k.R * 0.25, L = k.R * 1.3; return arc(12, t => { const a = 2 * Math.PI * t; return [-rr * (1 - Math.cos(a)), rr * Math.sin(a), 0.2 * k.R + L * t]; }); },
    // unloaded extension: push into a straight 30 degree dive at full power, near zero G, and accelerate away
    extension: k => [[0, 0, 0.3 * k.R]].concat(arc(6, t => { const d = 3 * k.R * t; return [0, -d * 0.5, 0.3 * k.R + d * 0.866]; }).slice(1)),
    // defensive spiral: a steep descending spiral, power off and speedbrakes out
    spiral: k => { const rs = k.R * 0.55, f0 = 0.3 * k.R; return arc(18, t => { const a = 3 * Math.PI * t; return [rs * (1 - Math.cos(a)), -k.R * 0.75 * a / Math.PI, f0 + rs * Math.sin(a)]; }); },
    // break turn: a hard 90 degree turn into the attacker (to the left)
    breakLeft: k => { const rb = k.R * 0.5; return arc(8, t => { const a = Math.PI / 2 * t; return [-rb * (1 - Math.cos(a)), 0, 0.15 * k.R + rb * Math.sin(a)]; }); },
  };
  // ---- scripted aircraft: kinematic motion (position, velocity and attitude set every frame)
  function place(b, vel, bank) {
    const f = vel.clone().normalize(), r = new V3().crossVectors(f, UP); if (r.lengthSq() < 1e-6) r.set(1, 0, 0); r.normalize();
    const u = new V3().crossVectors(r, f).normalize(), cb = Math.cos(bank || 0), sb = Math.sin(bank || 0), u2 = u.clone().multiplyScalar(cb).addScaledVector(r, sb), r2 = new V3().crossVectors(f, u2).normalize();
    b.quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r2, u2, f.clone().negate())); b.vel.copy(vel); b.alive = true;
  }
  // mode: { straight: speed } | { circle: speed, radius, dir (+1 right, -1 left) } | { pursue: craft, speed, rate (rad/s), off: [x, y, f] in its frame }
  //       | { weave: speed, period, rate } | { roll: speed, radius (barrel rolls round its path) }
  function botMove(b, mode, dt, t) { const P = b.kp || (b.kp = b.pos.clone()); botStep(b, mode, dt, t, P); b.pos.copy(P); }
  function botStep(b, mode, dt, t, P) {
    const f = b.vel.lengthSq() > 1 ? b.vel.clone().normalize() : new V3(0, 0, -1).applyQuaternion(b.quat);
    if (mode.straight) { P.addScaledVector(f, mode.straight * dt); place(b, f.multiplyScalar(mode.straight), 0); return; }
    if (mode.circle) { const w = mode.circle / mode.radius * (mode.dir || -1); const nf = f.clone().applyAxisAngle(UP, -w * dt); nf.y = 0; nf.normalize(); P.addScaledVector(nf, mode.circle * dt); place(b, nf.multiplyScalar(mode.circle), Math.atan(mode.circle * mode.circle / (9.81 * mode.radius)) * (mode.dir || -1)); return; }
    if (mode.weave) { const dir = Math.sin(t * Math.PI * 2 / mode.period) > 0 ? 1 : -1, nf = f.clone().applyAxisAngle(UP, -dir * mode.rate * dt); nf.y *= 0.9; nf.normalize(); P.addScaledVector(nf, mode.weave * dt); place(b, nf.multiplyScalar(mode.weave), dir * 1.1); return; }
    if (mode.roll) { b.rollA = (b.rollA || 0) + dt * 0.9; const base = b.rollBase || (b.rollBase = { o: b.pos.clone(), f: f.clone().setY(0).normalize() }), r = new V3().crossVectors(base.f, UP).normalize();
      base.o.addScaledVector(base.f, mode.roll * dt); const a = b.rollA, np = base.o.clone().addScaledVector(r, mode.radius * (1 - Math.cos(a))).addScaledVector(UP, mode.radius * Math.sin(a));
      const v = np.clone().sub(P).divideScalar(Math.max(dt, 1e-3)); P.copy(np); place(b, v.lengthSq() > 1 ? v : base.f.clone().multiplyScalar(mode.roll), a); return; }
    if (mode.pursue) { const tg = mode.pursue, F = frame(tg), aim = mode.off ? at(F, ...mode.off) : tg.pos.clone(), want = aim.sub(b.pos).normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, f.dot(want)))), k = ang > 1e-4 ? Math.min(1, (mode.rate || 0.5) * dt / ang) : 1, nf = f.clone().lerp(want, k).normalize();
      const side = Math.sign(new V3().crossVectors(f, nf).y) || 0; P.addScaledVector(nf, mode.speed * dt); place(b, nf.multiplyScalar(mode.speed), -side * Math.min(1.3, ang * 8)); }
  }
  const park = b => { b.pos.set(0, 9000, 60000); b.vel.set(0, 0, -1); b.kp = null; };
  // tracers the attacker fires past the player (they never hit: a drill)
  function spray(m, from, to) { const d = to.pos.clone().addScaledVector(to.vel, 0.4).sub(from.pos).normalize(); d.x += (Math.random() - 0.5) * 0.03; d.y += (Math.random() - 0.5) * 0.03; d.z += (Math.random() - 0.5) * 0.03;
    m.combat.bullet(from.pos.clone().addScaledVector(d, 8), d.normalize().multiplyScalar(850).add(from.vel), from, { dmg: 0, pen: 0, fire: 0, he: 0, struct: 0, cal: 12.7 }, [1, 0.8, 0.4], 2, true); }
  function bot(m, id) { return m.crafts.find(c => c.spec && c.spec.tid === id); }
  // ---- the guide: rings and a line in the 3D scene
  const RING = new THREE.TorusGeometry(1, 0.018, 6, 36), ringMat = () => new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  function clearGuide(m, T) { if (T.guide) { m.scene.remove(T.guide); T.guide.traverse(o => { if (o.material) o.material.dispose(); if (o.geometry && o.geometry !== RING) o.geometry.dispose(); }); T.guide = null; } }
  function buildGates(m, T, pts, R) {
    clearGuide(m, T); const S = T.S; S.gates = pts; S.gi = 0; S.gR = R; S.far = 0;
    const grp = new THREE.Group(); T.guide = grp; m.scene.add(grp);
    S.rings = pts.map((q, i) => { const tg = (pts[i + 1] || q).clone().sub(pts[i - 1] || q).normalize(); const r = new THREE.Mesh(RING, ringMat()); r.position.copy(q); r.scale.setScalar(R * 0.7); r.lookAt(q.clone().add(tg)); grp.add(r); return r; });
    const curve = new THREE.CatmullRomCurve3(pts), line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(pts.length * 8)), new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    grp.add(line); S.line = line;
  }
  function guideRel(m, T, q, r) { // one moving ring and a line to it
    const S = T.S; if (!T.guide) { const grp = new THREE.Group(); T.guide = grp; m.scene.add(grp); S.relRing = new THREE.Mesh(RING, ringMat()); grp.add(S.relRing);
      S.relLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]), new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.5, depthWrite: false, fog: false })); grp.add(S.relLine); }
    S.relRing.position.copy(q); S.relRing.scale.setScalar(r); S.relRing.lookAt(m.player.pos); S.relLine.geometry.setFromPoints([m.player.pos.clone().add(new V3(0, -3, 0)), q]);
  }
  // per frame: scripted aircraft, gates passed, the moving ring reached
  function guide(m, T, st, c, dt) {
    const S = T.S, p = m.player;
    if (!S.setup) { S.setup = true; S.F = frame(p); S.k = { R: turnR(p), v: p.speed }; S.bt = 0; clearGuide(m, T);
      for (const b of m.crafts) if (b !== p && b.spec && b.spec.tid) { park(b); b.rollA = 0; b.rollBase = null; }
      if (st.setup) st.setup(c, S.F, S.k);
      if (st.gates) buildGates(m, T, st.gates(S.k).map(q => at(S.F, ...q)), Math.max(45, S.k.R * (st.gateR || 0.22))); }
    S.bt += dt;
    if (st.script) st.script(c, dt, S.bt);
    for (const b of m.crafts) if (b !== p && b.spec && b.spec.tid && b.pos.z > 50000) { park(b); }
    if (S.gates) {
      while (S.gi < S.gates.length) { const g = S.gates[S.gi], tg = (S.gates[S.gi + 1] || g).clone().sub(S.gates[S.gi - 1] || g).normalize(), to = p.pos.clone().sub(g);
        if (to.length() < S.gR || (to.dot(tg) > 0 && to.clone().addScaledVector(tg, -to.dot(tg)).length() < S.gR * 2.2)) { S.gi++; continue; }
        // flying a tighter or wider line than drawn is fine: reaching one of the next rings counts for the ones before it
        let skip = -1; for (let j = S.gi + 1; j < Math.min(S.gates.length, S.gi + 4); j++) if (p.pos.distanceTo(S.gates[j]) < S.gR * 1.3) skip = j;
        if (skip >= 0) { S.gi = skip + 1; continue; } break; }
      S.rings.forEach((r, i) => { r.visible = i >= S.gi && i < S.gi + 6; r.material.opacity = i === S.gi ? 0.95 : 0.35; r.material.color.setHex(i === S.gi ? 0xffd34d : 0xffffff); });
      // strayed far from the next ring for a while: the path is laid out again from here
      if (S.gi < S.gates.length) { const d = p.pos.distanceTo(S.gates[S.gi]); S.far = d > Math.max(1500, S.k.R * 4) ? S.far + dt : 0; if (S.far > 4) { S.setup = false; S.again = (S.again || 0) + 1; } }
      else if (T.guide) clearGuide(m, T);
    }
    if (st.rel) { const who = bot(m, st.rel.who); if (!S.ri) S.ri = 0;
      if (who && S.ri < st.rel.pts.length) { const q = at(frame(who), ...st.rel.pts[S.ri]), r = st.rel.r || 90; guideRel(m, T, q, r); if (p.pos.distanceTo(q) < r * 1.4) S.ri++; }
      else if (T.guide) clearGuide(m, T); }
  }
  const gatesDone = c => c.S.gates && c.S.gi >= c.S.gates.length;
  const relDone = (c, st) => c.S.ri >= st.rel.pts.length;
  const prog = c => c.S.gates ? ` (ring ${Math.min(c.S.gi + 1, c.S.gates.length)} of ${c.S.gates.length})` : '';
  // is aircraft a ahead of b (in b's direction of flight)?
  const ahead = (a, b) => a.pos.clone().sub(b.pos).dot(b.vel.clone().normalize()) > 0;
  // count turn reversals (the bank changes side past +-35 degrees)
  function reversals(c) { const b = bankDeg(c.p), s = b > 35 ? 1 : b < -35 ? -1 : 0; if (s && s !== c.S.side) { if (c.S.side) c.S.rev = (c.S.rev || 0) + 1; c.S.side = s; } return c.S.rev || 0; }
  // place / move a lesson's scripted aircraft by its id (it is brought back if it was shot down)
  function put(c, id, pos, vel) { const b = bot(c.m, id); if (!b) return; if (!b.alive || b.dm.destroyed) c.m.spawnCraft(b); b.kp = pos.clone(); b.pos.copy(pos); place(b, vel, 0); }
  function move(c, id, mode, dt, t) { const b = bot(c.m, id); if (b && b.alive) botMove(b, mode, dt, t || c.S.bt); }
  // the wingman's gun pass: in range behind the attacker he fires, and after a second's burst the attacker goes down
  function wingmanGuns(c, w, a, dt, range, cone) {
    if (!w || !a || !a.alive) return; const to = a.pos.clone().sub(w.pos), d = to.length(), fw = w.vel.clone().normalize();
    if (d < (range || 600) && to.dot(fw) / d > (cone == null ? 0.9 : cone)) { if ((c.S.wst = (c.S.wst || 0) - dt) < 0) { c.S.wst = 0.08; spray(c.m, w, a); } c.S.gunT = (c.S.gunT || 0) + dt;
      if (c.S.gunT > 1.2) { FX.explosion(a.pos.clone(), 1.6, false); a.dm.destroyed = true; c.m.onCrash(a, false); a.alive = false; c.S.kill = true; } }
  }
  const LIST = [
    { id: 'basics', cat: 'mech', name: 'Flight basics', icon: '🛩️', plane: 'spit9', desc: 'Mouse-aim flying, throttle and emergency power, rolling with the keys, the camera and zoom. Fly through three waypoints.',
      start: { alt: 1200 },
      steps: [
        { text: () => `The aircraft flies towards your mouse aim (the small circle). Move the mouse to turn, and fly through the waypoint marker.`, wp: V(1500, 1300, -2500), done: c => c.near(260) },
        { text: () => `Hold ${K('throttleUp')} to open the throttle to 100%. Keep holding it past 100% for emergency power (WEP).`, done: c => c.p.ctl.throttle > 1.01 },
        { text: () => `Roll with ${K('rollLeft')} / ${K('rollRight')}: roll past 60° of bank to the left. Let go and the aircraft holds the bank in a level turn.`, done: c => bankDeg(c.p) < -60 },
        { text: () => `Fly through the next waypoint.`, wp: V(-1800, 1100, -4200), done: c => c.near(260) },
        { text: () => `Press ${K('camera')} to change to the cockpit view (and back again later).`, done: c => c.G.camMode === 'nose' },
        { text: () => `Hold ${K('zoom')} to zoom in.`, done: c => Input.down('zoom') },
        { text: () => `Fly through the last waypoint.`, wp: V(0, 1500, -6500), done: c => c.near(260) },
      ] },
    { id: 'takeoff', cat: 'man', name: 'How to take off', icon: '🛫', plane: 'p51d', realistic: true, desc: 'From a standing start on the runway: power, the take-off roll, rotating at the right speed, raising the gear and climbing out (Realistic mode).',
      airfield: true,
      steps: [
        { text: c => `You are at the start of the runway. Hold ${K('throttleUp')} to open the throttle fully.`, done: c => c.p.ctl.throttle >= 0.98 },
        { text: c => `Keep straight with the mouse (it steers the tail wheel) and let the speed build. Rotate at about ${Math.round(c.p.perf.vs * 1.3 * 3.6)} km/h.`, done: c => c.p.speed > c.p.perf.vs * 1.3 },
        { text: () => `Pull the mouse up gently to lift the nose and fly off the runway.`, done: c => !c.p.onGround && agl(c.m, c.p) > 15 },
        { text: () => `Raise the landing gear with ${K('gear')}: it drags and slows the climb.`, done: c => !c.p.gearDown },
        { text: () => `Climb to 600 m above the ground at full power.`, done: c => agl(c.m, c.p) > 600 },
      ] },
    { id: 'landing', cat: 'man', name: 'How to land', icon: '🛬', plane: 'p51d', realistic: true, desc: 'A straight-in approach to your home airfield: slowing down, flaps, gear, lining up, the flare and touchdown, then stopping to refuel and rearm (Realistic mode).',
      airfield: true, approach: true,
      steps: [
        { text: () => `You are on a long final approach. Throttle back with ${K('throttleDown')} to below 30%.`, done: c => c.p.ctl.throttle < 0.3 },
        { text: c => `Let the speed bleed off below ${Math.round(c.p.perf.vs * 2.1 * 3.6)} km/h, then lower the flaps fully with ${K('flapsDown')} (press it a few times).`, done: c => c.p.speed < c.p.perf.vs * 2.1 && c.p.flaps >= Craft.FLAP_NAMES.length - 1 },
        { text: () => `Lower the landing gear with ${K('gear')}.`, done: c => c.p.gearDown },
        { text: () => `Line up with the runway centreline: wings level, nose on the far end of the runway.`, done: c => c.lined(70, 8) },
        { text: c => `Descend gently towards the start of the runway. Just above it, raise the nose a little (the flare) and touch down below ${Math.round((c.p.perf.vs * 1.9 + 15) * 3.6)} km/h.`, done: c => c.p.onGround && c.p.atHome },
        { text: () => `Throttle to zero and hold ${K('brakes')} for the wheel brakes until you stop. Stay put to refuel, rearm and repair.`, done: c => c.p.serviced },
      ] },
    { id: 'turns', cat: 'man', name: 'Turns', icon: '↪️', plane: 'p51d', desc: 'The level turn (hold your height all the way round), the break turn (the hardest turn the aircraft can pull, to spoil an attacker\'s aim) and the chandelle (a climbing 180° turn that trades speed for height).',
      start: { alt: 2000 },
      steps: [
        { text: c => `Level turn: bank 60-70° (${K('rollLeft')} / ${K('rollRight')} or the mouse) and turn a full circle without gaining or losing more than 150 m. ${Math.round(Math.abs(c.turned()))}° of 360°${c.S.lost ? ' (height lost: start again)' : ''}`,
          done: c => { c.altBand(150); return Math.abs(c.turned()) >= 360; } },
        { text: c => `Break turn: roll hard to 80-90° of bank and pull with the mouse (or hold ${K('pitchUp')}): turn 90° within 5 seconds. Best so far ${Math.round(c.S.best || 0)}° in 5 s.`,
          done: c => c.window('turned', 5) >= 90 },
        { text: c => `Chandelle: from level flight, roll to about 30° of bank and pull up into a climbing turn. Finish after 180° with the wings level, slow but 250 m higher. ${Math.round(Math.abs(c.turned()))}° turned, ${Math.max(0, Math.round(c.climb()))} m gained`,
          done: c => { if (c.climb() < -100) c.restart(); return Math.abs(c.turned()) >= 160 && c.climb() >= 250 && Math.abs(bankDeg(c.p)) < 25 && upY(c.p) > 0.5; } },
      ] },
    { id: 'rolls', cat: 'man', name: 'Rolls and the loop', icon: '🔄', plane: 'p51d', desc: 'The aileron roll (a full turn around the aircraft\'s own axis) and the loop (a full circle in the vertical): the building blocks of every other maneuver.',
      start: { alt: 1800 },
      steps: [
        { text: c => `Aileron roll: from level flight, hold ${K('rollRight')} (or ${K('rollLeft')}) and roll a full 360° within 6 seconds, keeping the nose on the horizon. ${Math.round(c.S.best || 0)}° so far`,
          done: c => Math.abs(pitchDeg(c.p)) < 35 && c.window('rolled', 6) >= 330 },
        { text: c => `Loop: build speed (a shallow dive helps), then hold ${K('pitchUp')} to pull up and over the top, upside down, and back down to level flight on the same heading. ${['Pull up', 'Keep pulling over the top', 'Down the back side', 'Level out'][Math.min(c.S.ph || 0, 3)]}`,
          done: c => c.phases([() => pitchDeg(c.p) > 60, () => upY(c.p) < -0.3, () => pitchDeg(c.p) < -40, () => upY(c.p) > 0.7 && Math.abs(pitchDeg(c.p)) < 25]) && Math.abs(wrap(hdgDeg(c.p) - c.S.h0)) < 60 },
      ] },
    { id: 'reversals', cat: 'man', name: 'Immelmann and split-S', icon: '↩️', plane: 'p51d', desc: 'Two ways to turn round in a few seconds: the Immelmann (half a loop up, roll upright at the top: height gained, speed lost) and the split-S (roll inverted, half a loop down: speed gained, height lost).',
      start: { alt: 3000 },
      steps: [
        { text: c => `Immelmann: with good speed, hold ${K('pitchUp')} for half a loop. When you are upside down at the top, roll upright with ${K('rollLeft')} / ${K('rollRight')}. ${['Pull up', 'Over the top', 'Roll upright'][Math.min(c.S.ph || 0, 2)]}`,
          done: c => c.phases([() => pitchDeg(c.p) > 60, () => upY(c.p) < -0.3 && pitchDeg(c.p) < 35, () => upY(c.p) > 0.7 && Math.abs(pitchDeg(c.p)) < 25]) && Math.abs(wrap(hdgDeg(c.p) - c.S.h0)) > 135 && c.climb() > 150 },
        { text: c => `Split-S: roll upside down with ${K('rollLeft')} / ${K('rollRight')}, then hold ${K('pitchUp')} to pull through half a loop downwards and level out the other way. Keep at least 1,000 m of height for it. ${['Roll inverted', 'Pull down', 'Pull through and level out'][Math.min(c.S.ph || 0, 2)]}`,
          done: c => c.phases([() => upY(c.p) < -0.5 && Math.abs(pitchDeg(c.p)) < 30, () => pitchDeg(c.p) < -45, () => upY(c.p) > 0.7 && Math.abs(pitchDeg(c.p)) < 25]) && Math.abs(wrap(hdgDeg(c.p) - c.S.h0)) > 135 && c.climb() < -150 },
      ] },
    // ---- basic fighter maneuvers (Wikipedia: "Basic fighter maneuvers"), each with rings to fly through or a moving
    // ring to reach relative to the other aircraft, which fly scripted paths
    { id: 'vertical', cat: 'man', name: 'Wingover, pitchback and stall turn', icon: '🎢', plane: 'p51d', desc: 'Three ways to turn round using the vertical: the wingover (a climbing turn that falls through at the top), the pitchback (half a loop banked 45°) and the stall turn or hammerhead (straight up, pivot, straight down). Fly through the rings.',
      start: { alt: 2200 },
      steps: [
        { text: c => `Wingover: pull up into a climbing turn to the right, let the nose fall through the turn at the top as the speed bleeds off, and dive back the other way. Fly through the rings${prog(c)}.`, gates: k => PATH.wingover(k), done: gatesDone },
        { text: c => `Pitchback: roll to 45° of bank and pull (mouse up, or hold ${K('pitchUp')}) through half a loop in that tilted plane. You come out heading back the way you came, higher${prog(c)}.`, gates: k => PATH.pitchback(k), done: gatesDone },
        { text: c => `Stall turn: dive a little for speed, then pull straight up (hold ${K('pitchUp')}). As the speed runs out (under ~90 km/h) kick full rudder (${K('yawRight')}) with full power to pivot over, dive straight down and pull out the other way. ${['Pull up to the vertical', 'Hold it until the speed is gone', 'Full rudder: pivot the nose down', 'Pull out of the dive'][Math.min(c.S.ph || 0, 3)]}.`, gates: k => PATH.stallturn(k), gateR: 0.32, // the rings show the shape; the climb's height depends on the aircraft, so the phases decide
          done: c => c.phases([() => pitchDeg(c.p) > 70, () => c.p.speed < 26 && pitchDeg(c.p) > 40, () => pitchDeg(c.p) < -55, () => Math.abs(pitchDeg(c.p)) < 20 && upY(c.p) > 0.7]) && Math.abs(wrap(hdgDeg(c.p) - c.S.h0)) > 120 },
      ] },
    { id: 'energy', cat: 'man', name: 'Extension and the defensive spiral', icon: '🌀', plane: 'p51d', desc: 'Energy as a weapon: the unloaded extension (push over to zero G and accelerate away from a fight) and the defensive spiral (a steep, slow spiral dive with the power off and the brakes out, to make a faster attacker overshoot).',
      start: { alt: 3500 },
      steps: [
        { text: c => `Unloaded extension: full power (${K('throttleUp')}), push the nose into a 30° dive and hold it there with almost no G. Accelerate away through the rings and gain 15% speed${prog(c)}.`, gates: k => PATH.extension(k), done: c => gatesDone(c) && c.p.speed > c.S.k.v * 1.15 },
        { text: c => `Defensive spiral: throttle back (${K('throttleDown')}), brakes out (${K('brakes')}), roll steeply right and spiral down through the rings. Pull out at the bottom${prog(c)}.`, gates: k => PATH.spiral(k), done: gatesDone },
      ] },
    { id: 'defence', cat: 'man', fits: pl => pl.guns.length > 0, name: 'Defensive maneuvers', icon: '🛡️', plane: 'p51d', desc: 'An enemy fighter gets behind you: the break (a hard turn across his path), guns defense (jinking), the high-g barrel roll that makes a fast attacker overshoot, and the answer to his high yo-yo.',
      start: { alt: 3000 }, bots: () => [target('a1', 'bf109g', 0, 3000, 9000)],
      steps: [
        { text: c => `An attacker is closing from behind on your left (hold ${K('freeLook')} and move the mouse to look back). Break: roll hard left and pull, turning across his path into him. Fly the rings${prog(c)}.`, gates: k => PATH.breakLeft(k), gateR: 0.3,
          setup: (c, F, k) => put(c, 'a1', at(F, -260, 60, -1200), F.f.clone().multiplyScalar(k.v * 1.15)), script: (c, dt) => move(c, 'a1', { pursue: c.p, speed: c.S.k.v * 1.15, rate: 0.3 }, dt), done: gatesDone },
        { text: c => `Guns defense: he is in firing range behind you. Jink: reverse your turn and change your pitch every second or two so his aim never settles. Reversals ${Math.min(4, reversals(c))} of 4.`,
          setup: (c, F, k) => put(c, 'a1', at(F, 30, 20, -350), F.f.clone().multiplyScalar(k.v)), script: (c, dt, t) => { move(c, 'a1', { pursue: c.p, speed: c.p.speed, rate: 0.5, off: [0, 0, -300] }, dt); if ((c.S.st = (c.S.st || 0) - dt) < 0) { c.S.st = 0.1; spray(c.m, bot(c.m, 'a1'), c.p); } },
          done: c => c.S.bt > 6 && reversals(c) >= 4 },
        { text: c => `He is closing fast right behind you. High-g barrel roll: pull up hard and roll over the top through the rings. He overshoots and ends up in front of you${prog(c)}.`, gates: k => PATH.hardBarrel(k), gateR: 0.3,
          setup: (c, F, k) => put(c, 'a1', at(F, 0, 10, -500), F.f.clone().multiplyScalar(k.v * 1.35)), script: (c, dt) => move(c, 'a1', { pursue: c.p, speed: c.S.k.v * 1.35, rate: 0.12 }, dt), done: c => gatesDone(c) && ahead(bot(c.m, 'a1'), c.p) },
        { text: c => `He pulls up into a high yo-yo above and behind you. ${!c.S.tf ? `Unload: ease off the pull (let the G drop below 1.5) for 2 seconds to win back speed. ${Math.min(2, c.S.ul || 0).toFixed(1)} s` : `Now turn hard into him again: 90° of turn. ${Math.round(Math.abs(c.turned() - c.S.tf))}°`}`,
          setup: (c, F, k) => put(c, 'a1', at(F, 150, 250, -600), F.f.clone().multiplyScalar(k.v * 1.05)), script: (c, dt) => { move(c, 'a1', { pursue: c.p, speed: c.S.k.v * 1.05, rate: 0.25, off: [0, 250, -400] }, dt); if ((c.p.gLoad || 1) < 1.5) c.S.ul = (c.S.ul || 0) + dt; },
          done: c => { if (c.S.tf == null && (c.S.ul || 0) >= 2) c.S.tf = c.turned(); return c.S.tf != null && Math.abs(c.turned() - c.S.tf) >= 90; } },
      ] },
    { id: 'offence', cat: 'man', fits: pl => pl.guns.length > 0, name: 'Attacking maneuvers', icon: '⚔️', plane: 'p51d', desc: 'Getting a gun shot: the high-side guns pass (dive on a lower target, one fast pass, zoom back up), the barrel roll attack against a target that breaks, and the lag displacement roll that stops you overshooting.',
      start: { alt: 3500 }, bots: () => [target('t1', 'b25j', 0, 2300, 0)],
      steps: [
        { text: c => `High-side guns pass: a bomber flies below you. Dive on its rear quarter from above and to the side (first ring), sweep through the firing position close behind it, then zoom back up with your speed. Ring ${Math.min((c.S.ri || 0) + 1, 3)} of 3.`,
          setup: (c, F, k) => put(c, 't1', at(F, 300, -1200, 2500), F.f.clone().multiplyScalar(k.v * 0.7)), script: (c, dt) => move(c, 't1', { straight: c.S.k.v * 0.7 }, dt),
          rel: { who: 't1', pts: [[600, 700, -900], [60, 25, -130], [-300, 600, -500]], r: 110 }, done: (c, st) => relDone(c, st) },
        { text: c => `Barrel roll attack: the target breaks hard left in front of you. Don't try to out-turn it: pull up and roll over the outside of its turn through the rings, and come down behind it. Ring ${Math.min((c.S.ri || 0) + 1, 4)} of 4.`,
          setup: (c, F, k) => { put(c, 't1', at(F, 0, 0, 700), F.f.clone().multiplyScalar(k.v * 0.8)); }, script: (c, dt) => move(c, 't1', { circle: c.S.k.v * 0.8, radius: c.S.k.R * 0.7, dir: -1 }, dt),
          rel: { who: 't1', pts: [[220, 250, -350], [260, 380, -150], [120, 200, -220], [0, 30, -300]], r: 110 }, done: (c, st) => relDone(c, st) },
        { text: c => `Lag roll: you are cutting inside its turn and about to overshoot. Roll up and away to the outside of its turn (the ring), let your nose fall back behind it and settle into lag pursuit behind it. Ring ${Math.min((c.S.ri || 0) + 1, 2)} of 2.`,
          setup: (c, F, k) => put(c, 't1', at(F, -350, 0, 500), F.f.clone().multiplyScalar(k.v * 0.85)), script: (c, dt) => move(c, 't1', { circle: c.S.k.v * 0.85, radius: c.S.k.R * 0.75, dir: -1 }, dt),
          rel: { who: 't1', pts: [[260, 180, -200], [0, 0, -400]], r: 110 }, done: (c, st) => relDone(c, st) },
      ] },
    { id: 'yoyo', cat: 'man', fits: pl => pl.guns.length > 0, name: 'High and low yo-yo', icon: '🪀', plane: 'p51d', desc: 'Using the vertical to stay behind a turning target: the low yo-yo (drop inside its turn to gain speed and cut the corner) and the high yo-yo (climb out of its turn so you do not overshoot).',
      start: { alt: 3000 }, bots: () => [target('t1', 'bf109g', 0, 3000, 0)],
      steps: [
        { text: c => `Low yo-yo: the target turns left and you are too far behind to catch it in a level turn. Drop your nose inside its turn (below and inside), let gravity add speed as you cut the corner, then pull back up behind it. Ring ${Math.min((c.S.ri || 0) + 1, 3)} of 3.`,
          setup: (c, F, k) => put(c, 't1', at(F, -400, 0, 1300), F.f.clone().multiplyScalar(k.v)), script: (c, dt) => move(c, 't1', { circle: c.S.k.v, radius: c.S.k.R * 0.75, dir: -1 }, dt),
          rel: { who: 't1', pts: [[-150, -250, -700], [-120, -120, -450], [0, 0, -280]], r: 120 }, done: (c, st) => relDone(c, st) },
        { text: c => `High yo-yo: you are faster and closing so quickly you would overshoot. Ease off and pull up out of its turn (above and outside), let gravity slow you, then roll back in and drop in behind it. Ring ${Math.min((c.S.ri || 0) + 1, 3)} of 3.`,
          setup: (c, F, k) => put(c, 't1', at(F, -200, 0, 500), F.f.clone().multiplyScalar(k.v * 0.75)), script: (c, dt) => move(c, 't1', { circle: c.S.k.v * 0.75, radius: c.S.k.R * 0.6, dir: -1 }, dt),
          rel: { who: 't1', pts: [[160, 300, -350], [80, 160, -280], [0, 0, -280]], r: 120 }, done: (c, st) => relDone(c, st) },
      ] },
    { id: 'scissors', cat: 'man', fits: pl => pl.guns.length > 0, name: 'Flat and rolling scissors', icon: '✂️', plane: 'p51d', desc: 'When both fighters end up side by side: the flat scissors (repeated turn reversals into each other, each trying to fall in behind) and the rolling scissors (the same in the vertical, rolling over the top of each other).',
      start: { alt: 3000 }, bots: () => [target('t1', 'bf109g', 0, 3000, 0)],
      steps: [
        { text: c => `Flat scissors: you are side by side, both slowing down. Each time it turns into you, reverse your turn into it as well, staying within 1 km. Reversals ${Math.min(4, reversals(c))} of 4.`,
          setup: (c, F, k) => put(c, 't1', at(F, 150, 0, 80), F.f.clone().multiplyScalar(k.v * 0.85)), script: (c, dt, t) => move(c, 't1', { weave: c.S.k.v * 0.85, period: 7, rate: 0.35 }, dt, t),
          done: c => reversals(c) >= 4 && bot(c.m, 't1').pos.distanceTo(c.p.pos) < 1200 },
        { text: c => `Rolling scissors: it climbs and rolls over the top of you. Roll over the top as well, the other way round, each time it does: go over the top inverted twice, staying within 1.5 km. ${c.S.inv || 0} of 2.`,
          setup: (c, F, k) => put(c, 't1', at(F, 100, 60, 200), F.f.clone().multiplyScalar(k.v * 0.8)), script: (c, dt) => { move(c, 't1', { roll: c.S.k.v * 0.8, radius: 160 }, dt); const inv = upY(c.p) < -0.3; if (inv && !c.S.wasInv) c.S.inv = (c.S.inv || 0) + 1; c.S.wasInv = inv; },
          done: c => (c.S.inv || 0) >= 2 && bot(c.m, 't1').pos.distanceTo(c.p.pos) < 1500 },
      ] },
    { id: 'twoship', cat: 'man', fits: pl => pl.guns.length > 0, name: 'Two-ship tactics', icon: '👥', plane: 'p51d', desc: 'Flying with a wingman: combat spread, the defensive split, the sandwich and the Thach weave, against attackers that try to get behind you.',
      start: { alt: 3000 }, bots: () => [target('w1', 'p51d', 0, 3000, 3000, { team: 0, name: 'Wingman' }), target('a1', 'bf109g', 0, 3000, 9000), target('a2', 'bf109g', 300, 3000, 9000)],
      steps: [
        { text: c => `Combat spread: you are the high wingman. Fly about 1.6 km (a mile) to the right of your leader and 450 m (1,500 ft) above him, and hold that position (the ring) for 6 seconds. ${(c.S.hold || 0).toFixed(1)} s`,
          setup: (c, F, k) => put(c, 'w1', at(F, -1200, -350, 300), F.f.clone().multiplyScalar(k.v * 0.92)),
          script: (c, dt) => { move(c, 'w1', { straight: c.S.k.v * 0.92 }, dt); const q = at(frame(bot(c.m, 'w1')), 1600, 450, 0); guideRel(c.m, c.T, q, 250); c.S.hold = c.p.pos.distanceTo(q) < 320 ? (c.S.hold || 0) + dt : 0; },
          done: c => (c.S.hold || 0) >= 6 },
        { text: c => `Defensive split: two attackers are coming in behind you both. Your wingman breaks left; you break hard right, so they must split up or let one of you go free. Turn 90°: ${Math.round(Math.min(90, Math.abs(c.turned())))}°`,
          setup: (c, F, k) => { put(c, 'w1', at(F, -600, 0, 0), F.f.clone().multiplyScalar(k.v)); put(c, 'a1', at(F, -400, 50, -1500), F.f.clone().multiplyScalar(k.v * 1.1)); put(c, 'a2', at(F, -200, 50, -1600), F.f.clone().multiplyScalar(k.v * 1.1)); },
          script: (c, dt, t) => { move(c, 'w1', t < 1 ? { straight: c.S.k.v } : { circle: c.S.k.v, radius: c.S.k.R * 0.5, dir: -1 }, dt); move(c, 'a1', { pursue: c.p, speed: c.S.k.v * 1.1, rate: 0.3 }, dt); move(c, 'a2', { pursue: bot(c.m, 'w1'), speed: c.S.k.v * 1.1, rate: 0.3 }, dt); },
          done: c => Math.abs(c.turned()) >= 85 },
        { text: c => `Sandwich: the attacker is on your tail and your wingman is out to your left. Turn hard right, away from him, and keep turning: the attacker follows you across your wingman's nose and your wingman turns in behind him.${c.S.kill ? ' Splash one!' : ''}`,
          setup: (c, F, k) => { put(c, 'w1', at(F, -900, 0, 0), F.f.clone().multiplyScalar(k.v)); put(c, 'a1', at(F, 0, 30, -900), F.f.clone().multiplyScalar(k.v * 1.05)); },
          script: (c, dt) => { const w = bot(c.m, 'w1'), a = bot(c.m, 'a1'); move(c, 'a1', { pursue: c.p, speed: c.S.k.v * 1.05, rate: 0.3 }, dt);
            move(c, 'w1', Math.abs(c.turned()) > 40 ? { pursue: a, speed: c.S.k.v * 1.35, rate: 0.5, off: [0, 0, -250] } : { straight: c.S.k.v }, dt);
            wingmanGuns(c, w, a, dt, 800, 0.8); },
          done: c => !bot(c.m, 'a1').alive },
        { text: c => `Thach weave: the attacker is behind you; your wingman flies 600 m to your left. Turn toward your wingman and cross his path; he turns toward you, and the attacker following you is drawn into his guns. Crossings ${Math.min(2, c.S.cross || 0)} of 2.${c.S.kill ? ' Splash one!' : ''}`,
          setup: (c, F, k) => { put(c, 'w1', at(F, -600, 0, 0), F.f.clone().multiplyScalar(k.v)); put(c, 'a1', at(F, 0, 30, -900), F.f.clone().multiplyScalar(k.v * 1.03)); },
          script: (c, dt, t) => { const w = bot(c.m, 'w1'), a = bot(c.m, 'a1'); move(c, 'a1', { pursue: c.p, speed: c.S.k.v * 1.03, rate: 0.3 }, dt);
            const side = Math.sign(c.p.pos.clone().sub(w.pos).dot(frame(w).r)); if (c.S.side0 && side && side !== c.S.side0) c.S.cross = (c.S.cross || 0) + 1; if (side) c.S.side0 = side;
            move(c, 'w1', (c.S.cross || 0) >= 2 ? { pursue: a, speed: c.S.k.v * 1.15, rate: 0.45, off: [0, 0, -250] } : { pursue: c.p, speed: c.S.k.v, rate: 0.25, off: [0, 0, 300] }, dt);
            if ((c.S.cross || 0) >= 2) wingmanGuns(c, w, a, dt, 1500, -1); }, // the attacker crossing his nose: a deflection shot
          done: c => (c.S.cross || 0) >= 2 && !bot(c.m, 'a1').alive },
      ] },
    { id: 'gunnery', cat: 'mech', fits: pl => pl.guns.length > 0, name: 'Air gunnery', icon: '🎯', plane: 'bf109g', desc: 'Lead the target with the lead indicator and shoot down three unarmed target aircraft. Fire when the indicator turns white and says FIRE.',
      start: { alt: 1500 },
      bots: () => [target('t1', 'b25j', -300, 1500, -1600), target('t2', 'b25j', 900, 1600, -2600), target('t3', 'b25j', -1200, 1400, -3600)],
      steps: [
        { text: () => `Three target bombers are ahead (red markers). Turn towards the nearest one.`, done: c => c.G.target && c.G.target.pos.distanceTo(c.p.pos) < 1200 },
        { text: () => `Lead the target: put your aim on the lead indicator (the circle ahead of it, shown in the outside view) and hold ${K('fire')} when it turns white and says FIRE. In the cockpit you aim with the aircraft's own gunsight instead.`, done: c => c.kills() >= 1 },
        { text: () => `Shoot down the other two. Fire short bursts: your ammunition runs out quickly.`, done: c => c.kills() >= 3 },
      ] },
    { id: 'bombing', cat: 'mech', fits: pl => !!pl.bombsight && carries(pl, s => s.kind === 'b'), name: 'Level bombing with a bombsight', icon: '💣', plane: 'b17g', realistic: true, desc: 'A B-17G with its Norden bombsight: look through the sight, steer the target down the course hair and release at the cross hair to destroy a factory from 3,000 m.',
      start: { alt: 3000, z: 7500 }, lo: pl => loadout(pl, 'b'), target: { size: 'medium', kind: 'factory', x: 0, z: -2000 },
      steps: [
        { text: () => `A factory is straight ahead. Press ${K('bombsight')} to look through the Norden bombsight.`, done: c => c.G.camMode === 'sight' },
        { text: () => `The cross hair marks where a bomb released now would land. Steer gently (mouse or ${K('rollLeft')} / ${K('rollRight')}) so the target slides down the vertical course hair.`, done: c => c.onCourse(250) },
        { text: () => `Release the bombs with ${WK(s => s.kind === 'b')} just as the target meets the cross hair. Each press drops two.`, done: c => c.p.count('b') < c.full },
        { text: () => `Keep dropping until the factory is destroyed. Out of bombs? They are reloaded for another pass.`, done: c => { const b = enemyBase(c.m); if (b && !b.dead && !c.p.count('b') && !c.m.combat.bombs.length) c.reload(); return b && b.dead; } },
      ] },
    { id: 'divebomb', cat: 'mech', fits: pl => carries(pl, s => s.kind === 'b'), name: 'Dive bombing', icon: '⬇️', plane: 'ju87', desc: 'The Ju 87 Stuka: fly over the target, extend the dive brakes, dive at 60-80°, release low and pull out.',
      start: { alt: 2500, z: 4000 }, lo: pl => loadout(pl, 'b'), target: { size: 'small', kind: 'camp', x: 0, z: -1500 },
      steps: [
        { text: () => `Fly towards the camp ahead until it is almost under you.`, done: c => c.hdist(enemyBase(c.m).pos) < 700 },
        { text: () => `Hold ${K('brakes')} to extend the dive brakes, then push the nose down: aim the mouse at the target and dive steeper than 60°.`, done: c => diveDeg(c.p) < -60 },
        { text: () => `Keep the target in the middle and release with ${WK(s => s.kind === 'b')} below 1,000 m.`, done: c => c.p.count('b') < c.full && agl(c.m, c.p) < 1100 },
        { text: () => `Pull out! Let go of the brakes and climb away.`, done: c => c.p.vel.y > 0 && agl(c.m, c.p) > 150 },
        { text: () => `Did it hit? Make more passes until the camp is destroyed (bombs are reloaded when you run out).`, done: c => { const b = enemyBase(c.m); if (b && !b.dead && !c.p.count('b') && !c.m.combat.bombs.length) c.reload(); return b && b.dead; } },
      ] },
    { id: 'ccip', cat: 'mech', fits: pl => pl.kind === 'jet' && carries(pl, s => s.kind === 'b'), name: 'Jet bombing with CCIP', icon: '🎯', plane: 'f16c', desc: 'The F-16C with Mk 82 bombs: the head-up display computes the impact point continuously (CCIP). Dive at the target, fly the pipper onto it and release.',
      start: { alt: 2500, z: 6000 }, lo: pl => loadout(pl, 'b', ['mk82']), target: { size: 'small', kind: 'camp', x: 0, z: -1500 },
      steps: [
        { text: () => `A camp is ahead. Fly towards it and line it up straight ahead of you.`, done: c => c.onCourse(250) && c.hdist(enemyBase(c.m).pos) < 6500 },
        { text: () => `Push over into a 20-30° dive towards it (mouse, or ${K('pitchDown')}). The circle on the line below the flight-path marker is the CCIP pipper: where a bomb released now would hit.`, done: c => diveDeg(c.p) < -15 },
        { text: () => `Fly the pipper onto the camp. When it turns red and reads RELEASE, drop with ${WK(s => s.kind === 'b')}.`, done: c => c.p.count('b') < c.full },
        { text: () => `Pull out and climb away. Make more passes until the camp is destroyed (bombs are reloaded when you run out).`, done: c => { const b = enemyBase(c.m); if (b && !b.dead && !c.p.count('b') && !c.m.combat.bombs.length) c.reload(); return b && b.dead; } },
      ] },
    { id: 'rockets', cat: 'mech', fits: pl => carries(pl, s => s.kind === 'r'), name: 'Ground attack with rockets', icon: '🚀', plane: 'p47d', desc: 'The P-47D with 5-inch HVAR rockets against a column of tanks: a shallow dive, aim ahead of the target, fire in pairs.',
      start: { alt: 1200, z: 3500 }, lo: pl => loadout(pl, 'r'), tanks: 4,
      steps: [
        { text: () => `Tanks ahead (red diamonds). Line up on them in a shallow 20-30° dive.`, done: c => c.m.vehicles.list.some(v => !v.dead && v.pos.distanceTo(c.p.pos) < 1500) && diveDeg(c.p) < -10 },
        { text: () => `Fire rockets with ${WK(s => s.kind === 'r')}: they fall a little, so put the nose just above the tank.`, done: c => c.p.count('r') < c.full },
        { text: () => `Destroy two tanks.`, done: c => c.m.vehicles.list.filter(v => v.dead).length >= 2 },
      ] },
    { id: 'missiles', cat: 'mech', fits: pl => carries(pl, isIR) && carries(pl, isRadar), name: 'Air-to-air missiles', icon: '🎯', plane: 'f16c', desc: 'The F-16C with Sidewinders and AMRAAMs: getting a lock and firing, with each missile type on its own key.',
      start: { alt: 4000 }, lo: pl => missileFit(pl),
      bots: () => [target('m1', 'mig21bis', 200, 4100, -3500), target('m2', 'mig21bis', -600, 4300, -14000)],
      steps: [
        { text: () => `Point the nose at the target ahead. The ${WN(isIR)} seeker growls when it sees the heat; LOCK appears and the tone rises when it has a lock.`, done: c => c.G.locked },
        { text: () => `Fire the ${WN(isIR)} with ${WK(isIR)}.`, done: c => c.m.combat.missiles.some(x => x.owner === c.p) || c.kills() >= 1 },
        { text: () => `Wait for the hit. If it missed, lock and fire again.`, done: c => c.kills() >= 1 },
        { text: () => `The second target is 10 km out: too far for a heat seeker. Each weapon has its own key: the radar-guided ${WN(isRadar)} is on ${WK(isRadar)}. Point at the target, wait for the lock and press it.`, done: c => c.kills() >= 2 },
      ] },
    { id: 'flares', cat: 'mech', fits: pl => !!pl.chaff, name: 'Missile defence', icon: '🎆', plane: 'ef2000uk', desc: 'The Typhoon against heat seekers (flares and a hard turn) and a radar-guided missile (turn it onto your beam to notch it, get below the launcher and drop chaff). Which warnings you get depends on what your aircraft has fitted.',
      start: { alt: 4000 }, bots: () => [target('e1', 'mig29', 0, 4000, 4000, { team: 1 })],
      steps: [
        { text: c => `${c.T.inFlight ? 'MISSILE LAUNCHED behind you! ' : ''}An enemy behind you fires heat seekers. ${c.p.def.maws ? 'Your missile approach warner calls the launch.' : 'Your aircraft has no missile approach warner (heat seekers send no radar signal), so the instructor calls it.'} Release flares with ${K('flares')} and turn hard.`, launch: 'ir', done: c => c.survived >= 1 },
        { text: c => `${c.T.inFlight ? 'MISSILE LAUNCHED! ' : ''}Again: flares and a hard turn the moment the missile comes.`, launch: 'ir', done: c => c.survived >= 2 },
        { text: c => `${c.T.inFlight ? 'RADAR MISSILE INBOUND from ahead! ' : ''}A fighter 12 km ahead fires a radar-guided missile${c.p.def.rwr ? ': your radar warner sounds while its radar tracks you' : ''}. Turn 90° so it is off your wing (the notch), descend below it and release chaff with ${K('flares')}.`, launch: 'radar', done: c => c.survived >= 3 },
      ] },
  ];
  const byId = id => LIST.find(t => t.id === id);
  const CATS = [['mech', 'Basic Game Mechanics', 'Controls, weapons and defending yourself.'], ['man', 'Basic Flight Maneuvers', 'Taking off and landing, turns, rolls, the loop and the reversals pilots use in a dogfight.']];
  // the aircraft a lesson can be replayed with (any the player owns that can do it)
  const fits = (t, pl) => !!pl && !pl.aiOnly && (!t.fits || t.fits(pl));

  // ---- match planning (host): the tutorial's aircraft, bots and bases
  function plan(t, human) {
    const plane = human.plane && fits(t, PLANES[human.plane]) ? human.plane : t.plane;
    const pl = PLANES[plane], lo = t.lo ? t.lo(pl) : { belts: {}, stores: [], perSlot: true, mods: {} };
    const roster = [Object.assign({}, human, { id: 1, bot: false, team: 0, plane, loadout: lo, lives: 99 })];
    (t.bots ? t.bots() : []).forEach((b, i) => roster.push(Object.assign(b, { id: 2 + i })));
    const bases = [];
    if (t.airfield) bases.push({ id: 'B0', team: 0, size: 'medium', kind: 'airfield', x: 0, z: 0, home: true });
    if (t.target) bases.push({ id: 'T1', team: 1, size: t.target.size, kind: t.target.kind, x: t.target.x, z: t.target.z, objective: true, passive: true });
    const vehicles = []; for (let i = 0; i < (t.tanks || 0); i++) vehicles.push({ id: 'V' + i, team: 1, x: (i - 1.5) * 40, z: -400 - i * 60, h: Math.PI });
    return { mode: 'tutorial', tutorial: t.id, seed: 7, era: pl.era, map: 'land', half: 9000, roster, bases, mission: null, time: 0, respawns: 99, nid: roster.length + 1,
      realistic: !!t.realistic, homeTeams: t.airfield ? [0] : [], vehicles, weather: 'clear', night: false, size: 'medium' };
  }
  // ---- spawning: where each lesson starts (and restarts after a crash)
  function spawn(m, c) {
    const t = byId(m.cfg.tutorial), s = c.spec;
    if (s.passive && s.spawnAt) { const [x, y, z] = s.spawnAt; c.spawn(V(x, y + m.world.groundAt(x, z), z), 0, c.def.spd / 3.6 * 0.55); c.vel.setLength(c.perf.vmax * 0.55); return true; }
    if (c !== m.player && c.team === 0) return false;
    if (t.approach) { const h = home(m), r = h.runway, p = r.c.clone().addScaledVector(r.dir, -(r.len / 2 + 5500)); p.y = m.world.groundAt(p.x, p.z) + 380;
      c.spawn(p, Math.atan2(-r.dir.x, -r.dir.z), c.def.spd / 3.6 * 0.5); c.vel.setLength(c.perf.vs * 2.6); c.gearDown = false; c.onGround = false; c.ctl.throttle = 0.6; return true; }
    if (t.airfield) return false;                                          // the match puts us on the runway
    const z = t.start && t.start.z != null ? t.start.z : 2000, y = (t.start ? t.start.alt : 1500) + m.world.groundAt(0, z);
    c.spawn(V(0, y, z), 0, c.def.spd / 3.6 * 0.65); c.vel.setLength(c.perf.vmax * 0.65); return true;
  }
  // ---- runtime (host): one step at a time
  function start(m) {
    const t = byId(m.cfg.tutorial); m.tut = { t, step: 0, stepT: 0, survived: 0, launchT: 3, done: false, full: 0, S: {} };
  }
  function ctx(m) {
    const T = m.tut, p = m.player, G = Game, st = T.t.steps[T.step], S = T.S, time = m.time;
    if (S.h0 == null) { S.h0 = hdgDeg(p); S.alt0 = p.pos.y; S.hd = S.h0; S.bk = bankDeg(p); S.turned = 0; S.rolled = 0; S.hist = []; S.ph = 0; }
    const c = { m, p, G, T, S, full: T.full, survived: T.survived,
      // heading turned / bank rolled since the step began (signed, unwrapped) and height gained
      turned: () => S.turned, climb: () => p.pos.y - S.alt0,
      restart: () => { S.h0 = null; S.lost = true; },
      // keep within `band` metres of the starting height, or the measurement starts again
      altBand: band => { if (Math.abs(p.pos.y - S.alt0) > band) c.restart(); },
      // the change of `key` over the last `secs` seconds (the best so far is shown in the text)
      window: (key, secs) => { const old = S.hist.find(h => h.t >= time - secs) || S.hist[0]; const v = old ? Math.abs(S[key] - old[key]) : 0; S.best = Math.max(S.best || 0, v); return v; },
      // a maneuver as a sequence of conditions, met one after another
      phases: list => { while (S.ph < list.length && list[S.ph]()) S.ph++; return S.ph >= list.length; },
      kills: () => m.crafts.filter(c => c.team === 1 && !c.alive).length,
      near: d => st.wp && p.pos.distanceTo(st.wp) < d,
      hdist: q => Math.hypot(q.x - p.pos.x, q.z - p.pos.z),
      // lined up: within dx metres of the extended centreline and dh degrees of its heading
      lined: (dx, dh) => { const r = home(m).runway, to = p.pos.clone().sub(r.c), side = Math.abs(to.x * r.dir.z - to.z * r.dir.x), f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
        return side < dx && Math.acos(Math.max(-1, Math.min(1, (f.x * r.dir.x + f.z * r.dir.z) / Math.max(1e-3, Math.hypot(f.x, f.z))))) * 180 / Math.PI < dh; },
      // the target lies on the ground track ahead (within dx metres sideways)
      onCourse: dx => { const b = enemyBase(m); if (!b) return true; const v = new THREE.Vector3(p.vel.x, 0, p.vel.z).normalize(), to = b.pos.clone().sub(p.pos).setY(0); return to.dot(v) > 0 && Math.abs(to.x * v.z - to.z * v.x) < dx; },
      reload: () => { p.loadStores(); p.buildStoreMeshes(); T.full = p.count('b') + p.count('r'); m.events.push({ t: m.time, e: 'msg', text: 'Reloaded — make another pass' }); },
    };
    return c;
  }
  // per-frame measurement for the maneuver lessons (heading and bank changes, a short history for the time windows)
  function track(m) {
    const T = m.tut, S = T.S, p = m.player; if (S.h0 == null) return;
    const h = hdgDeg(p), b = bankDeg(p);
    if (Math.abs(pitchDeg(p)) < 75) { S.turned += wrap(h - S.hd); S.rolled += wrap(b - S.bk); } // near the vertical heading and bank mean nothing
    S.hd = h; S.bk = b; S.hist.push({ t: m.time, turned: S.turned, rolled: S.rolled }); while (S.hist.length && S.hist[0].t < m.time - 8) S.hist.shift();
  }
  function update(m, dt) {
    const T = m.tut; if (!T || T.done) return; const p = m.player; if (!p || !p.alive) return;
    if (T.stepT === 0) T.full = p.count('b') + p.count('r'); // ordnance at the start of the step
    T.stepT += dt;
    const st = T.t.steps[T.step];
    if (st.launch) missileDrill(m, T, dt, st.launch);
    track(m); const c = ctx(m); if (st.gates || st.rel || st.setup || st.script) guide(m, T, st, c, dt); const ok = st.done(c, st);
    if (T.stepT > 0.6 && ok) {
      Sound.clunk && Sound.clunk(); T.step++; T.stepT = 0; T.S = {}; clearGuide(m, T);
      if (T.step >= T.t.steps.length) { T.done = true; clearGuide(m, T); Profile.tutorialDone(T.t.id); m.end(0, 'Tutorial complete: ' + T.t.name); }
    }
  }
  // missile defence drill: the enemy closes in behind the player and fires a heat seeker; surviving it counts
  function missileDrill(m, T, dt, kind) {
    const p = m.player, e = m.crafts.find(c => c.team === 1 && c.alive);
    if (!e) { const d = m.crafts.find(c => c.team === 1); if (d) m.spawnCraft(d); return; } // shot the launcher down? it comes back
    const live = m.combat.missiles.filter(x => x.target === p);
    // it only counts if the missile missed: hit (even if the aircraft lives) and it is fired again
    if (T.inFlight && !live.length) { T.inFlight = false; T.launchT = 6;
      if (p.alive && p.lastHitT < T.firedT) T.survived++; else m.events.push({ t: m.time, e: 'msg', text: 'Hit! It will be fired again' }); }
    if (live.length) return;
    T.launchT -= dt; if (T.launchT > 0) return;
    if (kind === 'radar') { // head-on from 12 km and 1,500 m above: a semi-active missile, guided while the launcher's radar holds the player
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat).setY(0).normalize(); e.pos.copy(p.pos).addScaledVector(f, 12000); e.pos.y += 1500;
      e.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(e.pos, p.pos, new THREE.Vector3(0, 1, 0))); e.vel.copy(p.pos).sub(e.pos).setLength(220);
      m.combat.missile(e.pos.clone(), e.vel.clone(), e, Object.assign({}, STORES.r27er, { ccm: 0.5 }), p, 'r27er'); T.inFlight = true; T.firedT = m.time; T.launchT = 99; return;
    }
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quat).multiplyScalar(2600); e.pos.copy(p.pos).add(back); e.vel.copy(p.vel); e.quat.copy(p.quat);
    m.combat.missile(e.pos.clone(), p.vel.clone(), e, Object.assign({}, STORES.r73, { ccm: 0.35 }), p, 'r73'); T.inFlight = true; T.firedT = m.time; T.launchT = 99;
  }
  // ---- HUD: the instruction panel and the waypoint marker
  function draw(g, W, H, m, cam, text, proj) {
    const T = m.tut; if (!T) return; const st = T.t.steps[Math.min(T.step, T.t.steps.length - 1)];
    const msg = T.done ? 'Tutorial complete!' : st.text(ctx(m)), w = Math.min(820, W - 40), x = W / 2 - w / 2;
    // the goal is the first sentence (up to the first colon or full stop), shown on its own; the how-to follows
    const cut = msg.search(/[:.](\s|$)/), goal = cut > 0 && cut < 90 ? msg.slice(0, cut + 1) : '', rest0 = goal ? msg.slice(cut + 1).trim() : msg, rest = rest0.charAt(0).toUpperCase() + rest0.slice(1);
    const wrap = (s, font) => { g.font = font; const out = ['']; for (const wd of s.split(' ')) { const tl = out[out.length - 1] + (out[out.length - 1] ? ' ' : '') + wd; if (g.measureText(tl).width > w - 34 && out[out.length - 1]) out.push(wd); else out[out.length - 1] = tl; } return out.filter(Boolean); };
    const gl = goal ? wrap(goal, '600 17px sans-serif') : [], bl = wrap(rest, '14px sans-serif'), h = 34 + gl.length * 21 + bl.length * 18 + 22;
    g.fillStyle = 'rgba(8,14,22,0.82)'; g.beginPath(); g.roundRect ? g.roundRect(x, 10, w, h, 10) : g.rect(x, 10, w, h); g.fill();
    text(`TUTORIAL · ${T.t.name.toUpperCase()} · STEP ${Math.min(T.step + 1, T.t.steps.length)} / ${T.t.steps.length}`, W / 2, 30, '#ffd34d', 12, 'center', true);
    gl.forEach((l, i) => text(l, W / 2, 54 + i * 21, '#ffffff', 17, 'center', true));
    bl.forEach((l, i) => text(l, W / 2, 54 + gl.length * 21 + i * 18, '#d8e2ea', 14, 'center'));
    if (!T.done) text(`${K('tutorialReset')}: start this step again`, W / 2, 10 + h - 9, 'rgba(255,255,255,0.5)', 11, 'center');
    if (st.wp && !T.done) { const s = proj(st.wp, cam); if (s) { g.strokeStyle = '#ffd34d'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(s.x, s.y - 16); g.lineTo(s.x + 16, s.y); g.lineTo(s.x, s.y + 16); g.lineTo(s.x - 16, s.y); g.closePath(); g.stroke();
      text(Math.round(st.wp.distanceTo(m.player.pos)) + ' m', s.x, s.y + 32, '#ffd34d', 12, 'center', true); } }
  }
  // start the current step again (R): its measurements, its path laid out from where you are, its scripted aircraft back in place
  function restartStep(m) { const T = m.tut; if (!T || T.done) return; clearGuide(m, T); T.S = {}; T.stepT = 0; T.inFlight = false; T.launchT = 2; m.events.push({ t: m.time, e: 'msg', text: 'Step restarted' }); }
  return { LIST, CATS, byId, fits, plan, spawn, start, update, draw, ctx, restartStep, _dbg: { at, frame, bot, PATH } };
})();
