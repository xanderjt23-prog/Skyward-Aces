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
  // 2b. the 4-stage pipeline on the built meshes
  const pipe = JSON.parse(await t.eval(`(() => {
    const out = { naca: '', open: [], solid: [], skin: [] };
    // wing sections: a true NACA teardrop - round leading edge, max thickness near 30% chord, razor-thin trailing edge
    const P = Models.primitives, th = p => P.naca(p, 0.1), xs = Array.from({ length: 201 }, (_, i) => i / 200), tmax = Math.max(...xs.map(th)), at = xs[xs.map(th).indexOf(tmax)];
    const round = th(0.0025) / th(0.01); // a round nose grows like sqrt(x): 0.5; a sharp wedge would be 0.25
    out.naca = 'max t/c ' + (2 * tmax).toFixed(3) + ' at ' + (at * 100).toFixed(0) + '% chord, trailing edge ' + Math.abs(2 * th(1)).toFixed(4) + ', leading-edge roundness ' + round.toFixed(2) + ' (sqrt law 0.5)';
    if (!(at > 0.25 && at < 0.35 && Math.abs(th(1)) < 0.002 && round > 0.42)) out.nacaBad = true;
    const ray = new THREE.Raycaster();
    for (const pl of PLANE_LIST) {
      const sp = Airframe.spec(pl), m = Models.aircraft(pl), body = m.userData.body; body.updateMatrixWorld(true);
      const skinM = body.material; body.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); // this copy only: rays must also see the skin from inside
      const bb = new THREE.Box3();
      // stage 2: every fuselage jet's exhaust is open and stands proud of the blunt exhaust plane
      const fj = sp.engines.filter(g => g.kind === 'fus' || g.kind === 'tunnel');
      for (const g of fj) { // a ray from behind straight up the tailpipe must hit the dark engine face, not skin
        ray.set(new THREE.Vector3(g.x + g.r * 0.4, g.y, sp.L), new THREE.Vector3(0, 0, -1)); const h = ray.intersectObject(body, false)[0];
        if (!h) { out.open.push(pl.id + ': no hit up the tailpipe'); continue; }
        const c = body.geometry.attributes.color, lum = (c.getX(h.face.a) + c.getY(h.face.a) + c.getZ(h.face.a)) / 3;
        if (lum > 0.12 || h.point.z < sp.nozzleZ - 0.1) out.open.push(pl.id + ': tailpipe blocked at z ' + h.point.z.toFixed(2) + ' (lum ' + lum.toFixed(2) + ')'); }
      // stage 1: no see-through gap on the centreline of the deck / stealth bodies, intakes to tail (rays from above and from the side)
      if (sp.arch !== 'SINGLE_TUBE') { const zA = sp.arch === 'TWIN_NACELLE_DECK' ? sp.tunnel.zA + 0.3 : sp.canopy.z + sp.canopy.len, zB = (sp.nozzleZ || sp.L / 2) - 0.6; // stop short of the tailpipes, which are separate closed parts sunk into the body
        for (let i = 0; i <= 16; i++) { const z = zA + (zB - zA) * i / 16;
          const rh = sp.rearHex ? sp.rearHex(z, sp.chine.hex(sp.at(z))) : null, xo = rh ? Math.min(0.4, Math.max(rh.wt, rh.wb) * 0.8) : 0.4;
          for (const x of [0, -xo, xo]) { ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)); const hs = ray.intersectObject(body, false); if (!hs.length) out.solid.push(pl.id + ': gap from above at x ' + x + ', z ' + z.toFixed(1)); }
          // from the side: a solid centre means the ray enters the skin once on each side and meets no inner walls near x = 0
          ray.set(new THREE.Vector3(30, sp.arch === 'TWIN_NACELLE_DECK' ? sp.tunnel.at(z).y + sp.tunnel.at(z).h * 0.15 : rh ? (rh.cy + rh.bot) / 2 : sp.at(z).y - sp.at(z).h * 0.5, z), new THREE.Vector3(-1, 0, 0)); const hx = ray.intersectObject(body, false);
          if (hx.length < 2 || hx.some(h => Math.abs(h.point.x) < (rh ? Math.min(0.3, Math.max(rh.wt, rh.wb) * 0.5) : 0.3))) out.solid.push(pl.id + ': centre not solid seen from the side at z ' + z.toFixed(1)); } }
      // stage 4: the airframe carries the skin shader with its per-vertex tags
      const a = body.geometry.attributes.aSkin; if (!a || !(skinM.onBeforeCompile && skinM.userData.u)) out.skin.push(pl.id);
    }
    return JSON.stringify(out); })()`));
  console.log('NACA wing sections:', pipe.naca, pipe.nacaBad ? 'BAD' : 'ok');
  console.log('open exhausts (ray up every tailpipe hits the engine face):', pipe.open.length ? pipe.open.length + ' FAIL ' + pipe.open.slice(0, 12).join(' / ') : 'all ok');
  console.log('solid deck / stealth centreline (no see-through gaps):', pipe.solid.length ? pipe.solid.length + ' FAIL ' + pipe.solid.slice(0, 12).join(' / ') : 'all ok');
  console.log('skin shader on every airframe:', pipe.skin.length ? 'missing on ' + pipe.skin.join(' ') : 'all ok');
  // 2c. every feature the registry declares was actually built (its rule fired in the builder's checklist)
  const unbuilt = JSON.parse(await t.eval(`(() => {
    const RULE = { bellyScoop: 'belly radiator', chinRadiator: 'chin radiator', wingRadiators: /radiator baths|wing-root leading edges/, wingGlove: 'wing glove', spats: 'spats',
      gunHump: 'gun hump', vStruts: 'V-struts', tipTanks: 'tip tanks', wingFences: 'fences', tipRails: 'missile rails', gearPods: 'gear pods', gau8: 'GAU-8',
      conformalTanks: 'conformal', ventralTank: 'ventral tank', duckbillNose: 'duckbill', dorsalFin: 'dorsal fin', ventralFin: 'ventral fin' };
    const out = [];
    for (const pl of PLANE_LIST) { const log = (Airframe.anomalies[pl.id] || []).join(' | ');
      for (const x of Airframe.REGISTRY[pl.id].extras) { const r = RULE[x]; if (r && !(typeof r === 'string' ? log.includes(r) : r.test(log))) out.push(pl.id + ':' + x); } }
    return JSON.stringify(out); })()`));
  console.log('declared features actually built:', unbuilt.length ? unbuilt.length + ' MISSING ' + unbuilt.join(' ') : 'all ok');
  // 3. the anomaly checklist each aircraft went through
  if (process.env.LOG) { const log = JSON.parse(await t.eval('JSON.stringify(Airframe.anomalies)')); for (const id of process.env.LOG.split(',')) console.log(id + ':\n  - ' + (log[id] || []).join('\n  - ')); }
}
