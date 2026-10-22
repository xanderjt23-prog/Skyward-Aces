// node tools/tests/cdp.mjs tools/tests/keys.mjs : Modifications -> Weapon keys. Fit two missile types and bombs on an
// F-16C, put the AMRAAM on key 1 by clicking, check the swap and that the aircraft in battle uses the new keys.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval(`(() => { localStorage.clear(); Profile.reset(); const p = Profile.get(); p.owned.f16c = true; p.selected = 'f16c'; p.coins = 1e7;
    for (const id of ['aim9l', 'aim120', 'mk82']) Profile.buyStore('f16c', id);
    const sl = Loadout.slots(PLANES.f16c); for (const s of sl) { const id = s.band === 5 ? 'aim9l' : Loadout.allowed(PLANES.f16c, s, 'aim120') ? 'aim120' : Loadout.allowed(PLANES.f16c, s, 'mk82') ? 'mk82' : null; if (id) Profile.setSlot('f16c', s.i, id, false); }
    UI.open('mods'); document.querySelector('[data-mt="loadout"]').click(); return 1; })()`);
  const keys = () => t.eval("JSON.stringify([...document.querySelectorAll('[data-kk]')].map(b => b.textContent.trim()))");
  console.log('before', await keys());
  await t.eval("document.querySelector('[data-kw=\"aim120\"]').click(); document.querySelector('[data-kk=\"0\"]').click(); 1");
  console.log('after AMRAAM -> 1', await keys(), 'saved', await t.eval("JSON.stringify(Profile.modsOf('f16c').keys)"));
  await t.eval("document.querySelector('[data-kw=\"mk82\"]').click(); document.querySelector('[data-kk=\"4\"]').click(); 1");
  console.log('after Mk 82 -> 5', await keys());
  await t.shot('weapon-keys');
  console.log('in battle', await t.eval(`(() => { UI.close && UI.close(); const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], time: 300 }, [{ name: 'T', plane: 'f16c', loadout: Profile.loadoutFor('f16c'), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); for (let k = 0; k < 5; k++) Game.update(1/30); Game.render(); return JSON.stringify(Game.match.player.weaponSlots()); })()`));
  await t.key('5'); console.log('bombs after key 5:', await t.eval("Game.match.player.count('b')"), '| settings rows mention Weapon 1:', await t.eval("(() => { Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); UI.open('profile'); return document.querySelector('#binds').textContent.includes('Weapon 1'); })()"));
}
