// node tools/tests/cdp.mjs tools/tests/basecost.mjs : vertices per ground target (every kind, size and a few eras), and build time
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  console.log(await t.eval(`(() => { const out = [];
    for (const kind of ['airfield', 'factory', 'camp', 'city', 'sam', 'ship', 'carrier', 'balloon']) for (const era of [1, 3, 4, 6]) { const t0 = performance.now(); const B = Models.base(kind, 'big', 0, era); let v = 0; B.group.traverse(o => { if (o.geometry) v += o.geometry.attributes.position.count; });
      out.push(kind + '/' + era + ': ' + Math.round(v / 1000) + 'k verts ' + Math.round(performance.now() - t0) + ' ms'); }
    return out.join(' | '); })()`));
}
