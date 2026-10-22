// node tools/tests/cdp.mjs tools/tests/photoui.mjs : the photographs where the player sees them: the hangar cards and side
// panel (with the credit), and the weapons list in Modifications
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval("(() => { const p = Profile.get(); p.owned.bf109e = true; p.owned.bf109g = true; p.owned.f16c = true; p.selected = 'bf109e'; UI.open('hangar'); return 1; })()");
  await new Promise(r => setTimeout(r, 2500)); await t.shot('ui-hangar-photos');
  console.log('hangar photos shown:', await t.eval("document.querySelectorAll('#panel-body img.photo').length"), 'side photo:', await t.eval("!!document.querySelector('#side .side-photo')"), 'credit:', await t.eval("(document.querySelector('#side .credit') || {}).textContent"));
  await t.eval("(() => { Profile.get().selected = 'f16c'; UI.open('mods'); document.querySelector('[data-mt=\"loadout\"]').click(); return 1; })()");
  await new Promise(r => setTimeout(r, 1500));
  await t.eval("document.querySelector('.store-photo').scrollIntoView(); 1"); await t.shot('ui-mods-photos');
  console.log('weapon photos shown:', await t.eval("document.querySelectorAll('img.store-photo').length"), 'of', await t.eval("document.querySelectorAll('.store-photo').length"));
}
