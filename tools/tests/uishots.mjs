// node tools/tests/cdp.mjs tools/tests/uishots.mjs : screenshots of the menus with a rich profile
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval(`localStorage.clear(); Profile.reset(); const p = Profile.get(); p.coins = 90000; p.xp = 40000; p.totalXp = 26000; ['p51d','p47d','bf109g','f16c','spit9'].forEach(id => p.owned[id] = true); p.selected = 'p47d'; Profile.save(); UI.refresh(); 1`);
  await t.eval(`Profile.buyStore('p47d', 'b500'); Profile.buyStore('p47d', 'hvar'); Profile.setStation('p47d', 0, 'b500'); Profile.setStation('p47d', 2, 'hvar'); Profile.buyBelt('p47d', 'm2', 'api'); Profile.buyUpgrade('p47d', 'engine'); 1`);
  await t.eval("UI.open('mods'); document.querySelector('[data-mt=loadout]').click(); 1"); await t.sleep(300); await t.shot('ui-loadout');
  await t.eval("document.querySelector('[data-mt=upg]').click(); 1"); await t.sleep(200); await t.shot('ui-upgrades');
  await t.eval("UI.open('play'); document.querySelector('#p-sp').click(); 1"); await t.sleep(200); await t.shot('ui-modes');
  await t.eval("document.querySelector('[data-mode=missions]').click(); 1"); await t.sleep(200); await t.shot('ui-missions');
  await t.eval("UI.open('play'); 1"); await t.eval("document.querySelector('#p-back') && document.querySelector('#p-back').click(); document.querySelector('#p-mp').click(); 1"); await t.sleep(200); await t.shot('ui-mp');
  await t.eval("UI.open('profile'); 1"); await t.sleep(200); await t.shot('ui-profile');
  await t.eval("UI.open('achievements'); 1"); await t.sleep(200); await t.shot('ui-ach');
  await t.eval("UI.open('hangar'); 1"); await t.sleep(200); await t.shot('ui-hangar');
  // a short battle, then the results screen
  await t.eval(`UI.close(); const cfg = Plan.build({ mode: 'destroy', teamSize: [8, 8], time: 120 }, [{ name: 'Tester', plane: 'p47d', loadout: Profile.loadoutFor('p47d'), owner: 'H', team: 0 }]); Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); Game.match.player.ai = new BotBrain(Game.match.player, 0.9); 1`);
  for (let i = 0; i < 60; i++) await t.eval("for (let k = 0; k < 30; k++) Game.update(1/30); 1");
  await t.eval("Game.render(); 1"); await t.shot('ui-battle');
  await t.eval("UI.scoreboard(true); 1"); await t.shot('ui-scoreboard'); await t.eval("UI.scoreboard(false); 1");
  for (let i = 0; i < 70; i++) await t.eval("for (let k = 0; k < 30; k++) Game.update(1/30); 1");
  await t.sleep(300); await t.shot('ui-results');
  console.log(await t.eval("document.querySelector('#results').innerText.slice(0, 400)"));
}
