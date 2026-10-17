// node tools/tests/cdp.mjs tools/tests/perf.mjs : 60v60 Destroy, sim cost per game-second (PLANE env)
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const plane = process.env.PLANE || 'p51d';
  console.log(await t.eval(`(() => { const p = Profile.get(); p.owned['${plane}'] = true; p.selected = '${plane}';
    const cfg = Plan.build({ mode: 'destroy', teamSize: [60, 60], time: 900 }, [{ name: 'Tester', plane: '${plane}', loadout: Profile.loadoutFor('${plane}'), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); Game.match.player.ai = new BotBrain(Game.match.player, 0.8); return cfg.roster.length + ' aircraft, half ' + cfg.half; })()`));
  for (let s = 0; s < (+process.env.SECS || 60); s += 10) {
    const r = await t.eval(`(() => { const t0 = performance.now(); for (let k = 0; k < 300; k++) Game.match.update(1/30); const sim = (performance.now() - t0) / 10; const t1 = performance.now(); Game.render(); const rend = performance.now() - t1;
      const m = Game.match; return 'sim ms/s ' + sim.toFixed(0) + ' (per frame ' + (sim / 30).toFixed(1) + ') render ' + rend.toFixed(0) + ' bullets ' + m.combat.bullets.length + ' alive ' + m.crafts.filter(c => c.alive).length + ' scores ' + m.scores + ' bases ' + m.bases.filter(b => b.dead).length; })()`);
    console.log(s + 10, r);
  }
  await t.shot('perf');
}
