// node tools/tests/cdp.mjs tools/tests/cards.mjs : the hangar's side card for a few aircraft (IDS=...), with what it lists
// as equipment, pictured
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const id of (process.env.IDS || 'f16c,bf109e,mig23,lancaster').split(',')) {
    await t.eval(`(() => { const p = Profile.get(); p.owned['${id}'] = true; UI.open('hangar'); document.querySelector('[data-nat="' + PLANES['${id}'].nation + '"]').click(); document.querySelector('[data-pid="${id}"]').click(); return 1; })()`);
    await new Promise(r => setTimeout(r, 1200));
    console.log(id + ': ' + await t.eval(`[...document.querySelectorAll('#side .stat')].map(e => e.children[0].textContent + ' = ' + e.children[1].textContent).filter(x => /Engines|Radar|sensors|Warning|Counter|Sight/.test(x)).join(' | ')`));
    await t.eval(`(() => { const s = document.querySelector('#side .stat:last-child'); if (s) s.scrollIntoView(); return 1; })()`);
    await t.shot('card-' + id);
  }
}
