// node tools/tests/cdp.mjs tools/tests/leak.mjs : nothing from one match may survive into the next. A maneuver
// tutorial is left mid-step (rings showing), then a dogfight and a destroy battle are started: no tutorial rings, and
// the scene holds no more objects than a fresh battle of the same kind.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const battle = mode => t.eval(`(() => { const cfg = Plan.build({ mode: '${mode}', teamSize: [4, 4], respawns: 2, time: 600, map: 'land', weather: 'clear', size: 'medium' }, [{ name: 'T', plane: 'p51d', loadout: Profile.loadoutFor('p51d'), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); for (let k = 0; k < 30; k++) Game.update(1/30);
    const sc = Game.match.scene; let rings = 0; sc.traverse(o => { if (o.userData && o.userData.tutGuide) rings++; }); return JSON.stringify({ mode: '${mode}', rings, objects: sc.children.length }); })()`);
  const leave = () => t.eval("(() => { Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); return 1; })()");
  console.log('fresh', await battle('dogfight')); await leave();
  for (const id of ['vertical', 'offence', 'twoship']) {
    console.log(id, await t.eval(`(() => { const cfg = Plan.build({ mode: 'tutorial', tutorial: '${id}' }, [{ name: 'T', plane: 'p51d', owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); for (let k = 0; k < 120; k++) Game.update(1/30);
      let rings = 0; Game.match.scene.traverse(o => { if (o.userData && o.userData.tutGuide) rings++; }); return 'rings during the tutorial: ' + rings; })()`));
    await leave();
    console.log('  after it', await battle('dogfight')); await leave();
    console.log('  after it', await battle('destroy')); await leave();
  }
}
