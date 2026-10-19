// ============================================================================
// Tutorials: short guided flights, picked from the Play menu. Each one puts you in an aircraft that suits the lesson
// (owned or not), sets up the scene (runway, targets, a target drone) and walks through steps, each with its own
// instruction and a check that moves on when you have done it. Keys in the instructions follow your bindings.
// In normal battles there is no instructional text; this is where it lives.
// ============================================================================
const Tutorial = (() => {
  const K = a => Input.label(Input.bind(a));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const agl = (m, p) => p.pos.y - m.world.groundAt(p.pos.x, p.pos.z);
  const bankDeg = p => { const ax = Flight.axes(p); return Math.atan2(-ax.right.y, ax.up.y) * 180 / Math.PI; };
  const diveDeg = p => Math.asin(Math.max(-1, Math.min(1, p.vel.y / Math.max(1, p.speed)))) * 180 / Math.PI;
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
  // air-to-air fit: Sidewinders on the wingtip rails, AMRAAMs on the pylons that take them
  function missileFit(pl) { const sl = Loadout.slots(pl);
    return { belts: {}, perSlot: true, mods: {}, stores: sl.map(s => s.band === 5 && Loadout.allowed(pl, s, 'aim9l') ? 'aim9l' : Loadout.allowed(pl, s, 'aim120') && s.band >= 3 ? 'aim120' : Loadout.allowed(pl, s, 'aim9l') ? 'aim9l' : null) }; }
  const target = (id, plane, x, y, z, extra) => ({ id, team: 1, name: 'Target', plane, bot: true, owner: 'H', skill: 0, task: 'air', loadout: { belts: {}, stores: [], mods: {} }, lives: 1, passive: true, spawnAt: [x, y, z], ...(extra || {}) });

  const LIST = [
    { id: 'basics', name: 'Flight basics', icon: '🛩️', plane: 'spit9', desc: 'Mouse-aim flying, throttle and emergency power, rolling with the keys, the camera and zoom. Fly through three waypoints.',
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
    { id: 'takeoff', name: 'How to take off', icon: '🛫', plane: 'p51d', realistic: true, desc: 'From a standing start on the runway: power, the take-off roll, rotating at the right speed, raising the gear and climbing out (Realistic mode).',
      airfield: true,
      steps: [
        { text: c => `You are at the start of the runway. Hold ${K('throttleUp')} to open the throttle fully.`, done: c => c.p.ctl.throttle >= 0.98 },
        { text: c => `Keep straight with the mouse (it steers the tail wheel) and let the speed build. Rotate at about ${Math.round(c.p.perf.vs * 1.3 * 3.6)} km/h.`, done: c => c.p.speed > c.p.perf.vs * 1.3 },
        { text: () => `Pull the mouse up gently to lift the nose and fly off the runway.`, done: c => !c.p.onGround && agl(c.m, c.p) > 15 },
        { text: () => `Raise the landing gear with ${K('gear')}: it drags and slows the climb.`, done: c => !c.p.gearDown },
        { text: () => `Climb to 600 m above the ground at full power.`, done: c => agl(c.m, c.p) > 600 },
      ] },
    { id: 'landing', name: 'How to land', icon: '🛬', plane: 'p51d', realistic: true, desc: 'A straight-in approach to your home airfield: slowing down, flaps, gear, lining up, the flare and touchdown, then stopping to refuel and rearm (Realistic mode).',
      airfield: true, approach: true,
      steps: [
        { text: () => `You are on a long final approach. Throttle back with ${K('throttleDown')} to below 30%.`, done: c => c.p.ctl.throttle < 0.3 },
        { text: c => `Let the speed bleed off below ${Math.round(c.p.perf.vs * 2.1 * 3.6)} km/h, then lower the flaps fully with ${K('flapsDown')} (press it a few times).`, done: c => c.p.speed < c.p.perf.vs * 2.1 && c.p.flaps >= Craft.FLAP_NAMES.length - 1 },
        { text: () => `Lower the landing gear with ${K('gear')}.`, done: c => c.p.gearDown },
        { text: () => `Line up with the runway centreline: wings level, nose on the far end of the runway.`, done: c => c.lined(70, 8) },
        { text: c => `Descend gently towards the start of the runway. Just above it, raise the nose a little (the flare) and touch down below ${Math.round((c.p.perf.vs * 1.9 + 15) * 3.6)} km/h.`, done: c => c.p.onGround && c.p.atHome },
        { text: () => `Throttle to zero and hold ${K('brakes')} for the wheel brakes until you stop. Stay put to refuel, rearm and repair.`, done: c => c.p.serviced },
      ] },
    { id: 'gunnery', name: 'Air gunnery', icon: '🎯', plane: 'bf109g', desc: 'Lead the target with the lead indicator and shoot down three unarmed target aircraft. Fire when the indicator turns white and says FIRE.',
      start: { alt: 1500 },
      bots: () => [target('t1', 'b25j', -300, 1500, -1600), target('t2', 'b25j', 900, 1600, -2600), target('t3', 'b25j', -1200, 1400, -3600)],
      steps: [
        { text: () => `Three target bombers are ahead (red markers). Turn towards the nearest one.`, done: c => c.G.target && c.G.target.pos.distanceTo(c.p.pos) < 1200 },
        { text: () => `Put your aim on the lead indicator (the circle ahead of the target) and hold ${K('fire')} when it turns white and says FIRE.`, done: c => c.kills() >= 1 },
        { text: () => `Two more. Short bursts: guns overheat nothing here, but ammunition runs out.`, done: c => c.kills() >= 3 },
      ] },
    { id: 'bombing', name: 'Level bombing with a bombsight', icon: '💣', plane: 'b17g', realistic: true, desc: 'A B-17G with its Norden bombsight: look through the sight, steer the target down the course hair and release at the cross hair to destroy a factory from 3,000 m.',
      start: { alt: 3000, z: 7500 }, lo: pl => loadout(pl, 'b'), target: { size: 'medium', kind: 'factory', x: 0, z: -2000 },
      steps: [
        { text: () => `A factory is straight ahead. Press ${K('bombsight')} to look through the Norden bombsight.`, done: c => c.G.camMode === 'sight' },
        { text: () => `The cross hair marks where a bomb released now would land. Steer gently (mouse or ${K('rollLeft')} / ${K('rollRight')}) so the target slides down the vertical course hair.`, done: c => c.onCourse(250) },
        { text: () => `Release the bombs with ${K('bombs')} just as the target meets the cross hair. Each press drops two.`, done: c => c.p.count('b') < c.full },
        { text: () => `Keep dropping until the factory is destroyed. Out of bombs? They are reloaded for another pass.`, done: c => { const b = enemyBase(c.m); if (b && !b.dead && !c.p.count('b') && !c.m.combat.bombs.length) c.reload(); return b && b.dead; } },
      ] },
    { id: 'divebomb', name: 'Dive bombing', icon: '⬇️', plane: 'ju87', desc: 'The Ju 87 Stuka: fly over the target, extend the dive brakes, dive at 60-80°, release low and pull out.',
      start: { alt: 2500, z: 4000 }, lo: pl => loadout(pl, 'b'), target: { size: 'small', kind: 'camp', x: 0, z: -1500 },
      steps: [
        { text: () => `Fly towards the camp ahead until it is almost under you.`, done: c => c.hdist(enemyBase(c.m).pos) < 700 },
        { text: () => `Hold ${K('brakes')} to extend the dive brakes, then push the nose down: aim the mouse at the target and dive steeper than 60°.`, done: c => diveDeg(c.p) < -60 },
        { text: () => `Keep the target in the middle and release with ${K('bombs')} below 1,000 m.`, done: c => c.p.count('b') < c.full && agl(c.m, c.p) < 1100 },
        { text: () => `Pull out! Let go of the brakes and climb away.`, done: c => c.p.vel.y > 0 && agl(c.m, c.p) > 150 },
        { text: () => `Did it hit? Make more passes until the camp is destroyed (bombs are reloaded when you run out).`, done: c => { const b = enemyBase(c.m); if (b && !b.dead && !c.p.count('b') && !c.m.combat.bombs.length) c.reload(); return b && b.dead; } },
      ] },
    { id: 'rockets', name: 'Ground attack with rockets', icon: '🚀', plane: 'p47d', desc: 'The P-47D with 5-inch HVAR rockets against a column of tanks: a shallow dive, aim ahead of the target, fire in pairs.',
      start: { alt: 1200, z: 3500 }, lo: pl => loadout(pl, 'r'), tanks: 4,
      steps: [
        { text: () => `Tanks ahead (red diamonds). Line up on them in a shallow 20-30° dive.`, done: c => c.m.vehicles.list.some(v => !v.dead && v.pos.distanceTo(c.p.pos) < 1500) && diveDeg(c.p) < -10 },
        { text: () => `Fire rockets with ${K('rockets')}: they fall a little, so put the nose just above the tank.`, done: c => c.p.count('r') < c.full },
        { text: () => `Destroy two tanks.`, done: c => c.m.vehicles.list.filter(v => v.dead).length >= 2 },
      ] },
    { id: 'missiles', name: 'Air-to-air missiles', icon: '🎯', plane: 'f16c', desc: 'The F-16C with Sidewinders and AMRAAMs: getting a lock, firing, and switching missile types.',
      start: { alt: 4000 }, lo: pl => missileFit(pl),
      bots: () => [target('m1', 'mig21bis', 200, 4100, -3500), target('m2', 'mig21bis', -600, 4300, -14000)],
      steps: [
        { text: () => `Point the nose at the target ahead. The Sidewinder's seeker growls when it sees the heat; LOCK appears and the tone rises when it has a lock.`, done: c => c.G.locked },
        { text: () => `Fire with ${K('missile')}.`, done: c => c.m.combat.missiles.some(x => x.owner === c.p) || c.kills() >= 1 },
        { text: () => `Wait for the hit. If it missed, lock and fire again.`, done: c => c.kills() >= 1 },
        { text: () => `The second target is 10 km out: too far for a Sidewinder. Press ${K('missileSelect')} to switch to the radar-guided AMRAAM.`, done: c => c.p.missileSel && STORES[c.p.missileSel].seek !== 'ir' },
        { text: () => `Point at the second target, wait for the lock and fire (${K('missile')}). The AMRAAM guides itself.`, done: c => c.kills() >= 2 },
      ] },
    { id: 'flares', name: 'Missile defence', icon: '🎆', plane: 'f16c', desc: 'Heat-seeking missiles are fired at you: release flares and turn hard to make them miss.',
      start: { alt: 4000 }, bots: () => [target('e1', 'mig29', 0, 4000, 4000, { team: 1 })],
      steps: [
        { text: () => `An enemy is behind you and will fire heat-seeking missiles. When you hear the warning, release flares with ${K('flares')} and turn hard.`, launch: true, done: c => c.survived >= 1 },
        { text: () => `Again: flares and a hard turn the moment the missile warning sounds.`, launch: true, done: c => c.survived >= 2 },
      ] },
  ];
  const byId = id => LIST.find(t => t.id === id);

  // ---- match planning (host): the tutorial's aircraft, bots and bases
  function plan(t, human) {
    const pl = PLANES[t.plane], lo = t.lo ? t.lo(pl) : { belts: {}, stores: [], perSlot: true, mods: {} };
    const roster = [Object.assign({}, human, { id: 1, bot: false, team: 0, plane: t.plane, loadout: lo, lives: 99 })];
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
    const t = byId(m.cfg.tutorial); m.tut = { t, step: 0, stepT: 0, survived: 0, launchT: 3, done: false, full: 0 };
  }
  function ctx(m) {
    const T = m.tut, p = m.player, G = Game, st = T.t.steps[T.step];
    return { m, p, G, T, full: T.full, survived: T.survived,
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
  }
  function update(m, dt) {
    const T = m.tut; if (!T || T.done) return; const p = m.player; if (!p || !p.alive) return;
    if (T.stepT === 0) T.full = p.count('b') + p.count('r'); // ordnance at the start of the step
    T.stepT += dt;
    const st = T.t.steps[T.step];
    if (st.launch) missileDrill(m, T, dt);
    if (T.stepT > 0.6 && st.done(ctx(m))) {
      Sound.clunk && Sound.clunk(); T.step++; T.stepT = 0;
      if (T.step >= T.t.steps.length) { T.done = true; m.end(0, 'Tutorial complete: ' + T.t.name); }
    }
  }
  // missile defence drill: the enemy closes in behind the player and fires a heat seeker; surviving it counts
  function missileDrill(m, T, dt) {
    const p = m.player, e = m.crafts.find(c => c.team === 1 && c.alive);
    if (!e) { const d = m.crafts.find(c => c.team === 1); if (d) m.spawnCraft(d); return; } // shot the launcher down? it comes back
    const live = m.combat.missiles.filter(x => x.target === p);
    if (T.inFlight && !live.length) { T.inFlight = false; if (p.alive) T.survived++; T.launchT = 6; }
    if (live.length) return;
    T.launchT -= dt; if (T.launchT > 0) return;
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quat).multiplyScalar(2600); e.pos.copy(p.pos).add(back); e.vel.copy(p.vel); e.quat.copy(p.quat);
    m.combat.missile(e.pos.clone(), p.vel.clone(), e, Object.assign({}, STORES.r73, { ccm: 0.35 }), p, 'r73'); T.inFlight = true; T.launchT = 99;
  }
  // ---- HUD: the instruction panel and the waypoint marker
  function draw(g, W, H, m, cam, text, proj) {
    const T = m.tut; if (!T) return; const st = T.t.steps[Math.min(T.step, T.t.steps.length - 1)];
    const msg = T.done ? 'Tutorial complete!' : st.text(ctx(m)), w = Math.min(760, W - 40), x = W / 2 - w / 2;
    g.fillStyle = 'rgba(8,14,22,0.78)'; g.beginPath(); g.roundRect ? g.roundRect(x, 10, w, 74, 10) : g.rect(x, 10, w, 74); g.fill();
    text(`TUTORIAL · ${T.t.name.toUpperCase()} · STEP ${Math.min(T.step + 1, T.t.steps.length)} / ${T.t.steps.length}`, W / 2, 30, '#ffd34d', 12, 'center', true);
    // wrap the instruction onto two lines
    const words = msg.split(' '), lines = ['']; g.font = '15px sans-serif'; for (const wd of words) { const tl = lines[lines.length - 1] + (lines[lines.length - 1] ? ' ' : '') + wd; if (g.measureText(tl).width > w - 30 && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = tl; }
    lines.slice(0, 3).forEach((l, i) => text(l, W / 2, 52 + i * 18, '#ffffff', 15, 'center'));
    if (st.wp && !T.done) { const s = proj(st.wp, cam); if (s) { g.strokeStyle = '#ffd34d'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(s.x, s.y - 16); g.lineTo(s.x + 16, s.y); g.lineTo(s.x, s.y + 16); g.lineTo(s.x - 16, s.y); g.closePath(); g.stroke();
      text(Math.round(st.wp.distanceTo(m.player.pos)) + ' m', s.x, s.y + 32, '#ffd34d', 12, 'center', true); } }
  }
  return { LIST, byId, plan, spawn, start, update, draw };
})();
