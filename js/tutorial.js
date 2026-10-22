// ============================================================================
// Tutorials: short guided flights, picked from the Play menu. Each one puts you in an aircraft that suits the lesson
// (owned or not), sets up the scene (runway, targets, a target drone) and walks through steps, each with its own
// instruction and a check that moves on when you have done it. Keys in the instructions follow your bindings.
// In normal battles there is no instructional text; this is where it lives.
// ============================================================================
const Tutorial = (() => {
  const K = a => Input.label(Input.bind(a));
  // the number key of the first weapon type on the player's aircraft that passes `test` (each type has its own key)
  const WK = test => { const p = Game.match && Game.match.player, i = p ? p.weaponSlots().findIndex(id => test(STORES[id])) : -1; return i < 0 ? '?' : K('weapon' + (i + 1)); };
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
  const WN = test => { const p = Game.match && Game.match.player, id = p && p.weaponSlots().find(id => test(STORES[id])); return id ? STORES[id].name.replace(/ \(.*\)$/, '') : 'missile'; };
  const target = (id, plane, x, y, z, extra) => ({ id, team: 1, name: 'Target', plane, bot: true, owner: 'H', skill: 0, task: 'air', loadout: { belts: {}, stores: [], mods: {} }, lives: 1, passive: true, spawnAt: [x, y, z], ...(extra || {}) });

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
    { id: 'gunnery', cat: 'mech', fits: pl => pl.guns.length > 0, name: 'Air gunnery', icon: '🎯', plane: 'bf109g', desc: 'Lead the target with the lead indicator and shoot down three unarmed target aircraft. Fire when the indicator turns white and says FIRE.',
      start: { alt: 1500 },
      bots: () => [target('t1', 'b25j', -300, 1500, -1600), target('t2', 'b25j', 900, 1600, -2600), target('t3', 'b25j', -1200, 1400, -3600)],
      steps: [
        { text: () => `Three target bombers are ahead (red markers). Turn towards the nearest one.`, done: c => c.G.target && c.G.target.pos.distanceTo(c.p.pos) < 1200 },
        { text: () => `Put your aim on the lead indicator (the circle ahead of the target) and hold ${K('fire')} when it turns white and says FIRE.`, done: c => c.kills() >= 1 },
        { text: () => `Two more. Short bursts: guns overheat nothing here, but ammunition runs out.`, done: c => c.kills() >= 3 },
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
    { id: 'flares', cat: 'mech', fits: pl => pl.flares > 0, name: 'Missile defence', icon: '🎆', plane: 'f16c', desc: 'Heat-seeking missiles are fired at you: release flares and turn hard to make them miss.',
      start: { alt: 4000 }, bots: () => [target('e1', 'mig29', 0, 4000, 4000, { team: 1 })],
      steps: [
        { text: () => `An enemy is behind you and will fire heat-seeking missiles. When you hear the warning, release flares with ${K('flares')} and turn hard.`, launch: true, done: c => c.survived >= 1 },
        { text: () => `Again: flares and a hard turn the moment the missile warning sounds.`, launch: true, done: c => c.survived >= 2 },
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
    if (st.launch) missileDrill(m, T, dt);
    track(m); const c = ctx(m), ok = st.done(c);
    if (T.stepT > 0.6 && ok) {
      Sound.clunk && Sound.clunk(); T.step++; T.stepT = 0; T.S = {};
      if (T.step >= T.t.steps.length) { T.done = true; Profile.tutorialDone(T.t.id); m.end(0, 'Tutorial complete: ' + T.t.name); }
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
  return { LIST, CATS, byId, fits, plan, spawn, start, update, draw, ctx };
})();
