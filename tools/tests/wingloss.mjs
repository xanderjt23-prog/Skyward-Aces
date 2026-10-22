// node tools/tests/cdp.mjs tools/tests/wingloss.mjs : losing a wing takes the stores on that wing with it; the other wing keeps its own
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval("(() => { localStorage.clear(); Profile.reset(); UI.refresh(); return 1; })()");
  await t.eval(`(() => { const cfg = Plan.build({ mode: 'tutorial', tutorial: 'missiles' }, [{ name: 'T', plane: 'f16c', owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); return 1; })()`);
  await t.eval("for (let k = 0; k < 10; k++) Game.update(1/30); 1");
  const st = "Game.match.player.stations.filter(s => s.slot).map(s => s.id + '@' + s.slot.side + ':' + s.n).join(' ')";
  console.log('before   ', await t.eval(st));
  await t.eval("(() => { const p = Game.match.player; p.dm.events.push('wingL'); p.update ? 0 : 0; p.tickDamage ? p.tickDamage() : 0; return 1; })()");
  await t.eval("for (let k = 0; k < 3; k++) Game.update(1/30); 1");
  console.log('after wingL', await t.eval(st), '| slots', await t.eval("JSON.stringify(Game.match.player.weaponSlots().map(id => id + 'x' + Game.match.player.countOf(id)))"));
}
