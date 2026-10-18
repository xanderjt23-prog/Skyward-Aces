// ============================================================================
// Aircraft models, generated from the parametric airframe (airframe.js).
// Every part is one of three closed primitives, all lined up on the aircraft's
// central axis (nose -Z, up +Y, right +X):
//   loftBody     - superellipse cross-sections lofted along Z (fuselage, nacelles,
//                  pods, intake ducts, canopies), with flat end caps
//   latheRing    - a closed profile turned about Z (nozzles, intake lips, spinners,
//                  shock cones)
//   loftSurface  - NACA-section stations lofted along the span (wings, tailplanes,
//                  fins, canards), with root and tip caps
// orient() then checks each part's signed volume and makes every triangle face
// outwards, so no face is inside-out from any angle; Airframe.check collects the
// parts for the mesh test (tools/tests/meshcheck.mjs). Nothing is placed by eye:
// canopies, guns, markings and fins are positioned from the same spec formulas.
// ============================================================================
(() => {
  const { Builder, box, cyl, zcyl, paint, mat, turretPos, insignia } = Models;
  const V = THREE.Vector3;
  const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };

  // ======================= primitives =======================
  function indexed(pos, idx) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g; }
  // outward-facing check: a closed mesh has positive signed volume when its triangles wind counter-clockwise seen from outside
  function orient(g, name) {
    const p = g.attributes.position.array, ix = g.index.array; let vol = 0;
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      vol += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
    if (vol < 0) for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.computeVertexNormals();
    if (Airframe.check) Airframe.check.push({ name, g, flipped: vol < 0 });
    return g;
  }
  // superellipse point: n = 2 ellipse, larger n squarer
  const sep = (a, n) => Math.sign(a) * Math.pow(Math.abs(a), 2 / n);
  // secs: [{z, w, h, y, x}] in increasing z; side quads wind (θ, θ+dθ, next station) = outward for this ordering
  function loftBody(secs, segs, n, name) {
    const pos = [], idx = [];
    for (const s of secs) for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; pos.push((s.x || 0) + s.w * sep(Math.cos(a), n), s.y + s.h * sep(Math.sin(a), n), s.z); }
    for (let i = 0; i < secs.length - 1; i++) for (let j = 0; j < segs; j++) {
      const a = i * segs + j, b = i * segs + (j + 1) % segs, c = (i + 1) * segs + (j + 1) % segs, d = (i + 1) * segs + j;
      idx.push(a, b, c, a, c, d);
    }
    for (const [k, back] of [[0, false], [secs.length - 1, true]]) { // end caps with their own vertices, so they shade flat
      const s = secs[k], base = pos.length / 3; pos.push(s.x || 0, s.y, s.z);
      for (let j = 0; j < segs; j++) pos.push(pos[(k * segs + j) * 3], pos[(k * segs + j) * 3 + 1], pos[(k * segs + j) * 3 + 2]);
      for (let j = 0; j < segs; j++) { const p = base + 1 + j, q = base + 1 + (j + 1) % segs; if (back) idx.push(base, p, q); else idx.push(base, q, p); }
    }
    return orient(indexed(pos, idx), name);
  }
  // a closed (r, z) profile loop turned about the Z axis; each profile edge gets its own rings so corners stay crisp
  function latheRing(prof, segs, name, cx, cy, sx, sy) {
    const pos = [], idx = [];
    for (let i = 0; i < prof.length; i++) {
      const p0 = prof[i], p1 = prof[(i + 1) % prof.length], base = pos.length / 3;
      for (const [r, z] of [p0, p1]) for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; pos.push((cx || 0) + r * Math.cos(a) * (sx || 1), (cy || 0) + r * Math.sin(a) * (sy || 1), z); }
      for (let j = 0; j < segs; j++) { const a = base + j, b = base + (j + 1) % segs, c = base + segs + (j + 1) % segs, d = base + segs + j; idx.push(a, b, c, a, c, d); }
    }
    return orient(indexed(pos, idx), name);
  }
  // symmetric NACA 4-digit thickness (closed trailing edge)
  const naca = (p, t) => 5 * t * (0.2969 * Math.sqrt(p) - 0.126 * p - 0.3516 * p * p + 0.2843 * p * p * p - 0.1036 * p * p * p * p);
  // st: [{x, le, c, y, t}] along +X (span); the section ring runs TE -> lower -> LE -> upper
  function loftSurface(st, m, name) {
    const pos = [], idx = [], ring = [];
    for (let k = m; k >= 0; k--) ring.push([(1 - Math.cos(Math.PI * k / m)) / 2, -1]);
    for (let k = 1; k < m; k++) ring.push([(1 - Math.cos(Math.PI * k / m)) / 2, 1]);
    const M = ring.length;
    for (const s of st) for (const [p, sg] of ring) pos.push(s.x, s.y + sg * naca(p, s.t) * s.c, s.le + p * s.c);
    for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + (j + 1) % M, c = (i + 1) * M + (j + 1) % M, d = (i + 1) * M + j;
      idx.push(a, b, c, a, c, d);
    }
    for (const k of [0, st.length - 1]) {
      const s = st[k], base = pos.length / 3; pos.push(s.x, s.y, s.le + s.c * 0.4);
      for (let j = 0; j < M; j++) pos.push(pos[(k * M + j) * 3], pos[(k * M + j) * 3 + 1], pos[(k * M + j) * 3 + 2]);
      for (let j = 0; j < M; j++) idx.push(base, base + 1 + j, base + 1 + (j + 1) % M);
    }
    return orient(indexed(pos, idx), name);
  }
  // mirror across the centre plane: negate X and reverse every triangle so the copy still faces outwards
  function mirrorX(g) {
    const h = g.clone(), p = h.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
    const ix = h.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    h.computeVertexNormals(); return h;
  }
  const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(4, pts.length * 3), r, 5, false);
  const sphere = (r, a, b) => new THREE.SphereGeometry(r, a || 10, b || 8);

  // stations of a lifting surface from its spec (root .. tip) with a rounded tip
  function surfStations(g, at, opt) {
    opt = opt || {};
    const fs = [0, 0.1, 0.22, 0.35, 0.5, 0.62, 0.75, 0.86, 0.94];
    if (g.kink) fs.push(g.kink[0] - 0.01, g.kink[0] + 0.01);
    fs.sort((a, b) => a - b);
    const st = fs.map(f => { const w = at(f); return { x: w.x, le: w.le, c: w.c, y: w.y, t: g.t }; });
    const tip = at(1);
    if (opt.square || tip.c < 0.6) st.push({ x: tip.x, le: tip.le, c: Math.max(0.12, tip.c), y: tip.y, t: g.t }); // cropped tip (tip tanks, deltas)
    else for (const [f, kc, kt] of [[0.975, 0.93, 0.85], [0.993, 0.72, 0.6], [1, 0.4, 0.3]]) { // rounded tip: chord and thickness close in
      const w = at(f), c = w.c * kc; st.push({ x: w.x, le: w.le + (w.c - c) * 0.45, c, y: w.y - (g.droop ? (f - 0.95) * 4 * w.c * 0.4 : 0), t: g.t * kt });
    }
    return st;
  }

  // ======================= the aircraft =======================
  const cache = {};
  Models.aircraft = function (pl) {
    if (!cache[pl.id]) cache[pl.id] = build(pl);
    // every craft gets its own meshes (wings are hidden when shot off) over shared geometry
    const c = cache[pl.id], g = new THREE.Group();
    const mk = (src, parent) => { const m = new THREE.Mesh(src.geometry, src.material); m.position.copy(src.position); m.rotation.copy(src.rotation); m.scale.copy(src.scale); m.visible = src.visible; m.name = src.name; for (const ch of src.children) m.add(mk(ch)); if (parent) parent.add(m); return m; };
    const body = mk(c.body, g), glass = mk(c.glass, g), wingL = mk(c.wingL, g), wingR = mk(c.wingR, g);
    const pilot = glass.children.find(o => o.name === 'pilot') || null;
    const marks = c.marks ? mk(c.marks, g) : null, lamps = c.lamps ? mk(c.lamps, g) : null;
    const props = c.props.map(p => { const q = new THREE.Group(); q.position.copy(p.position); for (const ch of p.children) q.add(mk(ch)); g.add(q); return q; });
    const glows = c.glows.map(gl => mk(gl, g));
    const gear = c.gear ? mk(c.gear, g) : null;
    g.userData = { props, glows, wingL, wingR, body, glass, pilot, marks, lay: Models.layout(pl), gear };
    return g;
  };

  function build(pl) {
    const sp = Airframe.spec(pl), lk = sp.look, { L, S, R } = sp, z0 = -L / 2;
    const pt = paint(pl), camo = [pt.top, pt.bot], dark = 0x222222, metal = 0x6a6e72, burnt = 0x4a4642, frameC = shade(pt.top, 0.55);
    const ww1 = pl.era === 1 || (sp.bi && pl.era <= 2);
    const body = new Builder(), wl = new Builder(), wr = new Builder(), glassB = new Builder(), pilotB = new Builder(), lampB = new Builder();
    const ckB = new Builder(); // cockpit details seen from outside (frames, coaming, gunsight): hidden with the glass in the cockpit view
    const mkB = new Builder(), mkL = new Builder(), mkR = new Builder();
    const lum = (pt.top >> 16 & 255) * 0.3 + (pt.top >> 8 & 255) * 0.59 + (pt.top & 255) * 0.11;
    const nozzleEngines = sp.engines.filter(e => e.kind === 'fus');

    // ---------------- fuselage
    const tEnd = sp.rows[sp.rows.length - 1][0], NS = 40, secs = [];
    for (let i = 0; i <= NS; i++) { const u = (1 - Math.cos(Math.PI * i / NS)) / 2, z = z0 + u * tEnd * L, s = sp.at(z); secs.push({ z, w: Math.max(0.012, s.w), h: Math.max(0.012, s.h), y: s.y }); }
    const zTail = secs[secs.length - 1].z;
    const radome = sp.jet && pl.era >= 5 && sp.intake && sp.intake.type !== 'nose' || (sp.jet && pl.era >= 5 && !sp.intake);
    const glare = !ww1 && !sp.big && lum > 140 && pl.era <= 4; // olive anti-glare panels were a WW2 / Korea-era practice
    const noseDark = sp.intake && sp.intake.type === 'nose';
    const fusPaint = (x, y, z, ny, nz) => {
      if (nz < -0.98 && z < z0 + 0.05 && noseDark) return 0x101010;                  // intake mouth
      if (nz > 0.98 && z > zTail - 0.05) return nozzleEngines.some(e => Math.hypot(x - e.x, y - e.y) < e.r) ? 0x161412 : shade(pt.bot, 0.75); // engine face / tail cap
      if (radome && z < z0 + L * 0.09) return shade(pt.top, 0.7);
      if (glare && ny > 0.55 && z > z0 + L * (sp.jet ? 0.1 : 0.05) && z < sp.canopy.z - sp.canopy.len * 0.5) return 0x2f3229;
      return ny < -0.25 ? pt.bot : pt.top;
    };
    body.add(loftBody(secs, 28, sp.n, 'fuselage'), fusPaint);

    // ---------------- nose: intake lip and shock cone / radar pitot / propeller hub
    if (noseDark) {
      const s = sp.at(z0), r = Math.min(s.w, s.h) * 1.03;
      body.add(latheRing([[r * 0.8, z0 - 0.05], [r, z0 - 0.05], [r, z0 + r * 0.3], [r * 0.8, z0 + r * 0.3]], 24, 'intake lip', 0, s.y, 1, s.h / s.w), shade(pt.top, 0.9));
      if (sp.extra.cone) body.add(latheRing([[0.001, z0 - r * 0.9], [r * 0.5, z0 + 0.1], [0.001, z0 + 0.1]], 18, 'shock cone', 0, s.y), metal);
    }
    if (sp.jet && !noseDark && pl.era >= 4) body.add(cyl(0.025, 0.025, L * 0.05, 6), metal, [0, sp.at(z0).y, z0 - L * 0.02], [Math.PI / 2, 0, 0]); // pitot
    if (sp.extra.gau8) { // A-10: the GAU-8's barrel cluster under the nose, just left of centre
      body.add(cyl(0.17, 0.17, 1.2, 10), 0x2a2a2a, [-0.15, sp.at(z0).y - R * 0.25, z0 - 0.45], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; body.add(cyl(0.025, 0.025, 1.4, 5), 0x1a1a1a, [-0.15 + Math.cos(a) * 0.11, sp.at(z0).y - R * 0.25 + Math.sin(a) * 0.11, z0 - 0.6], [Math.PI / 2, 0, 0]); }
    }
    if (sp.extra.duck) { const s = sp.at(z0 + L * 0.08); body.add(loftBody([0, 0.08, 0.18].map(t => { const q = sp.at(z0 + t * L); return { z: z0 + t * L + 0.05, w: q.w * 1.25 + 0.1, h: q.h * 0.5, y: q.y - q.h * 0.2 }; }), 18, 2.4, 'duckbill'), camo); }

    // ---------------- engines
    const props = [], glows = [];
    const nozzle = (e, x, y, zn) => { // exhaust nozzle: a closed ring with a dark engine face sealed inside it
      const ro = e.r, ri = e.r * 0.84, ln = e.r * (pl.ab ? 0.9 : 0.5), sx = e.rect ? 1.25 : 1, sy = e.rect ? 0.62 : 1;
      body.add(latheRing([[ri, zn - 0.35], [ro, zn - 0.35], [ro * (pl.ab ? 0.92 : 0.97), zn + ln], [ri * (pl.ab ? 0.95 : 1), zn + ln]], 24, 'nozzle', x, y, sx, sy), pl.ab ? burnt : metal);
      body.add(cyl(ri * 1.01, ri * 1.01, 0.05, 20), 0x141210, [x, y, zn + ln * 0.25], [Math.PI / 2, 0, 0], [sx, 1, sy]);
      if (pl.ab) { const gg = new THREE.Mesh(zcyl(ri * 0.9, ri * 0.06, L * 0.32, 12), mat('glow')); gg.scale.set(sx, sy, 1); gg.position.set(x, y, zn + ln + L * 0.16); gg.visible = false; glows.push(gg); }
    };
    const nacelle = (e, prof, name) => body.add(loftBody(prof.map(([t, k, ky]) => ({ z: e.z - e.len / 2 + t * e.len, w: e.r * k, h: e.r * (ky || k), y: e.y, x: e.x })), 20, 2, name), (x, y, z, ny, nz) => nz < -0.98 ? 0x101010 : ny < -0.25 ? pt.bot : pt.top);
    for (const e of sp.engines) {
      if (e.kind === 'fus') nozzle(e, e.x, e.y, e.nozzle);
      else if (e.kind === 'underwing' || e.kind === 'wingnac' || e.kind === 'pod') {
        nacelle(e, [[0, 0.86], [0.05, 0.97], [0.25, 1], [0.7, 0.94], [1, 0.72]], e.kind);
        const zf = e.z - e.len / 2;
        body.add(latheRing([[e.r * 0.72, zf - 0.06], [e.r * 0.9, zf - 0.06], [e.r * 0.9, zf + 0.25], [e.r * 0.72, zf + 0.25]], 20, 'nacelle lip', e.x, e.y), shade(pt.top, 0.9));
        body.add(latheRing([[0.001, zf - e.r * 0.2], [e.r * 0.3, zf + e.r * 0.2], [0.001, zf + e.r * 0.2]], 14, 'fan hub', e.x, e.y), e.kind === 'pod' ? 0x8a8a8a : metal);
        nozzle({ r: e.r * 0.72 }, e.x, e.y, e.z + e.len / 2);
        if (e.kind === 'underwing') { const wa = sp.wingAt(sp.wingF(e.x)); body.add(box(0.12, Math.max(0.1, wa.y - e.y - e.r * 0.6), e.len * 0.45), camo, [e.x, (wa.y + e.y + e.r * 0.6) / 2, e.z - e.len * 0.05]); }
        if (e.kind === 'pod') { const ft = sp.topAt(e.z, e.x * 0.4), side = Math.sign(e.x); // pylon from the upper rear fuselage
          const py = box(0.18, Math.max(0.2, e.y - e.r * 0.7 - ft + 0.25), e.len * 0.42); py.rotateZ(side * 0.5); body.add(py, camo, [e.x * 0.72, (e.y - e.r * 0.7 + ft) / 2, e.z]); }
      } else if (e.kind === 'rootnac' || e.kind === 'sidenac' || e.kind === 'nacelle') { // jet nacelles
        nacelle(e, [[0, 0.88, 0.92], [0.06, 0.98, 1], [0.5, 1, 1], [0.85, 0.96, 0.94], [1, 0.84, 0.82]], e.kind);
        nozzle({ r: e.r * 0.84 }, e.x, e.y, e.z + e.len / 2);
        if (e.kind !== 'nacelle') body.add(latheRing([[e.r * 0.74, e.z - e.len / 2 - 0.06], [e.r * 0.92, e.z - e.len / 2 - 0.06], [e.r * 0.92, e.z - e.len / 2 + 0.25], [e.r * 0.74, e.z - e.len / 2 + 0.25]], 20, 'nacelle lip', e.x, e.y), shade(pt.top, 0.9));
      }
    }
    // propellers: single engine in the nose, or nacelles on the wing
    for (const e of sp.engines.filter(e => e.kind === 'prop' || e.kind === 'propnac')) {
      let zf;
      if (e.kind === 'prop') zf = z0;
      else {
        nacelle(e, [[0, 0.82], [0.07, 1], [0.45, 1], [0.8, 0.66], [1, 0.25]], 'engine nacelle');
        zf = e.z - e.len / 2;
        if (e.boom) { // P-38: the nacelle runs back as a tail boom
          const bz0 = e.z, bz1 = sp.fins.length ? sp.fins[0].zLE + sp.fins[0].rc : L * 0.45;
          body.add(loftBody([[0, 0.9], [0.5, 0.7], [0.9, 0.55], [1, 0.4]].map(([t, k]) => ({ z: bz0 + t * (bz1 - bz0), w: e.r * k, h: e.r * k * 1.05, y: e.y, x: e.x })), 18, 2, 'boom'), camo);
        }
      }
      const s = e.kind === 'prop' ? sp.at(z0) : { w: e.r * 0.82, h: e.r * 0.82, y: e.y };
      const cr = Math.min(s.w, s.h), cy = e.kind === 'prop' ? s.y : e.y;
      if (e.radial) { // radial engine: cowling ring, dark front with cylinder heads
        body.add(latheRing([[cr * 0.78, zf - 0.06], [cr * 1.04, zf - 0.06], [cr * 1.04, zf + 0.3], [cr * 0.78, zf + 0.3]], 26, 'cowl lip', e.x, cy), pt.acc === 0xcccccc ? pt.top : pt.acc);
        body.add(cyl(cr * 0.8, cr * 0.8, 0.06, 22), 0x1c1c1c, [e.x, cy, zf + 0.05], [Math.PI / 2, 0, 0]);
        const nc = pl.era <= 2 ? 9 : 14; for (let k = 0; k < nc; k++) { const a = k / nc * Math.PI * 2; body.add(box(cr * 0.18, cr * 0.34, 0.12), 0x3c3c3c, [e.x + Math.cos(a) * cr * 0.55, cy + Math.sin(a) * cr * 0.55, zf + 0.02], [0, 0, a + Math.PI / 2]); }
      } else if (e.kind === 'prop' && !ww1) for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) { // inline engine: exhaust stacks seated on the cowling
        const z = z0 + L * 0.07 + k * L * 0.03, y = sp.at(z).y + sp.at(z).h * 0.3, x = sp.sideAt(z, y); body.add(box(0.13, 0.07, 0.15), 0x2c2622, [sd * (x + 0.03), y, z], [0, 0, sd * 0.4]); }
      const sr = cr * (e.radial ? 0.42 : 0.98), sl = Math.max(0.45, sr * 1.6);
      body.add(latheRing([[0.001, zf - sl], [sr * 0.55, zf - sl * 0.6], [sr * 0.9, zf - sl * 0.25], [sr, zf + 0.02], [0.001, zf + 0.02]], 18, 'spinner', e.x, cy), pt.acc);
      const pg = new THREE.Group(), pr = Math.max(1.1, (e.kind === 'prop' ? R * 1.75 : e.r * 1.8)), nb = pl.era >= 3 ? (pl.mass > 3500 ? 4 : 3) : 2, blades = new Builder();
      for (let i = 0; i < nb; i++) {
        const bl = loftSurface([[0, 0.24, 0.16], [0.25, 0.27, 0.1], [0.7, 0.22, 0.07], [0.95, 0.15, 0.05], [1, 0.08, 0.05]].map(([f, c, t]) => ({ x: sr * 0.6 + f * (pr - sr * 0.6), le: -c / 2, c, y: 0, t })), 6, 'blade');
        bl.rotateX(0.35); bl.rotateZ(Math.PI / 2 + i / nb * Math.PI * 2); blades.add(bl, pl.era === 1 ? 0x6b4a2a : 0x1e1e1e);
        if (pl.era >= 3) { const a = Math.PI / 2 + i / nb * Math.PI * 2; blades.add(box(0.13, pr * 0.08, 0.04), 0xd8c020, [Math.cos(a) * pr * 0.95, Math.sin(a) * pr * 0.95, 0], [0, 0, a - Math.PI / 2]); }
      }
      pg.add(new THREE.Mesh(blades.build(), mat('vc'))); pg.add(new THREE.Mesh(new THREE.CircleGeometry(pr, 24), mat('prop')));
      pg.position.set(e.x, cy, zf - sl * 0.35); props.push(pg);
    }

    // ---------------- intakes on the fuselage
    const it = sp.intake;
    // intake duct: full size at the mouth, then narrowing and curving into the fuselage so it blends into the body
    const duct = (x, y, zi, len, w, h, n, rake, name, xe) => {
      if (xe === undefined) xe = x;
      const g = loftBody([0, 0.12, 0.35, 0.65, 1].map(t => ({ z: zi + t * len, w: w * (1 - 0.45 * t * t), h: h * (1 - 0.2 * t * t), y, x: x + (xe - x) * t * t })), 20, n, name);
      if (rake) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = Math.max(0, 1 - (p.getZ(i) - zi) / len); p.setZ(i, p.getZ(i) - rake * (p.getY(i) - y) * f); } g.computeVertexNormals(); }
      body.add(g, (px, py, pz, ny, nz) => nz < -0.6 ? 0x0e0e0e : ny < -0.25 ? pt.bot : pt.top);
    };
    if (it && it.type !== 'nose') {
      const zi = z0 + it.z * L, len = it.len * L, w = it.w * R, h = it.h * R;
      if (it.type === 'rect' || it.type === 'semi') for (const s of [-1, 1]) {
        const y = sp.at(zi).y + (it.y || 0) * R, x = s * (sp.sideAt(zi, y) + w * (it.type === 'semi' ? 0.25 : 0.3)); // against the fuselage side at the mouth
        duct(x, y, zi, len, w, h, it.type === 'rect' ? 4 : 2, it.rake === undefined ? (it.type === 'rect' ? 0.35 : 0) : it.rake, 'intake', s * sp.sideAt(zi + len, y) * 0.6);
        if (it.splitter) body.add(box(0.04, h * 1.6, len * 0.4), camo, [x - s * w * 1.1, y, zi + len * 0.15]);
        if (it.cone) body.add(latheRing([[0.001, zi - h * 0.7], [Math.min(w, h) * 0.6, zi + 0.1], [0.001, zi + 0.1]], 14, 'half cone', x - s * w * 0.3, y), metal);
      }
      else if (it.type === 'chin') { const y = sp.botAt(zi + len * 0.5) + h * 0.35; duct(0, y, zi, len, w, h, it.rect ? 4 : 2.6, 0.15, 'chin intake'); }
      else if (it.type === 'vent') for (const e of sp.engines.filter(e => e.kind === 'nacelle')) duct(e.x, e.y - e.r * 0.15, zi, len + (e.z - e.len / 2 - zi) + 0.3, w, h, 4, it.rake === undefined ? 0.5 : it.rake, 'ventral intake');
      else if (it.type === 'root') for (const s of [-1, 1]) { const w0 = sp.wingAt(0.02); body.add(box(R * 0.7, sp.wing.t * w0.c * 0.9, 0.06), 0x0e0e0e, [s * (sp.wing.x0 + R * 0.45), w0.y, w0.le - 0.03]); }
    }

    // ---------------- canopy / cockpit
    const cp = sp.canopy, cz = cp.z, putPilot = (z, y, x) => {
      pilotB.add(sphere(0.15), ww1 ? 0x4a3420 : sp.jet && pl.era >= 4 ? 0x9a9a8a : 0x3a3328, [x || 0, y, z]);
      pilotB.add(sphere(1, 10, 6), ww1 ? 0x5a4630 : 0x4a4a3a, [x || 0, y - 0.26, z + 0.05], null, [0.23, 0.13, 0.15]); };
    const CAN = { // canopy profiles along their length: [u, width, height]
      bubble: [[0, 0.5, 0.04], [0.1, 0.8, 0.48], [0.25, 0.96, 0.86], [0.5, 1, 1], [0.75, 0.95, 0.9], [0.92, 0.7, 0.55], [1, 0.4, 0.08]],
      framed: [[0, 0.56, 0.04], [0.12, 0.86, 0.58], [0.3, 1, 0.94], [0.7, 1, 0.95], [0.9, 0.96, 0.86], [1, 0.9, 0.7]],
      greenhouse: [[0, 0.56, 0.04], [0.1, 0.86, 0.6], [0.22, 1, 0.94], [0.85, 1, 0.92], [1, 0.9, 0.6]],
    };
    const canopyAt = (prof, u) => { let i = 0; while (i < prof.length - 2 && prof[i + 1][0] < u) i++; const a = prof[i], b = prof[i + 1], k = (u - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; };
    const canopy = (prof, z, len, w, h, x, frames) => {
      const zs = z - len / 2, sink = 0.07, cs = [];
      for (let i = 0; i <= 16; i++) { const u = i / 16, [kw, kh] = canopyAt(prof, u), zz = zs + u * len, base = sp.topAt(zz, x) - sink; cs.push({ z: zz, w: Math.max(0.02, w * kw), h: Math.max(0.03, h * kh + sink), y: base, x }); }
      glassB.add(loftBody(cs, 24, 2.2, 'canopy'), 0xffffff);
      // frames are curves on the glass: same formula, a hair larger
      const arc = u => { const [kw, kh] = canopyAt(prof, u), zz = zs + u * len, base = sp.topAt(zz, x) - sink, pts = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; pts.push(new V(x + Math.cos(a) * w * kw * 1.01, base + Math.sin(a) * (h * kh + sink) * 1.01, zz)); } ckB.add(tube(pts, 0.022), frameC); };
      const rail = (u0, u1) => { const pts = []; for (let i = 0; i <= 10; i++) { const u = u0 + (u1 - u0) * i / 10, [, kh] = canopyAt(prof, u), zz = zs + u * len; pts.push(new V(x, sp.topAt(zz, x) - sink + (h * kh + sink) * 1.01, zz)); } ckB.add(tube(pts, 0.02), frameC); };
      for (const u of frames.arcs) arc(u); if (frames.rail) rail(frames.rail[0], frames.rail[1]);
      return { base: sp.topAt(z, x) };
    };
    if (cp.type === 'open') {
      const top = sp.topAt(cz), ring = new THREE.TorusGeometry(Math.min(0.42, sp.at(cz).w * 0.75), 0.045, 6, 18); ring.rotateX(Math.PI / 2); ckB.add(ring, 0x3a2614, [0, top + 0.01, cz + 0.1], null, [1, 1, 1.25]);
      const wsZ = cz - 0.45, wsW = Math.max(0.24, R * 0.36), wsH = Math.max(0.22, R * 0.34), wt = sp.topAt(wsZ);
      const ws = box(wsW * 2, wsH, 0.02); ws.rotateX(-0.35); glassB.add(ws, 0xffffff, [0, wt + wsH * 0.45, wsZ]);
      ckB.add(tube([new V(-wsW, wt, wsZ), new V(-wsW, wt + wsH * 0.9, wsZ + wsH * 0.32), new V(wsW, wt + wsH * 0.9, wsZ + wsH * 0.32), new V(wsW, wt, wsZ)], 0.014), 0x2a2a2a);
      if (pl.era >= 2) body.add(loftBody([0, 0.3, 0.7, 1].map(t => ({ z: cz + 0.35 + t * L * 0.16, w: R * 0.22 * (1 - t * 0.6), h: R * 0.42 * (1 - t * 0.85) + 0.02, y: sp.topAt(cz + 0.35 + t * L * 0.16) - 0.05 })), 14, 2, 'headrest'), pt.top);
      putPilot(cz + 0.12, top + 0.12);
      if (cp.two) { const z2 = cz + L * 0.13, t2 = sp.topAt(z2), r2 = new THREE.TorusGeometry(Math.min(0.4, sp.at(z2).w * 0.72), 0.045, 6, 18); r2.rotateX(Math.PI / 2); ckB.add(r2, 0x3a2614, [0, t2 + 0.01, z2]); putPilot(z2, t2 + 0.12); }
      if (lk.has('hump')) body.add(loftBody([0, 0.5, 1].map(t => ({ z: cz - L * 0.2 + t * L * 0.14, w: R * 0.5, h: R * 0.28 * Math.sin(Math.PI * (0.15 + t * 0.7)), y: sp.topAt(cz - L * 0.2 + t * L * 0.14) - 0.05 })), 16, 2, 'gun hump'), camo);
    } else if (cp.type === 'glazednose' || cp.type === 'stepped') {
      // bombers: a glazed shell over the nose (fully glazed nose, or the bomb-aimer's nose under a stepped cockpit)
      const gl = cp.type === 'glazednose' ? L * 0.1 : L * 0.045, gs = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10, z = z0 - 0.03 + u * gl, s = sp.at(Math.max(z0, z)); gs.push({ z, w: s.w * 1.03 + 0.01, h: s.h * 1.03 + 0.01, y: s.y }); }
      glassB.add(loftBody(gs, 24, sp.n, 'glazed nose'), 0xffffff);
      for (const u of [0.35, 0.7]) { const z = z0 + u * gl, s = sp.at(z), pts = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2; pts.push(new V(s.w * 1.05 * Math.cos(a), s.y + s.h * 1.05 * Math.sin(a), z)); } ckB.add(tube(pts, 0.025), frameC); }
      if (cp.type === 'stepped') { canopy(CAN.framed, cz, Math.max(1.4, L * 0.08), Math.min(sp.at(cz).w * 0.85, R * 0.75), R * 0.55, 0, { arcs: [0.12, 0.45, 0.8], rail: [0.1, 1] }); for (const sd of [-0.3, 0.3]) putPilot(cz + 0.1, sp.topAt(cz) + 0.12, sd * R); }
      else for (const sd of [-0.3, 0.3]) putPilot(z0 + gl * 0.8, sp.at(z0 + gl).y + 0.1, sd * R);
    } else {
      const kind = cp.type, prof = kind === 'greenhouse' ? CAN.greenhouse : kind === 'bubble' || kind === 'sbs' ? CAN.bubble : CAN.framed;
      const frames = kind === 'bubble' || kind === 'sbs' ? { arcs: cp.frameless ? [] : [0.16], rail: null } : kind === 'greenhouse' ? { arcs: [0.12, 0.3, 0.5, 0.7, 0.88], rail: [0.1, 1] } : { arcs: [0.13, 0.4, 0.72], rail: [0.1, 1] };
      // dark cockpit tub and coaming inside the glass
      ckB.add(cyl(1, 1, 0.02, 18), 0x17191b, [cp.x, sp.topAt(cz, cp.x) - 0.02, cz], null, [cp.w * 0.85, 1, cp.len * 0.42]);
      ckB.add(box(cp.w * 1.6, 0.1, 0.22), 0x1d1f21, [cp.x, sp.topAt(cz - cp.len * 0.3, cp.x) + 0.03, cz - cp.len * 0.3]);
      canopy(prof, cz, cp.len, cp.w, cp.h, cp.x, frames);
      if (kind === 'razor') { // razorback: the spine fairs the canopy back into the tail
        const zA = cz + cp.len / 2 - 0.05, zB = Math.min(sp.fins[0] ? sp.fins[0].zLE : L * 0.4, zA + L * 0.32), rs = [];
        for (let i = 0; i <= 8; i++) { const u = i / 8, z = zA + u * (zB - zA), top = sp.topAt(z); rs.push({ z, w: cp.w * 0.9 * (1 - u * 0.75), h: Math.max(0.03, (cp.h * 0.72 + 0.07) * (1 - u) + 0.04), y: top - 0.07 }); }
        body.add(loftBody(rs, 16, 2.2, 'razorback'), camo);
      }
      const seats = cp.two ? (kind === 'sbs' ? [[cz - 0.1, -cp.w * 0.42], [cz - 0.1, cp.w * 0.42]] : [[cz - cp.len * 0.22, 0], [cz + cp.len * 0.22, 0]]) : [[cz + cp.len * 0.05, 0]];
      for (const [z, x] of seats) putPilot(z, sp.topAt(z, cp.x + x) + Math.min(0.42, cp.h * 0.42), cp.x + x);
      if (!sp.jet || pl.era <= 4) ckB.add(box(0.05, 0.12, 0.02), 0x2a2a2a, [cp.x, sp.topAt(cz - cp.len * 0.3, cp.x) + 0.14, cz - cp.len * 0.28]); // reflector gunsight
      if (!sp.jet && pl.era >= 3 && kind !== 'bubble') { const mz = cz + cp.len * 0.75, mt = sp.topAt(mz); const m = loftSurface([{ x: 0, le: -0.08, c: 0.18, y: 0, t: 0.12 }, { x: R * 0.55, le: 0.02, c: 0.07, y: 0, t: 0.12 }], 4, 'mast'); m.rotateZ(Math.PI / 2); body.add(m, shade(pt.top, 0.7), [0, mt - 0.03, mz]); } // radio mast
    }

    // ---------------- wings
    const wingPaint = (g) => (x, y, z, ny) => { const f = Math.max(0, Math.min(1, (Math.abs(x) - g.x0) / (g.b - g.x0))), w = sp.wingAt(f, g), fr = (z - w.le) / w.c;
      const base = ny < -0.25 ? pt.bot : pt.top;
      if (fr > 0.74 && ((f > 0.55 && f < 0.93) || (!ww1 && sp.wing.tc > sp.wing.rc * 0.15 && f > 0.08 && f < 0.52))) return shade(base, 0.86); // ailerons and flaps
      return base; };
    sp.wings.forEach((g, i) => {
      const st = surfStations(g, f => sp.wingAt(f, g), { square: sp.wing.tiptanks && i === 0 });
      const geo = loftSurface(st, 14, 'wing' + i), pf = wingPaint(g);
      wr.add(geo, pf); wl.add(mirrorX(geo), pf);
      if (g.tiptanks && i === 0) { const tip = sp.wingAt(1, g), tl = Math.max(2.4, tip.c * 2.4), tr = Math.max(0.3, tl * 0.12);
        const tank = [0, 0.1, 0.3, 0.7, 0.9, 1].map((t, k) => ({ z: tip.le + tip.c * 0.4 - tl * 0.5 + t * tl, w: tr * [0.05, 0.7, 1, 1, 0.7, 0.05][k], h: tr * [0.05, 0.7, 1, 1, 0.7, 0.05][k], y: tip.y, x: tip.x + tr * 0.2 }));
        const tg = loftBody(tank, 16, 2, 'tip tank'); wr.add(tg, camo); wl.add(mirrorX(tg), camo); }
      if (g.fences && i === 0) for (let k = 0; k < g.fences; k++) { const w = sp.wingAt(0.3 + k * 0.22, g); for (const [b, s] of [[wr, 1], [wl, -1]]) b.add(box(0.03, g.t * w.c + 0.12, w.c * 0.9), shade(pt.top, 0.92), [s * w.x, w.y + 0.05, w.le + w.c * 0.47]); }
      if (g.tiprail && i === 0) { const tip = sp.wingAt(1, g); for (const [b, s] of [[wr, 1], [wl, -1]]) b.add(cyl(0.08, 0.08, tip.c * 1.6, 8), metal, [s * (tip.x + 0.05), tip.y, tip.le + tip.c * 0.4], [Math.PI / 2, 0, 0]); }
    });
    if (sp.extra.lerx) { const w0 = sp.wingAt(0), zA = w0.le - L * 0.24, s = sp.at(zA + L * 0.1);
      const lx = loftSurface([{ x: s.w * 0.6, le: zA, c: w0.le - zA + w0.c * 0.3, y: w0.y, t: 0.025 }, { x: sp.wing.x0 + R * 0.75, le: w0.le - 0.15, c: w0.c * 0.35, y: w0.y, t: 0.025 }], 8, 'lerx');
      body.add(lx, camo); body.add(mirrorX(lx), camo); }
    if (sp.extra.canards) { const cd = sp.extra.canards, zc = z0 + cd.z * L, s = sp.at(zc), y = s.y + (cd.y || 0) * R, c = cd.c * L, x0 = sp.sideAt(zc, y) * 0.8;
      const cg = loftSurface([{ x: x0, le: zc, c, y, t: 0.04 }, { x: x0 + cd.hs * L, le: zc + c * 0.7, c: c * 0.3, y, t: 0.04 }], 8, 'canard'); body.add(cg, camo); body.add(mirrorX(cg), camo); }
    if (sp.extra.gearPods) { const [gx, gl] = sp.extra.gearPods; for (const s of [-1, 1]) { const w = sp.wingAt(sp.wingF(gx * S)), len = gl * L, r = Math.max(0.35, R * 0.45);
      body.add(loftBody([0, 0.15, 0.5, 0.85, 1].map((t, k) => ({ z: w.le - len * 0.35 + t * len, w: r * [0.2, 0.8, 1, 0.8, 0.2][k] * 0.8, h: r * [0.2, 0.8, 1, 0.8, 0.2][k], y: w.y - r * 0.55, x: s * gx * S })), 16, 2, 'gear pod'), camo); } }
    if (sp.extra.cft) for (const s of [-1, 1]) { const zA = sp.wing.rootZ - L * 0.05; body.add(loftBody([0, 0.1, 0.9, 1].map((t, k) => ({ z: zA + t * L * 0.3, w: R * [0.2, 0.45, 0.45, 0.2][k], h: R * [0.2, 0.42, 0.42, 0.2][k], y: sp.wing.y - R * 0.15, x: s * (sp.sideAt(zA + L * 0.15, sp.wing.y) + R * 0.2) })), 14, 2.6, 'cft'), camo); }
    if (sp.extra.belly) { const zA = sp.wing.rootZ; body.add(loftBody([0, 0.15, 0.85, 1].map((t, k) => ({ z: zA + t * L * 0.3, w: R * [0.2, 0.55, 0.55, 0.2][k], h: R * [0.2, 0.5, 0.5, 0.2][k], y: sp.botAt(zA + L * 0.15) - R * 0.3 })), 16, 2, 'ventral tank'), camo); }
    // wing guns: barrels out of the real leading edge
    const wingGunAt = x => { const f = sp.wingF(x), w = sp.wingAt(f); return w; };
    // biplanes: struts, bracing wires, cabane, fixed undercarriage
    if (sp.bi) {
      const lo = sp.wings[0], up = sp.wings[sp.wings.length - 1], sx = (lo.b) * (lk.has('sesqui') ? 0.62 : 0.66), fl = sp.wingF(sx);
      const pl0 = sp.wingAt(Math.min(1, (sx - lo.x0) / (lo.b - lo.x0)), lo), pu = sp.wingAt(Math.min(1, (sx - up.x0) / (up.b - up.x0)), up);
      for (const [b, d] of [[wl, -1], [wr, 1]]) {
        if (lk.has('sesqui')) for (const k of [0.2, 0.7]) b.add(tube([new V(d * sx * 0.98, pl0.y + 0.03, pl0.le + pl0.c * 0.4), new V(d * sx, pu.y - 0.03, pu.le + pu.c * k)], 0.035), 0x5a4a3a);
        else for (const k of [0.22, 0.72]) b.add(tube([new V(d * sx, pl0.y + 0.03, pl0.le + pl0.c * k), new V(d * sx, pu.y - 0.03, pu.le + pu.c * k)], 0.035), 0x5a4a3a);
        if (pl.id !== 'fd7') { b.add(tube([new V(d * R * 0.6, pl0.y + 0.03, pl0.le + pl0.c * 0.3), new V(d * sx, pu.y - 0.05, pu.le + pu.c * 0.3)], 0.01), 0x8a8a8a); b.add(tube([new V(d * R * 0.6, pu.y - 0.05, pu.le + pu.c * 0.6), new V(d * sx, pl0.y + 0.05, pl0.le + pl0.c * 0.6)], 0.01), 0x8a8a8a); }
      }
      for (const k of [0.2, 0.7]) { const zc = up.rootZ + up.rc * k, ft = sp.topAt(zc); for (const s of [-1, 1]) body.add(tube([new V(s * sp.at(zc).w * 0.6, ft - 0.05, zc + 0.15), new V(s * R * 0.35, up.y - 0.03, zc)], 0.03), 0x5a4a3a); }
      for (const s of [-1, 1]) { const gz = lo.rootZ + lo.rc * 0.05, gy = -R * 2.0; body.add(tube([new V(s * R * 0.7, sp.botAt(gz) + 0.05, gz - 0.3), new V(s * R * 1.0, gy, gz)], 0.03), 0x4a4a4a); body.add(tube([new V(s * R * 0.7, sp.botAt(gz + 0.6) + 0.05, gz + 0.5), new V(s * R * 1.0, gy, gz)], 0.03), 0x4a4a4a);
        const wh = latheRing([[0.12, -0.06], [0.32, -0.06], [0.32, 0.06], [0.12, 0.06]], 16, 'wheel'); wh.rotateY(Math.PI / 2); body.add(wh, dark, [s * R * 1.05, gy, gz]); }
      body.add(cyl(0.025, 0.025, R * 2.1, 6), 0x4a4a4a, [0, -R * 2.0, lo.rootZ + lo.rc * 0.05], [0, 0, Math.PI / 2]);
      body.add(box(0.06, 0.4, 0.5), 0x4a3a28, [0, sp.botAt(L * 0.44) - 0.1, L * 0.44], [0.6, 0, 0]); // tail skid
    } else if (pl.fixedGear) for (const s of [-1, 1]) {
      const gx = s * S * 0.15, w = wingGunAt(gx), gy = w.y - R * 1.2, gz = w.le + w.c * 0.3;
      body.add(loftSurface([{ x: 0, le: -0.2, c: lk.has('spats') ? 0.42 : 0.25, y: 0, t: 0.3 }, { x: w.y - gy, le: -0.2, c: lk.has('spats') ? 0.42 : 0.25, y: 0, t: 0.3 }], 6, 'gear leg').rotateZ(-Math.PI / 2), camo, [gx, w.y + 0.05, gz]);
      if (lk.has('spats')) body.add(loftBody([0, 0.15, 0.45, 0.8, 1].map((t, k) => ({ z: gz - 0.55 + t * 1.15, w: 0.17 * [0.2, 0.8, 1, 0.75, 0.15][k], h: 0.36 * [0.25, 0.85, 1, 0.8, 0.2][k], y: gy })), 14, 2, 'spat'), camo);
      else { const wh = latheRing([[0.1, -0.07], [0.3, -0.07], [0.3, 0.07], [0.1, 0.07]], 16, 'wheel'); wh.rotateY(Math.PI / 2); body.add(wh, dark, [gx, gy, gz]); }
    }
    if (lk.has('wire')) for (const s of [-1, 1]) { const w = wingGunAt(s * S * 0.3); for (const yy of [sp.topAt(cz - 0.5) - 0.02, sp.botAt(cz - 0.5) + 0.05]) (s < 0 ? wl : wr).add(tube([new V(s * sp.at(cz - 0.5).w * 0.7, yy, cz - 0.5), new V(s * w.x, w.y, w.le + w.c * 0.4)], 0.012), 0x9a9a9a); }

    // ---------------- tail surfaces
    const st = sp.stab;
    if (st) {
      const at = f => { const x = st.x0 + (st.b - st.x0) * f; return { x, le: st.zLE + st.sw * (x - st.x0), c: st.rc * (1 - f) + st.tc * f, y: st.y + Math.tan(st.dih) * (x - st.x0) }; };
      const geo = loftSurface(surfStations({ t: st.t }, at), 10, 'stabiliser');
      body.add(geo, (x, y, z, ny) => { const f = (Math.abs(x) - st.x0) / (st.b - st.x0), a = at(Math.max(0, Math.min(1, f))), fr = (z - a.le) / a.c, base = ny < -0.25 ? pt.bot : pt.top; return fr > 0.7 && (!sp.jet || pl.era <= 4) ? shade(base, 0.86) : base; });
      body.add(mirrorX(geo), (x, y, z, ny) => { const f = (Math.abs(x) - st.x0) / (st.b - st.x0), a = at(Math.max(0, Math.min(1, f))), fr = (z - a.le) / a.c, base = ny < -0.25 ? pt.bot : pt.top; return fr > 0.7 && (!sp.jet || pl.era <= 4) ? shade(base, 0.86) : base; });
    }
    const flash = pl.nation === 'fra' ? [0x0055a4, 0xffffff, 0xef4135] : pl.nation === 'uk' ? (pl.era <= 2 ? [0x1c2f6e, 0xffffff, 0xc8102e] : pl.era === 3 ? [0xc8102e, 0xffffff, 0x1c2f6e] : [0xc8102e, 0x1c2f6e]) : null;
    sp.fins.forEach((fn, i) => {
      // built along +X (height) with the chord along Z, then stood up (and canted) about the Z axis
      const h = fn.h, at = f => ({ x: f * h, le: fn.zLE + fn.sw * f * h, c: fn.rc * (1 - f) + fn.tc * f, y: 0 });
      const g = loftSurface(surfStations({ t: fn.t }, at, { square: false }), 10, 'fin');
      g.rotateZ(Math.PI / 2 + fn.cant);
      body.add(g, (x, y, z) => { const f = Math.max(0, Math.min(1, (y - fn.base) / h)), a = at(f); return (z - a.le) / a.c > 0.72 && !sp.jet ? shade(pt.top, 0.86) : pt.top; }, [fn.x, fn.base, 0]);
      if (flash && sp.fins.length === 1) { const f = 0.45, a = at(f), half = naca(0.5, fn.t) * a.c + 0.012, w = a.c * 0.12;
        flash.forEach((c, k) => { for (const sd of [-1, 1]) mkB.add(box(0.01, h * 0.42, w), c, [sd * half, fn.base + h * f, a.le + a.c * 0.35 + (k - (flash.length - 1) / 2) * w]); }); }
    });
    if (sp.dorsal && sp.fins.length === 1) { const fn = sp.fins[0], dl = L * 0.18, zA = fn.zLE - dl * 0.85;
      const g = loftSurface([{ x: 0, le: zA, c: dl + fn.rc * 0.2, y: 0, t: 0.06 }, { x: fn.h * 0.25, le: fn.zLE + fn.sw * fn.h * 0.2, c: fn.rc * 0.15, y: 0, t: 0.06 }], 6, 'dorsal'); g.rotateZ(Math.PI / 2); body.add(g, pt.top, [0, sp.topAt(fn.zLE) - 0.12, 0]); }
    if (sp.ventral) { const v = sp.ventral, g = loftSurface([{ x: 0, le: v.zLE, c: v.rc, y: 0, t: 0.06 }, { x: v.h, le: v.zLE + v.rc * 0.45, c: v.rc * 0.45, y: 0, t: 0.06 }], 6, 'ventral fin'); g.rotateZ(-Math.PI / 2); body.add(g, pt.bot, [0, sp.botAt(v.zLE + v.rc / 2) + 0.1, 0]); }

    // ---------------- guns
    for (const [gid, n, mount] of pl.guns) {
      const cal = GUNS[gid].cal / 1000, len = 0.35 + cal * 22;
      for (let i = 0; i < n; i++) {
        if (mount === 'wing') { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2), x = s * (sp.wing.x0 + S * (0.09 + k * 0.03)), w = wingGunAt(x);
          (s < 0 ? wl : wr).add(zcyl(cal * 2, cal * 2.6, len, 6), dark, [x, w.y, w.le - len / 2 + 0.1]); }
        else if (mount === 'nose' && !sp.jet) body.add(zcyl(cal * 2, cal * 2, len, 6), dark, [(i - (n - 1) / 2) * 0.15, sp.at(z0).y + (pl.eng >= 2 ? R * 0.1 : 0), z0 - len / 2 + 0.25]);
        else if (mount === 'nose' && sp.jet && !sp.extra.gau8) { const z = z0 + L * 0.2 + (i >> 1) * 0.25, s = i % 2 ? 1 : -1, y = sp.at(z).y - sp.at(z).h * 0.35, x = sp.sideAt(z, y); body.add(zcyl(cal * 1.8, cal * 2.6, 0.4, 6), dark, [s * x, y, z]); }
        else if (mount === 'sync') { const z = z0 + L * 0.2, x = (i - (n - 1) / 2) * 0.22; body.add(zcyl(cal * 2.2, cal * 2.2, len + 0.3, 6), dark, [x, sp.topAt(z, x) + cal * 2, z]); }
      }
    }
    // ---------------- defensive turrets
    for (const t of pl.turrets) { const tp = turretPos(pl, t[2]), r = Math.max(0.35, R * 0.35);
      glassB.add(sphere(1, 12, 8), 0xffffff, [tp.x, tp.y, tp.z], null, [r, r, r]);
      for (let k = 0; k < t[1]; k++) body.add(zcyl(0.02, 0.025, 0.9, 5), dark, [tp.x + (k - (t[1] - 1) / 2) * 0.12, tp.y, tp.z + (t[2] === 'nose' ? -1 : 1) * (r + 0.4)]); }

    // ---------------- markings: placed on the analytic surfaces
    const top = sp.wings[sp.wings.length - 1];
    { const f = Math.min(0.75, Math.max(0.3, (S * 0.32 - top.x0) / (top.b - top.x0))), w = sp.wingAt(f, top), size = Math.min(S * 0.12, 1.8, w.c * 0.8);
      const slope = top.kink ? (f < top.kink[0] ? top.kink[1] : top.kink[2]) : top.dih;
      for (const s of [-1, 1]) { const b = new Builder(); insignia(b, pl.nation, size, [0, 0.012, 0], 'y', pl.era); const g = b.build(); g.rotateZ(s * slope);
        g.translate(s * w.x, w.y + naca(0.42, top.t) * w.c, w.le + w.c * 0.42); (s < 0 ? mkL : mkR).parts.push({ g, color: 0xffffff, preColored: true }); } }
    { const z = z0 + L * (sp.jet ? 0.66 : 0.68), s = sp.at(z), y = s.y;
      for (const sd of [-1, 1]) { const x = sp.sideAt(z, y), size = Math.min(s.h * 1.25, R * 1.3, 1.5); if (size > 0.2) insignia(mkB, pl.nation, size, [sd * (x + 0.02), y, z], 'x', pl.era); } }

    // ---------------- assemble
    const grp = { props, glows };
    grp.body = new THREE.Mesh(body.build(), mat('vc'));
    grp.glass = new THREE.Mesh(glassB.build(), mat('glass'));
    if (pilotB.parts.length) { const pm = new THREE.Mesh(pilotB.build(), mat('vc')); pm.name = 'pilot'; grp.glass.add(pm); }
    if (ckB.parts.length) grp.glass.add(new THREE.Mesh(ckB.build(), mat('vc')));
    grp.wingL = new THREE.Mesh(wl.build(), mat('vc')); grp.wingR = new THREE.Mesh(wr.build(), mat('vc'));
    const mergePre = (b) => { // markings: some parts arrive already coloured (rotated insignia)
      const pre = b.parts.filter(p => p.preColored), plain = new Builder(); plain.parts = b.parts.filter(p => !p.preColored);
      const geos = []; if (plain.parts.length) geos.push(plain.build()); for (const p of pre) geos.push(p.g);
      return geos.length ? new THREE.Mesh(merge(geos), mat('vc2')) : null; };
    const mL = mergePre(mkL), mR = mergePre(mkR); if (mL) grp.wingL.add(mL); if (mR) grp.wingR.add(mR);
    grp.marks = mergePre(mkB);
    if (!ww1 && pl.era >= 2) { // navigation lights: red left tip, green right tip, white tail
      for (const [b, d, col] of [[mkL, -1, 0xff2a2a], [mkR, 1, 0x30ff60]]) { const tip = sp.wingAt(1, top), lb = new Builder(); lb.add(sphere(0.06, 8, 6), col, [d * (tip.x + 0.02), tip.y, tip.le + tip.c * 0.4]); (d < 0 ? grp.wingL : grp.wingR).add(new THREE.Mesh(lb.build(), mat('lamp'))); }
      lampB.add(sphere(0.05, 8, 6), 0xffffff, [0, sp.at(zTail).y + (sp.jet ? sp.at(zTail).h + 0.05 : 0), zTail + 0.02]); grp.lamps = new THREE.Mesh(lampB.build(), mat('lamp'));
    }
    // ---------------- retractable landing gear (hidden unless lowered)
    const lay = Models.layout(pl);
    grp.gear = null;
    if (!lay.fixed) {
      const gb = new Builder(), wr2 = lay.wheelR, gl = lay.gearLen, gz = lay.wingZ - lay.chord * 0.15;
      const wheel = r => { const g = latheRing([[r * 0.35, -r * 0.25], [r, -r * 0.25], [r, r * 0.25], [r * 0.35, r * 0.25]], 16, 'wheel'); g.rotateY(Math.PI / 2); return g; };
      for (const sd of [-1, 1]) { gb.add(cyl(0.07, 0.07, gl, 6), 0x555555, [sd * lay.gearX, lay.wingY - gl / 2, gz]); gb.add(wheel(wr2), dark, [sd * lay.gearX, lay.wingY - gl, gz]); gb.add(box(0.03, gl * 0.8, wr2 * 1.6), pt.bot, [sd * (lay.gearX + 0.18), lay.wingY - gl * 0.45, gz]); }
      if (sp.jet) { const nz = z0 + L * 0.18, ny = sp.botAt(nz); gb.add(cyl(0.05, 0.05, ny + lay.gearH - wr2 * 0.8, 6), 0x555555, [0, (ny - lay.gearH + wr2 * 0.8) / 2, nz]); gb.add(wheel(wr2 * 0.8), dark, [0, -lay.gearH + wr2 * 0.8, nz]); }
      else { const th = Math.max(0.3, lay.gearH * 0.45), tz = L * 0.4, ty = sp.botAt(tz); gb.add(box(0.08, th, 0.08), 0x555555, [0, ty - th / 2, tz]); gb.add(wheel(0.18), dark, [0, ty - th, tz]); }
      grp.gear = new THREE.Mesh(gb.build(), mat('vc')); grp.gear.visible = false;
    }
    return grp;
  }
  // merge non-indexed, vertex-coloured geometries
  function merge(geos) {
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeBoundingSphere(); return g;
  }
  Models.primitives = { loftBody, latheRing, loftSurface, mirrorX, orient };
})();
