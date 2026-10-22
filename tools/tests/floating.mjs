// node tools/tests/cdp.mjs tools/tests/floating.mjs : finds parts of an aircraft model that float free of the rest.
// The finished model's triangles are split into connected pieces (vertices welded at 1 mm); every piece bigger than
// MIN m must come within GAP m of another piece, or it is reported with its position. IDS=a,b to limit.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const out = await t.eval(`(() => {
    const GAP = ${process.env.GAP || 0.12}, MIN = ${process.env.MIN || 0.4}, ids = ${process.env.IDS ? JSON.stringify(process.env.IDS.split(',')) : 'PLANE_LIST.map(p => p.id)'}, res = [];
    for (const id of ids) {
      const m = Models.aircraft(PLANES[id]); m.updateMatrixWorld(true);
      const P = []; m.traverse(o => { if (!o.isMesh || !o.geometry.attributes.position) return; for (let q = o; q; q = q.parent) if (!q.visible) return; const g = o.geometry, pa = g.attributes.position, v = new THREE.Vector3(), ix = g.index ? g.index.array : null, n = ix ? ix.length : pa.count;
        const base = P.length; const pts = []; for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); pts.push([v.x, v.y, v.z]); }
        for (let i = 0; i < n; i += 3) P.push([pts[ix ? ix[i] : i], pts[ix ? ix[i + 1] : i + 1], pts[ix ? ix[i + 2] : i + 2]]); });
      // union-find over welded vertices
      const key = p => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000), idOf = new Map(), par = [];
      const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      const vid = p => { const k = key(p); let i = idOf.get(k); if (i === undefined) { i = par.length; par.push(i); idOf.set(k, i); } return i; };
      const tv = P.map(tr => tr.map(vid)); for (const [a, b, c] of tv) { const ra = find(a), rb = find(b), rc = find(c); par[rb] = ra; par[find(rc)] = ra; }
      const comp = new Map(); const pos = []; idOf.forEach((i, k) => { pos[i] = k.split(',').map(x => +x / 1000); });
      for (let i = 0; i < par.length; i++) { const r = find(i); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(i); }
      // spatial hash of triangles (each triangle in every cell its box touches) with their piece; distance = point to triangle
      const C = 0.3, grid = new Map(), cl = v => Math.floor(v / C), triPiece = tv.map(t => find(t[0]));
      P.forEach((tr, ti) => { const lo = [0, 1, 2].map(a => cl(Math.min(tr[0][a], tr[1][a], tr[2][a]) - GAP)), hi = [0, 1, 2].map(a => cl(Math.max(tr[0][a], tr[1][a], tr[2][a]) + GAP));
        if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 4000) return;
        for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = x + ',' + y + ',' + z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(ti); } });
      const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), Q = new THREE.Vector3(), T = new THREE.Triangle(), out = new THREE.Vector3();
      // which pieces touch which (within GAP, sampling vertices and points along edges)
      const adj = new Map(), info = new Map();
      for (const [r, vs] of comp) {
        const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const i of vs) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i][a]); hi[a] = Math.max(hi[a], pos[i][a]); }
        info.set(r, { lo, hi, size: Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), n: vs.length }); const nb = new Set(); adj.set(r, nb);
        const samples = vs.map(i => pos[i]); P.forEach((tr, ti) => { if (triPiece[ti] !== r) return; for (let e = 0; e < 3; e++) { const p0 = tr[e], p1 = tr[(e + 1) % 3]; for (let k = 1; k < 8; k++) { const u = k / 8; samples.push([p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u]); } } });
        for (const p of samples) { const l = grid.get(cl(p[0]) + ',' + cl(p[1]) + ',' + cl(p[2])); if (!l) continue; Q.set(p[0], p[1], p[2]);
          for (const ti of l) { const o = triPiece[ti]; if (o === r || nb.has(o)) continue; const tr = P[ti]; T.set(A.set(...tr[0]), B.set(...tr[1]), Cc.set(...tr[2])); T.closestPointToPoint(Q, out); if (out.distanceToSquared(Q) < GAP * GAP) nb.add(o); } }
      }
      for (const [r, nb] of adj) for (const o of nb) if (adj.has(o)) adj.get(o).add(r); // touching is mutual
      // everything must link back to the biggest piece (the fuselage) through touching pieces
      let main = null; for (const [r, f] of info) if (!main || f.n > info.get(main).n) main = r;
      const seen = new Set([main]), q = [main]; while (q.length) { const r = q.pop(); for (const o of adj.get(r) || []) if (!seen.has(o)) { seen.add(o); q.push(o); } }
      for (const [r, f] of info) if (!seen.has(r) && f.size >= MIN) res.push(id + ': piece ' + f.size.toFixed(2) + ' m at x[' + f.lo[0].toFixed(2) + ',' + f.hi[0].toFixed(2) + '] y[' + f.lo[1].toFixed(2) + ',' + f.hi[1].toFixed(2) + '] z[' + f.lo[2].toFixed(2) + ',' + f.hi[2].toFixed(2) + ']');
    }
    return res.length + ' floating pieces\\n' + res.join('\\n'); })()`);
  console.log(out);
}
