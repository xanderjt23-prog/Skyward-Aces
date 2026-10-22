// node tools/tests/cdp.mjs tools/tests/parts.mjs : the named parts of an aircraft (IDS=f4e,...) with their bounding boxes
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const id of (process.env.IDS || 'f4e').split(',')) {
    console.log(id, await t.eval(`(() => { Airframe.check = []; Models.aircraft(PLANES['${id}']); const sp = Airframe.spec(PLANES['${id}']);
      const out = Airframe.check.map(({ name, g }) => { g.computeBoundingBox(); const b = g.boundingBox, f = v => v.toFixed(2); return name + ' x[' + f(b.min.x) + ',' + f(b.max.x) + '] y[' + f(b.min.y) + ',' + f(b.max.y) + '] z[' + f(b.min.z) + ',' + f(b.max.z) + ']'; });
      return 'stab ' + JSON.stringify(sp.stab && { x0: sp.stab.x0, b: sp.stab.b, y: sp.stab.y, zLE: sp.stab.zLE }) + '\\n' + out.join('\\n'); })()`));
  }
}
