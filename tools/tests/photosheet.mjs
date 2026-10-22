// node tools/tests/cdp.mjs tools/tests/photosheet.mjs : contact sheets of the photographs (KIND=planes|stores), each with
// its game name and the Wikipedia article it came from, 30 to a sheet, to check every photo shows the right thing
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const kind = process.env.KIND || 'planes';
  const n = await t.eval(`Object.keys(PHOTO_CREDITS).filter(k => k.startsWith('${kind}/')).length`);
  for (let s = 0; s * 30 < n; s++) {
    await t.eval(`(() => { let d = document.getElementById('sheet'); if (!d) { d = document.createElement('div'); d.id = 'sheet'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#222;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:4px;color:#fff;font:11px sans-serif;overflow:hidden'; document.body.appendChild(d); }
      const keys = Object.keys(PHOTO_CREDITS).filter(k => k.startsWith('${kind}/')).slice(${s * 30}, ${s * 30 + 30});
      d.innerHTML = keys.map(k => { const c = PHOTO_CREDITS[k], id = k.split('/')[1], nm = '${kind}' === 'planes' ? PLANES[id].name : STORES[id].name;
        return '<div style="background:#333;height:140px;overflow:hidden"><img src="' + c.src + '" style="width:100%;height:100px;object-fit:cover"><div><b>' + nm + '</b> | ' + c.article + '</div></div>'; }).join(''); return 1; })()`);
    await new Promise(r => setTimeout(r, 1500));
    await t.shot(`photos-${kind}-${s}`);
  }
}
