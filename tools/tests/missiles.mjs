// node tools/tests/cdp.mjs tools/tests/missiles.mjs : the missile flight model and seekers.
//  1. fly-out against a target flying straight (head-on and from behind, low and high): hit or miss, time, speed
//  2. a target notching (beaming, below the launcher) a semi-active and an active radar missile, with and without chaff
//  3. a heat seeker against flares and a hard turn
//  4. which warnings each aircraft gets (radar warner / missile approach warner / none)
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const setup = (shooter, target) => t.eval(`(() => { const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], respawns: 0, time: 0, map: 'land', weather: 'clear' }, [{ name: 'T', plane: '${shooter}', loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match, foe = m.crafts.find(c => c.team === 1);
    if (foe.def.id !== '${target}') { foe.def = PLANES['${target}']; } foe.ai = null; foe.local = true; return 1; })()`);
  // shooter at (0, alt, 0) heading north; target at range, heading `th` (0 = away, 180 = towards); `fly` = per-frame target script
  const shot = (id, range, alt, th, opts = {}) => t.eval(`(() => { const m = Game.match, p = m.player, e = m.crafts.find(c => c.team === 1), V = THREE.Vector3;
    for (const c of [p, e]) { c.alive = true; c.dm.destroyed = false; c.wreck = false; for (const k of c.dm.comps) { k.hp = k.max; k.dead = false; k.fire = 0; } c.spawnT = -99; }
    m.combat.missiles.forEach(x => m.combat.removeMesh(x)); m.combat.missiles = []; m.combat.flares = []; m.combat.chaff = [];
    const gy = m.world.groundAt(0, 0); p.pos.set(0, gy + ${alt}, 0); p.quat.identity(); p.vel.set(0, 0, -250); p.ai = null;
    e.pos.set(${opts.dx || 0}, gy + ${opts.talt != null ? opts.talt : alt}, -${range}); e.quat.setFromAxisAngle(new V(0, 1, 0), ${th} * Math.PI / 180); e.vel.set(0, 0, -${opts.tspd || 250}).applyQuaternion(e.quat);
    const ms = m.combat.missile(p.pos.clone().add(new V(0, -1.5, 0)), p.vel.clone(), p, STORES.${id}, e, '${id}');
    const hp0 = e.dm.comps.reduce((a, c) => a + c.hp, 0); let t = 0, vmax = 0, hit = false, lost = '', warn = {}, cm = 0;
    while (t < 90 && m.combat.missiles.includes(ms)) { const dt = 1 / 30; t += dt;
      ${opts.fly || ''}
      e.pos.addScaledVector(e.vel, dt); p.pos.addScaledVector(p.vel, dt);
      if (${opts.chaff ? 'true' : 'false'} && t > 2 && Math.floor(t * 2) !== cm && cm < ${opts.salvos || 99}) { cm = Math.floor(t * 2); m.combat.flare(e, true); }
      m.combat.update(dt); m.time += dt;
      for (const k of ['wLock', 'wLaunch', 'wMaws']) if (e[k] != null && m.time - e[k] < 0.1) warn[k] = 1;
      vmax = Math.max(vmax, ms.v.length()); if (ms.lost && !lost) lost = 'lost@' + t.toFixed(1) + 's' + (ms.decoy ? '(decoy)' : ''); if (ms.decoy && !lost) lost = 'decoyed@' + t.toFixed(1) + 's'; }
    hit = e.dm.comps.reduce((a, c) => a + c.hp, 0) < hp0 || !e.alive;
    return JSON.stringify({ hit, t: +t.toFixed(1), vmax: Math.round(vmax), vend: Math.round(ms.v.length()), dist: Math.round(ms.p.distanceTo(e.pos)), lost, warn: Object.keys(warn).join(',') }); })()`);
  // ---- 1. fly-out
  await setup('f15c', 'mig29');
  for (const [id, cases] of [['aim9l', [[3000, 3000, 0], [6000, 6000, 180], [8000, 8000, 0], [12000, 8000, 180]]], ['aim120', [[15000, 8000, 180], [30000, 10000, 180], [20000, 8000, 0], [40000, 10000, 180]]],
    ['aim7m', [[15000, 8000, 180], [20000, 1000, 180]]], ['r27er', [[25000, 8000, 180]]], ['aim54', [[60000, 12000, 180]]], ['meteor', [[60000, 10000, 180]]]]) {
    for (const [r, alt, th] of cases) console.log(id.padEnd(7), `${r / 1000} km, ${alt} m, ${th === 180 ? 'head-on' : 'tail-chase'}`.padEnd(28), await shot(id, r, alt, th));
  }
  // ---- 2. notching (target low and beaming, its velocity square to the radar) and chaff
  const beam = 'e.vel.set(250, 0, 0);';
  console.log('aim7m  15 km, target beaming at 300 m      ', await shot('aim7m', 15000, 5000, 90, { talt: 300, fly: beam }));
  console.log('aim7m  15 km, beaming + chaff              ', await shot('aim7m', 15000, 5000, 90, { talt: 300, fly: beam, chaff: true }));
  console.log('aim120 15 km, beaming at 300 m             ', await shot('aim120', 15000, 5000, 90, { talt: 300, fly: beam }));
  console.log('aim120 15 km, beaming + chaff              ', await shot('aim120', 15000, 5000, 90, { talt: 300, fly: beam, chaff: true }));
  console.log('aim120 15 km, head-on, no notch, chaff     ', await shot('aim120', 15000, 5000, 180, { chaff: true }));
  // ---- 3. heat seeker vs flares and a hard break turn
  const brk = 'if (t > 1) { e.vel.applyAxisAngle(new V(0, 1, 0), 0.35 * dt); }';
  let n = 0, f = 0; for (let i = 0; i < 6; i++) { const r = JSON.parse(await shot('aim9l', 2500, 4000, 0, { fly: brk })); n += r.hit ? 1 : 0; if (i < 2) console.log('  ir vs break', JSON.stringify(r)); const r2 = JSON.parse(await shot('aim9l', 2500, 4000, 0, { fly: brk, chaff: true, salvos: 6 })); f += r2.hit ? 1 : 0; }
  console.log(`aim9l 2.5 km tail, break turn: ${n}/6 hits; with 3 flare salvos: ${f}/6 hits`);
  // ---- 4. warnings by aircraft
  for (const [tg, id] of [['f16c', 'aim9l'], ['f16c', 'aim7m'], ['ef2000uk', 'aim9l'], ['ef2000uk', 'aim120'], ['p51d', 'aim9l']]) {
    await setup('f15c', tg); const r = JSON.parse(await shot(id, 8000, 6000, 180));
    console.log(`warnings on ${tg.padEnd(8)} from ${id.padEnd(7)}: raw ${r.warn || 'none'} | fitted: rwr ${PLANES_info(tg)}`, await t.eval(`JSON.stringify({ rwr: PLANES.${tg}.rwr, maws: PLANES.${tg}.maws, chaff: PLANES.${tg}.chaff })`));
  }
  function PLANES_info() { return ''; }
}
