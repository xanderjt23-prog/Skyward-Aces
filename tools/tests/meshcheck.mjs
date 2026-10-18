// node tools/tests/cdp.mjs tools/tests/meshcheck.mjs : builds every aircraft and checks each generated part is
// watertight (every edge shared by exactly two triangles), faces outwards (positive signed volume) and has no NaNs
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const out = await t.eval(`(() => {
    const res = { planes: 0, parts: 0, flipped: {}, open: [], inverted: [], nan: [], tris: 0, maxTris: 0, maxId: '' };
    for (const pl of PLANE_LIST) {
      Airframe.check = [];
      const m = Models.aircraft(pl); res.planes++;
      let tris = 0; m.traverse(o => { if (o.geometry && o.geometry.attributes.position) tris += o.geometry.attributes.position.count / 3; });
      res.tris += tris; if (tris > res.maxTris) { res.maxTris = tris; res.maxId = pl.id; }
      for (const { name, g, flipped } of Airframe.check) {
        res.parts++;
        if (flipped) res.flipped[name] = (res.flipped[name] || 0) + 1;
        const p = g.attributes.position.array, ix = g.index.array, key = i => Math.round(p[i * 3] * 1e4) + ',' + Math.round(p[i * 3 + 1] * 1e4) + ',' + Math.round(p[i * 3 + 2] * 1e4);
        if (p.some(v => !(v === v))) { res.nan.push(pl.id + ':' + name); continue; }
        const edges = new Map(); let vol = 0;
        for (let i = 0; i < ix.length; i += 3) {
          const k = [key(ix[i]), key(ix[i + 1]), key(ix[i + 2])];
          if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) continue; // degenerate (collapsed tip) triangle
          for (let e = 0; e < 3; e++) { const a = k[e], b = k[(e + 1) % 3], id = a < b ? a + '|' + b : b + '|' + a; edges.set(id, (edges.get(id) || 0) + 1); }
          const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
          vol += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
        }
        let bad = 0; for (const n of edges.values()) if (n !== 2) bad++;
        if (bad) res.open.push(pl.id + ':' + name + '(' + bad + ')');
        if (vol <= 0) res.inverted.push(pl.id + ':' + name);
      }
    }
    Airframe.check = null;
    res.avgTris = Math.round(res.tris / res.planes);
    return JSON.stringify(res);
  })()`);
  const r = JSON.parse(out);
  console.log('aircraft', r.planes, 'parts', r.parts, 'avg triangles', r.avgTris, 'max', r.maxTris, r.maxId);
  console.log('generator winding fixed by orient():', JSON.stringify(r.flipped));
  console.log('open (non-watertight) parts:', r.open.length, r.open.slice(0, 30).join(' '));
  console.log('inside-out parts:', r.inverted.length, r.inverted.slice(0, 30).join(' '));
  console.log('NaN parts:', r.nan.length, r.nan.slice(0, 30).join(' '));
}
