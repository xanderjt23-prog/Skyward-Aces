// node tools/tests/cdp.mjs tools/tests/smoke.mjs : loads the game, opens every menu, flies a short battle in each mode
import path from 'path';
export default async function (t) {
  const url = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
  await t.goto(url);
  console.log('loaded', await t.eval("typeof Game + ' ' + typeof UI + ' ' + PLANE_LIST.length + ' planes'"));
  await t.eval("localStorage.clear(); Profile.reset(); UI.refresh(); 1");
  await t.shot('menu');
  for (const p of ['play', 'hangar', 'achievements', 'mods', 'research', 'profile']) { console.log(p, await t.eval(`UI.open('${p}'); document.querySelector('#panel-body').textContent.length`)); await t.shot('panel-' + p); }
  await t.eval("UI.close(); 1");
  const modes = (process.env.MODES || 'destroy,dogfight,missions,survival').split(',');
  for (const mode of modes) {
    const plane = process.env.PLANE || 'camel';
    const r = await t.eval(`(() => { const p = Profile.get(); p.owned['${plane}'] = true; p.selected = '${plane}';
      const s = { destroy: { mode: 'destroy', teamSize: [6, 6], time: 300, map: '' }, dogfight: { mode: 'dogfight', teamSize: [3, 3], respawns: 1, time: 600 }, missions: { mode: 'missions' }, survival: { mode: 'survival', respawns: 2 } }['${mode}'];
      const cfg = Plan.build(s, [{ name: 'Tester', plane: '${plane}', loadout: Profile.loadoutFor('${plane}'), owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true });
      return cfg.roster.length + ' aircraft, ' + cfg.bases.length + ' bases, era ' + cfg.era + ', map ' + cfg.map; })()`);
    console.log(mode, r);
    const t0 = Date.now();
    const secs = +(process.env.SECS || 40);
    for (let i = 0; i < secs; i++) await t.eval("for (let k = 0; k < 30; k++) Game.update(1/30); Game.render(); 1");
    console.log('  sim ms per game-second', ((Date.now() - t0) / secs).toFixed(0));
    console.log('  state', await t.eval(`(() => { const m = Game.match, p = m.player; return JSON.stringify({ t: m.time.toFixed(0), alive: m.crafts.filter(c => c.alive).length, total: m.crafts.length, kills: m.crafts.reduce((a, c) => a + c.stats.kills, 0), deaths: m.crafts.reduce((a, c) => a + c.stats.deaths, 0), scores: m.scores, basesDead: m.bases.filter(b => b.dead).length, bullets: m.combat.bullets.length, player: { alive: p.alive, y: p.pos.y | 0, spd: (p.speed * 3.6) | 0 }, over: m.over, feed: m.feed.slice(-3).map(f => f.text) }); })()`));
    await t.shot('battle-' + mode);
    await t.eval("Game.leave(); 1"); await t.sleep(200);
    console.log('  results', await t.eval("document.querySelector('#results .big-result') ? document.querySelector('#results .big-result').textContent : 'none'"));
    await t.eval("document.querySelector('#res-ok').click(); 1");
  }
}
