// node tools/tests/cdp.mjs tools/tests/handling.mjs : autopilot settling, keyboard roll + bank hold, cobra, G effects
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const start = plane => t.eval(`(() => { const p = Profile.get(); p.owned['${plane}'] = true;
    const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], respawns: 0, time: 0, map: 'land', weather: 'clear' }, [{ name: 'T', plane: '${plane}', loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true });
    const m = Game.match, foe = m.crafts.find(c => c.team === 1); foe.pos.set(0, 9000, 30000); foe.ai = null; foe.local = false;
    const pl = m.player; pl.pos.y = 3000; Game.aimReset(); for (const k in Input.keys) Input.keys[k] = false; return 1; })()`);
  const st = `(() => { const p = Game.match.player, a = Flight.axes(p); return { bank: Math.atan2(-a.right.y, a.up.y) * 57.3, pitch: Math.asin(a.fwd.y) * 57.3, hdg: Math.atan2(-a.fwd.x, -a.fwd.z) * 57.3, off: Math.acos(Math.max(-1, Math.min(1, a.fwd.dot(Game.aimDir)))) * 57.3, alpha: p.alpha * 57.3, spd: p.speed * 3.6, g: p.gLoad, vis: p.gVision, stress: p.gStress, gloc: p.glocT > 0, y: p.pos.y }; })()`;
  const run = async (secs, every) => { const out = []; for (let i = 0; i < secs * 30; i++) { await t.eval('Game.update(1/30); 1'); if (i % (every || 15) === 0) out.push(await t.eval(st)); } return out; };
  const f = (o, k) => o.map(x => x[k].toFixed(0)).join(' ');
  // 1. settling: aim 25 deg right and 10 deg up, P-51 and F-16
  for (const pl of ['p51d', 'f16c', 'camel']) {
    await start(pl); await t.eval("(() => { const p = Game.match.player, a = Flight.axes(p), y = Math.atan2(-a.fwd.x, -a.fwd.z); Game.setAim(y - 0.44, 0.17); return 1; })()");
    const o = await run(8, 15);
    console.log(pl, 'aim step  off:', f(o, 'off'), '| bank:', f(o, 'bank'));
  }
  // 2. keyboard roll: hold D for 1.2 s then release; the bank should be held and the view should not jump
  await start('p51d');
  await t.eval("Input.keys.KeyD = true; 1"); const r1 = await run(1.2, 6); await t.eval("Input.keys.KeyD = false; 1"); const r2 = await run(6, 15);
  console.log('roll D held  bank:', f(r1, 'bank'), ' -> released bank:', f(r2, 'bank'), ' alt', f(r2, 'y'), ' aim-off', f(r2, 'off'));
  // 3. cobra: level at ~420 km/h, haul back with the manual pitch key for 2.5 s
  for (const pl of ['f22a', 'su27', 'p51d']) {
    await start(pl); await t.eval("(() => { const p = Game.match.player; p.vel.setLength(118); p.ctl.throttle = 1; return 1; })()"); await run(1, 30);
    await t.eval("Input.keys.ArrowDown = true; 1"); const c1 = await run(2.5, 6); await t.eval("Input.keys.ArrowDown = false; 1"); const c2 = await run(4, 15);
    console.log(pl, 'cobra  alpha:', f(c1, 'alpha'), '| pitch:', f(c1, 'pitch'), '| spd:', f(c1, 'spd'), ' -> after: alpha', f(c2, 'alpha'), 'spd', f(c2, 'spd'), 'pitch', f(c2, 'pitch'));
  }
  // 4. G: sustained manual pull in a P-51 at speed, then in an F-16
  for (const pl of ['p51d', 'f16c']) {
    await start(pl); await t.eval("(() => { const p = Game.match.player; p.vel.setLength(p.perf.vmax * 0.85); return 1; })()");
    await t.eval("Input.keys.ArrowDown = true; 1"); const g1 = await run(8, 30); await t.eval("Input.keys.ArrowDown = false; 1");
    console.log(pl, 'pull  G:', g1.map(x => x.g.toFixed(1)).join(' '), '| vision:', g1.map(x => x.vis.toFixed(2)).join(' '), '| stress:', g1.map(x => x.stress.toFixed(2)).join(' '), '| gloc:', g1.map(x => x.gloc ? 'X' : '.').join(''));
  }
  await t.eval("Game.render(); 1"); await t.shot('handling');
}
