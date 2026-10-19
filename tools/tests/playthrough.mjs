// node tools/tests/cdp.mjs tools/tests/playthrough.mjs : a long bot-flown battle per era as the player (the player's craft
// gets a bot brain), screenshots at intervals from chase and cockpit views, and a log of anything odd: NaN positions, aircraft
// under the ground, stuck aircraft, console errors, kill counts
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const plane of (process.env.PLANES || 'camel,p51d,f86f,f4e,f16c,f22a').split(',')) {
    await t.eval(`(() => { const p = Profile.get(); p.owned['${plane}'] = true; p.selected = '${plane}';
      const cfg = Plan.build({ mode: 'destroy', teamSize: [8, 8], time: 600, map: '', realistic: false }, [{ name: 'T', plane: '${plane}', loadout: Profile.loadoutFor('${plane}'), owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); Game.match.player.ai = new BotBrain(Game.match.player, 0.8); return 1; })()`);
    const issues = new Set();
    for (let s = 0; s < 120; s++) {
      const r = await t.eval(`(() => { for (let k = 0; k < 30; k++) Game.update(1/30); Game.render(); const m = Game.match, out = [];
        for (const c of m.crafts) { if (!c.alive) continue; const p = c.pos; if (!isFinite(p.x + p.y + p.z)) out.push('NaN position ' + c.def.id);
          const gy = m.world.groundAt(p.x, p.z); if (!c.wreck && !c.onGround && p.y < gy - 2) out.push('under ground ' + c.def.id);
          if (!c.wreck && c.speed < 5 && !c.onGround) out.push('stalled in the air at ' + Math.round(c.speed) + ' m/s ' + c.def.id); }
        return JSON.stringify({ out, k: m.crafts.reduce((a, c) => a + c.stats.kills, 0), over: m.over }); })()`);
      const j = JSON.parse(r); j.out.forEach(x => issues.add(x));
      if (s === 40) { await t.shot('play-' + plane + '-chase'); await t.eval("Game.camMode = 'nose'; Game.render(); 1"); await t.shot('play-' + plane + '-nose'); await t.eval("Game.camMode = 'chase'; 1"); }
      if (j.over) break;
    }
    console.log(plane.padEnd(8), await t.eval("JSON.stringify({ t: Math.round(Game.match.time), kills: Game.match.crafts.reduce((a, c) => a + c.stats.kills, 0), playerKills: Game.match.player.stats.kills, basesDead: Game.match.bases.filter(b => b.dead).length })"), '| issues:', [...issues].slice(0, 8).join('; ') || 'none');
    await t.eval("Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); 1");
  }
}
