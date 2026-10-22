// node tools/tests/cdp.mjs tools/tests/bfmshot.mjs : screenshots of the maneuver guides (rings, moving ring, scripted
// opponents), and the stall turn flown with the real keys (pull up, rudder at the top) to check it can be done.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const start = (id, step) => t.eval(`(() => { const cfg = Plan.build({ mode: 'tutorial', tutorial: '${id}' }, [{ name: 'T', plane: Tutorial.byId('${id}').plane, owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match; for (let k = 0; k < 20; k++) Game.update(1/30);
    m.tut.step = ${step}; m.tut.S = {}; m.tut.stepT = 0; for (let k = 0; k < 45; k++) Game.update(1/30); Game.camMode = 'chase'; Game.render(); return 1; })()`);
  const leave = () => t.eval("Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); 1");
  for (const [id, step] of [['vertical', 0], ['energy', 1], ['offence', 0], ['yoyo', 0]]) { await start(id, step); await t.shot(`bfm-${id}-${step}`); await leave(); }
  // the stall turn with the keys: dive a little, pull to the vertical, rudder over at the top, pull out of the dive
  await start('vertical', 2);
  const r = await t.eval(`(() => { const m = Game.match, p = m.player, T = m.tut, keys = a => { for (const k in Input.keys) Input.keys[k] = false; for (const x of a) Input.keys[Input.bind(x)] = true; };
    const pitch = () => Math.asin(new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat).y) * 57.3, log = [];
    const run = (a, secs, until) => { keys(a); let n = 0; for (; n < secs * 30; n++) { Game.update(1/30); if (m.over || T.step !== 2 || until()) break; } const S = T.S, g = S.gates && S.gates[S.gi], tg = g && (S.gates[S.gi + 1] || g).clone().sub(S.gates[S.gi - 1] || g).normalize(), to = g && p.pos.clone().sub(g); log.push((g ? '[next ring: dist ' + Math.round(to.length()) + ' along ' + Math.round(to.dot(tg)) + ' side ' + Math.round(to.clone().addScaledVector(tg, -to.dot(tg)).length()) + ' gR ' + Math.round(S.gR) + '] ' : '') + a.join('+') + ' ' + (n / 30).toFixed(1) + 's pitch ' + Math.round(pitch()) + ' kmh ' + Math.round(p.speed * 3.6) + ' ring ' + (T.S.gi || 0) + '/' + (T.S.gates ? T.S.gates.length : 0)); };
    run(['throttleUp', 'pitchUp'], 8, () => pitch() > 80); run(['throttleUp'], 12, () => p.speed < 17);
    run(['throttleUp', 'yawRight'], 8, () => pitch() < -60); run(['throttleUp'], 3, () => false); run(['throttleUp', 'pitchUp'], 8, () => Math.abs(pitch()) < 10 && p.vel.y > -5); run(['throttleUp'], 4, () => false);
    keys([]); return log.join(' | ') + ' || step now ' + (m.over ? 'done' : T.step) + ' again ' + (T.S.again || 0); })()`);
  console.log('stall turn with keys:', r);
}
