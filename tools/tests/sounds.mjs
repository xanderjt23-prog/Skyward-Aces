// node tools/tests/cdp.mjs tools/tests/sounds.mjs : starts audio, waits for the recordings to load and decode, flies the
// P-51D, the F6F and the F-16C briefly (engine loops), fires the guns and sets off an explosion, and reports errors
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval("Sound.resume(); 1"); await t.sleep(4000);
  console.log('recordings decoded:', await t.eval("JSON.stringify(Sound.recordings ? Sound.recordings() : 'n/a')"));
  for (const plane of ['p51d', 'f6f5', 'f16c']) {
    await t.eval(`(() => { const cfg = Plan.build({ mode: 'dogfight', teamSize: [2, 2], time: 300 }, [{ name: 'T', plane: '${plane}', loadout: Profile.loadoutFor('${plane}'), owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); return 1; })()`);
    for (let k = 0; k < 4; k++) await t.eval("for (let i = 0; i < 10; i++) { Game.match.player.setTrigger(true); Game.update(1/30); } 1");
    await t.eval("Sound.boom(2.5, Game.match.player.pos.clone().add(new THREE.Vector3(0, 0, -300))); 1");
    console.log(plane, await t.eval("JSON.stringify(Sound.engineInfo ? Sound.engineInfo() : 'n/a')"));
    await t.eval("Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); 1");
  }
}
