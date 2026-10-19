// node tools/tests/cdp.mjs tools/tests/features.mjs : pylon diagram, number-key weapons, missile switching, bombsight view
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval("(() => { localStorage.clear(); Profile.reset(); const p = Profile.get(); p.coins = 9e6; ['p47d','b17g','f16c','f4e'].forEach(id => p.owned[id] = true); p.selected = 'p47d'; Profile.save(); UI.refresh(); return 1; })()");
  console.log('old save migration:', await t.eval(`(() => { const p = Profile.get(); p.mods.p47d = { belts: {}, beltSel: {}, stores: { b500: true, hvar: true }, loadout: [null, 'b500', 'hvar'], upg: {}, inst: {} };
    const m = Profile.modsOf('p47d'); return JSON.stringify({ owned: Object.keys(m.stores), slots: m.slots }); })()`));
  await t.eval("(() => { delete Profile.get().mods.p47d; return 1; })()");
  // ---- pylon diagram: P-47D (centreline + wing pylons + rails), fit a bomb on one wing pylon with the mirror on
  console.log('slots p47d', await t.eval("JSON.stringify(Loadout.slots(PLANES.p47d).map(s => [s.name, s.side, s.rank, s.mirror]))"));
  console.log('slots f4e ', await t.eval("JSON.stringify(Loadout.slots(PLANES.f4e).map(s => s.name[0] + s.side))"));
  console.log('slots b17g', await t.eval("JSON.stringify(Loadout.slots(PLANES.b17g).map(s => [s.name, s.pylons, s.bay]))"));
  await t.eval("['an_m64', 'an_m65', 'hvar'].forEach(id => STORES[id] && Profile.buyStore('p47d', id)); UI.open('mods'); document.querySelector('[data-mt=loadout]').click(); 1");
  const fitted = await t.eval(`(() => { const sl = Loadout.slots(PLANES.p47d), wing = sl.find(s => s.side === -1 && /Wing/.test(s.name)); const id = Object.keys(Profile.modsOf('p47d').stores).find(k => STORES[k].kind === 'b');
    document.querySelector('[data-slot="' + wing.i + '"]').click(); const b = document.querySelector('[data-fit="' + id + '"]'); if (!b) return 'no fit button for ' + id; b.click();
    const m = Profile.modsOf('p47d'); return id + ' -> left ' + m.slots[wing.i] + ', mirror ' + m.slots[wing.mirror] + ', payload ' + Profile.loadoutMass('p47d'); })()`);
  console.log('fit with mirror:', fitted);
  await t.shot('ui-pylons');
  // ---- B-17G in realistic mode: no bomb pipper, bombsight with B, bombs with 1
  console.log('b17 fit', await t.eval("(() => { UI.close(); const p = Profile.get(); p.selected = 'b17g'; const bb = Object.keys(STORES).filter(k => STORES[k].kind === 'b' && Loadout.allowed(PLANES.b17g, Loadout.slots(PLANES.b17g)[0], k) && STORES[k].mass * 6 <= PLANES.b17g.payload).pop(); Profile.buyStore('b17g', bb); return bb + ' ' + JSON.stringify(Loadout.slots(PLANES.b17g).map(s => Profile.setSlot('b17g', s.i, bb, false))); })()"));
  console.log('b17 loadout', await t.eval("JSON.stringify(Profile.loadoutFor('b17g').stores)"));
  await t.eval(`(() => { const cfg = Plan.build({ mode: 'destroy', teamSize: [2, 2], time: 300, realistic: true, fill: true }, [{ name: 'T', plane: 'b17g', loadout: Profile.loadoutFor('b17g'), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const p = Game.match.player; p.onGround = false; p.gearDown = false; p.pos.y = 3000; p.vel.set(0, 0, -110); return 1; })()`);
  for (let i = 0; i < 3; i++) await t.eval("for (let k = 0; k < 10; k++) Game.update(1/30); Game.render(); 1");
  await t.key('b'); await t.eval("Game.render(); 1"); await t.sleep(100);
  console.log('camMode after B:', await t.eval("Game.camMode + ' sight=' + (Game.match.player.def.bombsight && Game.match.player.def.bombsight.name)"));
  await t.eval("for (let k = 0; k < 4; k++) Game.update(1/30); Game.render(); 1");
  await t.shot('bombsight-b17');
  const nb0 = await t.eval("Game.match.player.count('b')"); await t.key('1'); await t.key('1', 'keyUp'); const nb1 = await t.eval("Game.match.player.count('b')");
  console.log('bombs before/after key 1:', nb0, nb1, '| bombs in the air', await t.eval("Game.match.combat.bombs.length"));
  await t.key('b'); await t.eval("Game.leave(); document.querySelector('#res-ok') && document.querySelector('#res-ok').click(); 1");
  // ---- F-16C with two missile types: key 5 switches, key 3 fires (needs a lock: just check the selection)
  await t.eval(`(() => { const sl = Loadout.slots(PLANES.f16c), ms = Object.keys(STORES).filter(k => STORES[k].kind === 'm' && sl.some(s => Loadout.allowed(PLANES.f16c, s, k))); ms.forEach(k => Profile.buyStore('f16c', k));
    const a = ms.find(k => STORES[k].seek === 'ir'), b = ms.find(k => STORES[k].seek !== 'ir'); let n = 0; for (const s of sl) { if (Loadout.allowed(PLANES.f16c, s, n % 2 ? b : a)) Profile.setSlot('f16c', s.i, n++ % 2 ? b : a, false); }
    Profile.get().selected = 'f16c'; const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], time: 300 }, [{ name: 'T', plane: 'f16c', loadout: Profile.loadoutFor('f16c'), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); return 1; })()`);
  await t.eval("for (let k = 0; k < 10; k++) Game.update(1/30); 1");
  const s0 = await t.eval("Game.match.player.missileStation() && Game.match.player.missileSel"); await t.key('5'); const s1 = await t.eval("Game.match.player.missileSel");
  console.log('missile types', await t.eval("JSON.stringify(Game.match.player.missileTypes())"), 'selected', s0, '-> after 5:', s1);
  console.log('binds', await t.eval("['bombs','rockets','missile','flares','missileSelect','bombsight','brakes'].map(a => a + '=' + Input.label(Input.bind(a))).join(' ')"));
}
