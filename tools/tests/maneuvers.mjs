// node tools/tests/cdp.mjs tools/tests/maneuvers.mjs : flies the maneuver lessons with the real keys (no attitude scripting)
// to check a player can complete them: the loop by holding pull, the Immelmann by pulling then rolling, the split-S by
// rolling inverted then pulling. Then checks the replay picker on the tutorials page.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval("(() => { localStorage.clear(); Profile.reset(); UI.refresh(); return 1; })()");
  const PLANE = process.env.PLANE || 'p51d';
  const start = async (id, step) => t.eval(`(() => { const cfg = Plan.build({ mode: 'tutorial', tutorial: '${id}' }, [{ name: 'T', plane: '${PLANE}', owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); for (let k = 0; k < 20; k++) Game.update(1/30);
    const T = Game.match.tut; T.step = ${step}; T.S = {}; T.stepT = 0; return 1; })()`);
  // hold keys for a while; plan: [[actions], seconds, stopWhen(expr) ]
  const run = async plan => { const log = [];
    for (const [acts, secs, until] of plan) {
      const r = await t.eval(`(() => { const m = Game.match, p = m.player, keys = ${JSON.stringify(acts)}; for (const k in Input.keys) Input.keys[k] = false; for (const a of keys) Input.keys[Input.bind(a)] = true;
        const up = () => new THREE.Vector3(0, 1, 0).applyQuaternion(p.quat).y, pitch = () => Math.asin(new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat).y) * 57.3;
        let n = 0; for (; n < ${Math.round(secs * 30)}; n++) { Game.update(1/30); if (m.over || !p.alive) break; ${until ? `if (${until}) break;` : ''} }
        return JSON.stringify({ t: (n / 30).toFixed(1), step: m.over ? 'done' : m.tut.step, ph: m.tut.S.ph, alt: Math.round(p.pos.y - m.world.groundAt(p.pos.x, p.pos.z)), kmh: Math.round(p.speed * 3.6), up: up().toFixed(2), pitch: Math.round(pitch()), alive: p.alive }); })()`);
      log.push(acts.join('+') + ' ' + r); }
    await t.eval("for (const k in Input.keys) Input.keys[k] = false; 1"); return log; };
  const leave = () => t.eval("Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); 1");
  console.log('PLANE', PLANE);
  await start('rolls', 0); console.log('aileron roll\n ', (await run([[['rollRight'], 6, 'm.over || m.tut.step > 0']])).join('\n  ')); await leave();
  await start('rolls', 1); console.log('loop\n ', (await run([[['pitchDown'], 3], [['pitchUp'], 20, 'm.over']])).join('\n  ')); await leave();
  await start('reversals', 0); console.log('immelmann\n ', (await run([[['pitchDown'], 3], [['pitchUp'], 15, 'up() < -0.3 && pitch() < 35'], [['rollRight'], 4, 'm.over || m.tut.step > 0 || up() > 0.9'], [[], 2]])).join('\n  ')); await leave();
  await start('reversals', 1); console.log('split-S\n ', (await run([[['rollRight'], 4, 'up() < -0.8'], [['pitchUp'], 15, 'm.over || (up() > 0.7 && Math.abs(pitch()) < 20)'], [[], 2]])).join('\n  ')); await leave();
  await start('turns', 0); console.log('level turn (roll to bank, then hold)\n ', (await run([[['rollLeft'], 0.9, 'up() < 0.45'], [[], 40, 'm.tut.step > 0']])).join('\n  ')); await leave();
  // replay picker: complete a lesson, then the tutorials page offers the owned aircraft that can do it
  const pick = await t.eval("(() => { Profile.tutorialDone('rolls'); Profile.tutorialDone('missiles'); UI.open && UI.open('play'); const s = document.querySelector('#p-tut'); if (s) s.click(); const r = document.querySelector('[data-tut-plane=\"rolls\"]'), mi = document.querySelector('[data-tut-plane=\"missiles\"]'); return JSON.stringify({ rolls: r ? r.options.length : 'none', missiles: mi ? mi.options.length : 'none', headers: [...document.querySelectorAll('h3')].map(h => h.textContent).filter(x => /Basic/.test(x)) }); })()");
  console.log('replay picker', pick);
  await t.shot('tutorials-page');
}
