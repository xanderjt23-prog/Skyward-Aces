// node tools/tests/cdp.mjs tools/tests/killcauses.mjs : how aircraft go down in bot battles (gunfire, crew, crash after damage, crash undamaged)
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const plane of (process.env.PLANES || 'p51d,f86f,f16c').split(',')) {
    await t.eval(`(() => { window.__kc = {}; const cfg = Plan.build({ mode: 'destroy', teamSize: [8, 8], time: 600, map: 'alps' }, [{ name: 'T', plane: '${plane}', loadout: Profile.loadoutFor('${plane}'), owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match; m.player.ai = new BotBrain(m.player, 0.8);
      const ak = m.applyKill.bind(m); m.applyKill = d => { const k = d.how + (d.how === 'crash' ? '' : ''); __kc[k] = (__kc[k] || 0) + 1; return ak(d); };
      const rk = m.resolveKill.bind(m); m.resolveKill = d => { if (d.cause === 'crash') { const k = d.frac >= 0.1 ? 'crash-damaged' : 'crash-undamaged(' + Math.round(d.frac * 100) + '%)'; __kc[k] = (__kc[k] || 0) + 1; } return rk(d); }; return 1; })()`);
    for (let s = 0; s < 150; s++) await t.eval("for (let k = 0; k < 30; k++) Game.update(1/30); 1");
    console.log(plane, await t.eval("JSON.stringify(__kc)"));
    await t.eval("Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); 1");
  }
}
