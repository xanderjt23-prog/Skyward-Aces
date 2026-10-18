// node tools/tests/cdp.mjs tools/tests/meshcheck.mjs : builds every aircraft and checks each generated part is
// watertight (every edge shared by exactly two triangles), faces outwards (positive signed volume) and has no NaNs
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  // 1. the registry: every aircraft explicitly defined and valid; a missing property must throw, not fall back to a default
  const reg = JSON.parse(await t.eval(`(() => {
    const errors = Airframe.audit(PLANE_LIST), ids = PLANE_LIST.map(p => p.id), missing = ids.filter(id => !Airframe.REGISTRY[id]);
    const probe = (mut, label) => { const id = '__probe' + label; const base = JSON.parse(JSON.stringify(Airframe.REGISTRY.f22a)); mut(base); Airframe.REGISTRY[id] = base;
      try { Airframe.spec(Object.assign({}, PLANES.f22a, { id })); return label + ': NOT rejected'; } catch (e) { return label + ': rejected (' + e.message.replace(/^Airframe "[^"]+": /, '') + ')'; } finally { delete Airframe.REGISTRY[id]; } };
    const probes = [probe(e => { delete e.canardPresence; }, 'no canardPresence'), probe(e => { e.finCantDeg = 0; }, 'canted fins without a cant'),
      probe(e => { e.intakeProfile = 'tube'; }, 'unknown intake'), probe(e => { delete e.fuselage.fuselageLengthToWidthRatio; }, 'no width ratio'),
      probe(e => { e.canardPresence = true; e.canardLength = 0; }, 'canards without a length'), probe(e => { delete e.wing.sweepTE; }, 'diamond wing without TE sweep')];
    let unknown = false; try { Airframe.spec({ id: '__nope', len: 10, span: 10, kind: 'jet', eng: 1, crew: ['pilot'], shape: 'jet_sw', era: 6 }); } catch (e) { unknown = true; }
    return JSON.stringify({ count: Object.keys(Airframe.REGISTRY).length, errors, missing, probes, unknown });
  })()`));
  console.log('registry entries', reg.count, '| aircraft without an entry:', reg.missing.length, '| invalid entries:', reg.errors.length, reg.errors.slice(0, 5).join(' / '));
  console.log('unregistered aircraft throws:', reg.unknown);
  for (const p of reg.probes) console.log('  probe -', p);
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
  // 3. the anomaly checklist each aircraft went through
  if (process.env.LOG) { const log = JSON.parse(await t.eval('JSON.stringify(Airframe.anomalies)')); for (const id of process.env.LOG.split(',')) console.log(id + ':\n  - ' + (log[id] || []).join('\n  - ')); }
}
