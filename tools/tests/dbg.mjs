// ad-hoc: node tools/tests/cdp.mjs tools/tests/dbg.mjs  (EXPR env = expression evaluated after a short battle start)
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const plane = process.env.PLANE || 'camel', mode = process.env.MODE || 'dogfight';
  await t.eval(`(() => { const p = Profile.get(); p.owned['${plane}'] = true; p.selected = '${plane}';
    const s = { destroy: { mode: 'destroy', teamSize: [6, 6], time: 300, map: '${process.env.MAP || ''}' }, dogfight: { mode: 'dogfight', teamSize: [3, 3], respawns: 1, time: 600, map: '${process.env.MAP || ''}' }, missions: { mode: 'missions', mission: '${process.env.MISSION || ''}' }, survival: { mode: 'survival', respawns: 2 } }['${mode}'];
    const cfg = Plan.build(s, [{ name: 'Tester', plane: '${plane}', loadout: ${process.env.LOADOUT || `Profile.loadoutFor('${plane}')`}, owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); return 1; })()`);
  if (process.env.PRE) console.log(await t.eval(process.env.PRE));
  const secs = +(process.env.SECS || 0);
  for (let i = 0; i < secs; i++) { await t.eval("for (let k = 0; k < 30; k++) Game.update(1/30); 1"); if (process.env.EACH) console.log(i, await t.eval(process.env.EACH)); }
  await t.eval("Game.render(); 1");
  console.log(await t.eval(process.env.EXPR || '1'));
  if (process.env.SHOT) await t.shot(process.env.SHOT);
}
