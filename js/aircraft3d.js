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
//   loftPrism    - polygon sections lofted along Z with every face kept flat and every
//                  edge creased (chined stealth fuselages, caret intakes)
//   loftUnion    - stations made of several superellipse primitives (core / pod, intake trunks,
//                  engine tunnels, bridging deck, engine housings), lofted as ONE skin through a
//                  smooth union, so parts weld together with fillets instead of being clamped on
//   lipRing      - a raked lip around an intake mouth
// Every aircraft goes through the same 4-stage manufacturing pipeline:
//   1. core fuselage by architecture (registry: fuselageArchitecture)
//        SINGLE_TUBE        one central fuselage (intake trunks and engine housings blended in)
//        TWIN_NACELLE_DECK  cockpit pod + two engine tunnels from the intake mouths to the nozzles,
//                           welded by a solid bridging deck; fins on the tunnel tops; LEX shelves
//        CHINED_STEALTH     faceted prism with a continuous chine through the caret intakes into
//                           the wing roots; solid between the engines (keel bridge under nacelles)
//   2. blunt exhaust plane: jet fuselages stop at the nozzles (a boom runs on above them when the
//      nozzles are short of the tail) and every engine ends in an open tailpipe ring
//   3. curvature: spline-lofted stations, blended trunks, NACA teardrop wing sections, cranked
//      outer panels bent to their outerWingDihedral
//   4. skin: per-vertex paint tags read by the skin shader (models.js) for panel lines, rivets,
//      panel-to-panel tone and period camouflage
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
  // secs: [{z, w, h, y, x, n}] in increasing z (n: optional per-section squareness); side quads wind (θ, θ+dθ, next station) = outward for this ordering
  function loftBody(secs, segs, n, name) {
    const pos = [], idx = [];
    for (const s of secs) for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2, ns = s.n || n; pos.push((s.x || 0) + s.w * sep(Math.cos(a), ns), s.y + s.h * sep(Math.sin(a), ns), s.z); }
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
  // (n: optional superellipse squareness of the turned section, e.g. 4 for the rectangular 2D nozzles)
  function latheRing(prof, segs, name, cx, cy, sx, sy, n) {
    const pos = [], idx = [];
    for (let i = 0; i < prof.length; i++) {
      const p0 = prof[i], p1 = prof[(i + 1) % prof.length], base = pos.length / 3;
      for (const [r, z] of [p0, p1]) for (let j = 0; j < segs; j++) { const a = (j + 0.5) / segs * Math.PI * 2; pos.push((cx || 0) + r * sep(Math.cos(a), n || 2) * (sx || 1), (cy || 0) + r * sep(Math.sin(a), n || 2) * (sy || 1), z); }
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
  // polygon sections ([[x, y], ...] corners in the same rotational order at every station) lofted along Z; each face strip
  // has its own vertices so the edges stay sharp, and the ends are closed with flat caps
  function loftPrism(secs, name) {
    const pos = [], idx = [], K = secs[0].c.length;
    for (let k = 0; k < K; k++) {
      const base = pos.length / 3;
      for (const sc of secs) { const a = sc.c[k], b = sc.c[(k + 1) % K]; pos.push(a[0], a[1], sc.z + (a[2] || 0), b[0], b[1], sc.z + (b[2] || 0)); } // optional 3rd value: z offset of that corner
      for (let i = 0; i < secs.length - 1; i++) { const a = base + i * 2, b = a + 1, c = a + 3, d = a + 2; idx.push(a, b, c, a, c, d); }
    }
    for (const [k, back] of [[0, false], [secs.length - 1, true]]) {
      const sc = secs[k], base = pos.length / 3; let cx = 0, cy = 0; for (const [x, y] of sc.c) { cx += x / K; cy += y / K; }
      pos.push(cx, cy, sc.z); for (const [x, y] of sc.c) pos.push(x, y, sc.z);
      for (let j = 0; j < K; j++) { const p0 = base + 1 + j, q = base + 1 + (j + 1) % K; if (back) idx.push(base, p0, q); else idx.push(base, q, p0); }
    }
    const g = indexed(pos, idx); orient(g, name); g.deleteAttribute('normal'); const ng = g.toNonIndexed(); ng.computeVertexNormals(); // flat facets
    if (Airframe.check) Airframe.check[Airframe.check.length - 1].g = g; return ng;
  }
  // far crossing of the ray O + t·d with the superellipse q {x, y, w, h, n}, or -1 if the ray misses it. The
  // superellipse "norm" is convex along a line, so: golden-section search for its minimum, then bisect outwards to 1
  function farHit(ox, oy, dx, dy, q) {
    const g = t => Math.pow(Math.abs((ox + t * dx - q.x) / q.w), q.n) + Math.pow(Math.abs((oy + t * dy - q.y) / q.h), q.n);
    const T = Math.hypot(q.x - ox, q.y - oy) + Math.max(q.w, q.h) * 1.05, phi = 0.618034;
    let a = 0, b = T, c = b - phi * (b - a), d = a + phi * (b - a);
    for (let i = 0; i < 28; i++) { if (g(c) < g(d)) b = d; else a = c; c = b - phi * (b - a); d = a + phi * (b - a); }
    let lo = (a + b) / 2; if (g(lo) > 1) return -1;
    let hi = T; for (let i = 0; i < 32; i++) { const m = (lo + hi) / 2; if (g(m) <= 1) lo = m; else hi = m; }
    return lo;
  }
  // smooth union of the station's primitives seen from its origin (0, oy): r = (Σ r_i^P)^(1/P) along each ray. Where
  // one primitive dominates this is exactly its outline; where two meet it rounds the join into a fillet
  const UNION_P = 10;
  function unionRing(s, segs) {
    const pts = [];
    for (let j = 0; j < segs; j++) { const a = (j + 0.5) / segs * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a); let sum = 0;
      for (const q of s.prims) { const t = farHit(0, s.oy, dx, dy, q); if (t > 0) sum += Math.pow(t, UNION_P); }
      const r = Math.max(0.01, Math.pow(sum, 1 / UNION_P)); pts.push([dx * r, s.oy + dy * r]); }
    return pts;
  }
  // stations {z, oy, prims, crease} lofted along Z; a crease station gets two copies of its ring so the skin on either
  // side keeps its own normals (intake mouths, the blunt exhaust plane). Ends closed by fans from the origin.
  function loftUnion(st, segs, name) {
    const pos = [], idx = [], rings = [];
    for (const s of st) { const pts = s.pts || unionRing(s, segs), first = pos.length / 3;
      for (const [x, y] of pts) pos.push(x, y, s.z);
      if (s.crease) for (const [x, y] of pts) pos.push(x, y, s.z);
      rings.push([first, s.crease ? first + segs : first]); }
    for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < segs; j++) {
      const a = rings[i][1] + j, b = rings[i][1] + (j + 1) % segs, c = rings[i + 1][0] + (j + 1) % segs, d = rings[i + 1][0] + j;
      idx.push(a, b, c, a, c, d); }
    for (const [k, back] of [[0, false], [st.length - 1, true]]) { const s = st[k], src = back ? rings[k][1] : rings[k][0], base = pos.length / 3;
      pos.push(0, s.oy, s.z); for (let j = 0; j < segs; j++) pos.push(pos[(src + j) * 3], pos[(src + j) * 3 + 1], pos[(src + j) * 3 + 2]);
      for (let j = 0; j < segs; j++) { const p = base + 1 + j, q = base + 1 + (j + 1) % segs; if (back) idx.push(base, p, q); else idx.push(base, q, p); } }
    return orient(indexed(pos, idx), name);
  }
  // a closed lip ring around a superellipse mouth (centre cx, cy, half-sizes w, h, squareness n): outer 1.03, inner 0.88
  // of the outline, from zf (front) to zb; rake leans the top of the ring forward (deg)
  function lipRing(cx, cy, w, h, n, zf, zb, rake, name) {
    const prof = [[0.88, zf, 1], [1.03, zf - 0.02, 1], [1.03, zb, 0], [0.88, zb, 0]], segs = 32, pos = [], idx = [], t = Math.tan((rake || 0) * Math.PI / 180);
    for (let i = 0; i < prof.length; i++) { const base = pos.length / 3;
      for (const [r, z, front] of [prof[i], prof[(i + 1) % prof.length]]) for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2, y = cy + h * r * sep(Math.sin(a), n);
        pos.push(cx + w * r * sep(Math.cos(a), n), y, z - front * t * (y - cy + h)); } // only the front edge is raked; the back stays on the mouth face
      for (let j = 0; j < segs; j++) { const a = base + j, b = base + (j + 1) % segs, c = base + segs + (j + 1) % segs, d = base + segs + j; idx.push(a, b, c, a, c, d); } }
    return orient(indexed(pos, idx), name);
  }
  // closed (scale, z) profile loop swept round a rounded-rectangle outline of half-size (hw, hh) centred on (cx, cy); M points
  // evenly spaced by arc length; zfn(x, y, z) may move a vertex along Z (sawtooth edges) - a pure function of position, so
  // the shared edges between the rings stay welded
  function slotRing(prof, M, name, cx, cy, hw, hh, cr, zfn) {
    const a = hw - cr, b = hh - cr, per = 4 * a + 4 * b + 2 * Math.PI * cr, out = [];
    for (let j = 0; j < M; j++) { let d = (j + 0.5) / M * per, x, y; // walk: top edge (right to left), left arc, bottom, right arc ...
      const segs = [[2 * a, t => [a - t, hh]], [Math.PI * cr / 2, t => { const q = Math.PI / 2 + t / cr; return [-a + cr * Math.cos(q), b + cr * Math.sin(q)]; }],
        [2 * b, t => [-hw, b - t]], [Math.PI * cr / 2, t => { const q = Math.PI + t / cr; return [-a + cr * Math.cos(q), -b + cr * Math.sin(q)]; }],
        [2 * a, t => [-a + t, -hh]], [Math.PI * cr / 2, t => { const q = 1.5 * Math.PI + t / cr; return [a + cr * Math.cos(q), -b + cr * Math.sin(q)]; }],
        [2 * b, t => [hw, -b + t]], [Math.PI * cr / 2, t => { const q = t / cr; return [a + cr * Math.cos(q), b + cr * Math.sin(q)]; }]];
      d = (d + a) % per; // start at the top-right corner of the flat top edge
      for (const [len, f] of segs) { if (d <= len) { [x, y] = f(d); break; } d -= len; }
      out.push([x / hw, y / hh]); }
    const pos = [], idx = [];
    for (let i = 0; i < prof.length; i++) { const base = pos.length / 3;
      for (const [k, z] of [prof[i], prof[(i + 1) % prof.length]]) for (const [ux, uy] of out) { const px = cx + ux * hw * k, py = cy + uy * hh * k; pos.push(px, py, zfn ? zfn(px, py, z) : z); }
      for (let j = 0; j < M; j++) { const p0 = base + j, p1 = base + (j + 1) % M, p2 = base + M + (j + 1) % M, p3 = base + M + j; idx.push(p0, p1, p2, p0, p2, p3); } }
    return orient(indexed(pos, idx), name);
  }
  // a faceted lifting surface (stealth tailplanes): double-wedge section - sharp leading edge, a ridge at 45% chord, sharp
  // trailing edge - with every face flat. Built with loftPrism along the span (as its Z), then turned so the span runs along X
  function facetSurface(st, name) {
    const secs = st.map(q => { const th = q.t * q.c / 2; return { z: q.x, c: [[q.le, -q.y], [q.le + q.c * 0.45, -(q.y + th)], [q.le + q.c, -q.y], [q.le + q.c * 0.45, -(q.y - th)]] }; });
    const g = loftPrism(secs, name), m = new THREE.Matrix4().set(0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1); // (chord, -y, span) -> (span, y, chord): a proper rotation
    g.applyMatrix4(m); g.computeVertexNormals(); return g;
  }
  // mirror of a non-indexed geometry: negate X and swap two corners of every triangle
  function mirrorFlat(g) { const h = g.clone(), p = h.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
    for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
    h.computeVertexNormals(); return h; }
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
      const w = at(f), c = w.c * kc; st.push({ x: w.x, le: w.le + (w.c - c) * 0.45, c, y: w.y - (g.droop ? (f - 0.95) * 4 * w.c * 0.4 : 0), t: Math.max(g.t * kt, 0.02 / c) }); // at least ~1 cm thick at the tip
    }
    return st;
  }

  // ======================= the aircraft =======================
  const cache = {};
  // livery: an optional paint scheme id (liveries.js) the type really wore; each aircraft + scheme is built once
  Models.aircraft = function (pl, livery) {
    const lv = livery && LIVERY[livery] && LIVERY[livery].planes.includes(pl.id) ? livery : null, key = pl.id + (lv ? '|' + lv : '');
    if (lv && !cache[key]) cache[key] = build(Object.assign(Object.create(pl), { livery: lv }));
    else if (!cache[key]) cache[key] = build(pl);
    pl = lv ? Object.assign(Object.create(pl), { livery: lv }) : pl;
    // every craft gets its own meshes (wings are hidden when shot off) over shared geometry
    const c = cache[key], g = new THREE.Group();
    const mk = (src, parent) => { const m = new THREE.Mesh(src.geometry, src.material); m.userData = src.userData; m.position.copy(src.position); m.rotation.copy(src.rotation); m.scale.copy(src.scale); m.visible = src.visible; m.name = src.name; for (const ch of src.children) m.add(mk(ch)); if (parent) parent.add(m); return m; };
    const body = mk(c.body, g), glass = mk(c.glass, g), wingL = mk(c.wingL, g), wingR = mk(c.wingR, g);
    const pilot = glass.children.find(o => o.name === 'pilot') || null;
    const marks = c.marks ? mk(c.marks, g) : null, lamps = c.lamps ? mk(c.lamps, g) : null;
    const props = c.props.map(p => { const q = new THREE.Group(); q.position.copy(p.position); for (const ch of p.children) q.add(mk(ch)); g.add(q); return q; });
    const glows = c.glows.map(gl => mk(gl, g));
    const gear = c.gear ? mk(c.gear, g) : null;
    // moving surfaces: flap panels on the wings, air-brake panels on the body (hinge axis and travel in userData.hinge)
    const movers = []; g.traverse(o => { if (o.userData && o.userData.hinge) movers.push(o); });
    g.userData = { props, glows, wingL, wingR, body, glass, pilot, marks, lay: Models.layout(pl), gear, movers };
    return g;
  };

  function build(pl) {
    const sp = Airframe.spec(pl), e0 = sp.entry, { L, S, R } = sp, z0 = -L / 2, has = x => sp.extras.has(x);
    // ---------------- anomaly checklist: every configuration rule is applied explicitly below, and logged when it fires
    const applied = [];
    const rule = (cond, text) => { if (cond) applied.push(text); return !!cond; };
    const pt = paint(pl), camo = [pt.top, pt.bot], dark = 0x222222, metal = 0x6a6e72, burnt = 0x4a4642, frameC = shade(pt.top, 0.55);
    const ww1 = pl.era === 1 || (sp.bi && pl.era <= 2);
    const mark = pl.id === 'mig21mf' ? 'ddr' : pl.nation; // the NVA's MiG-21s carried East German markings, not the Balkenkreuz
    const body = new Builder(), wl = new Builder(), wr = new Builder(), glassB = new Builder(), pilotB = new Builder(), lampB = new Builder();
    const ckB = new Builder(); // cockpit details seen from outside (frames, coaming, gunsight): hidden with the glass in the cockpit view
    const mkB = new Builder(), mkL = new Builder(), mkR = new Builder();
    const lum = (pt.top >> 16 & 255) * 0.3 + (pt.top >> 8 & 255) * 0.59 + (pt.top & 255) * 0.11;
    const nozzleEngines = sp.engines.filter(e => e.kind === 'fus' || e.kind === 'tunnel');
    // panel coordinates for the skin shader (Builder aUV): structure-following seams instead of a world-space grid
    const tag = (b, kind, uv) => { const p = b.parts[b.parts.length - 1]; p.kind = kind; p.uv = uv; };
    const fusUV = (cx, cy, rr) => (x, y, z) => { const c = cy(z), r = rr(z); return [z, Math.atan2(x - cx, y - c) * r, 0]; }; // [station, arc from the top]
    const mainUV = fusUV(0, z => sp.at(Math.max(z0, Math.min(L / 2, z))).y, z => { const q = sp.at(Math.max(z0, Math.min(L / 2, z))); return Math.max(0.3, (q.w + q.h) / 2); });

    // ================= STAGE 1: core fuselage by architecture, welded into one closed skin =================
    // the main body runs from the nose to the blunt exhaust plane (fuselage jets) or the tail; intake mouths are crease stations
    const deck = sp.arch === 'TWIN_NACELLE_DECK', chined = sp.arch === 'CHINED_STEALTH';
    const zMain = deck ? sp.tunnel.zB : sp.nozzleZ !== null && sp.engines.some(e => e.kind === 'fus') ? sp.nozzleZ : L / 2; // jets: the skin ends at the exhaust plane
    const mouthZ = deck ? sp.tunnel.zA : chined ? (e0.intakeProfile === 'side_box' ? sp.intakeZ : null) : sp.intakeZ !== null && sp.trunks(sp.intakeZ).length ? sp.intakeZ : null;
    const boxSides = rule(e0.intakeProfile === 'side_box' && !deck, 'side_box intakes: fuselage sides flattened into hard panels from the intake mouth to the wing trailing edge');
    const flatA = boxSides ? z0 + e0.intake.at * L : 0, flatB = boxSides ? sp.wing.rootZ + sp.wing.rc : 0;
    const NS = 56, zs = [];
    for (let i = 0; i <= NS; i++) { const z = z0 + (1 - Math.cos(Math.PI * i / NS)) / 2 * (zMain - z0); if (mouthZ === null || Math.abs(z - mouthZ) > 0.05) zs.push(z); }
    if (chined) { const t = sp.rearTaper; for (let i = 1; i < 12; i++) zs.push(t.z0 + (t.z1 - t.z0) * i / 12); zs.sort((a, b) => a - b);
      for (let i = zs.length - 1; i > 0; i--) if (zs[i] - zs[i - 1] < 0.04) zs.splice(i, 1); }
    const station = (z, drop, crease) => { const sc = sp.section(z), k = boxSides ? Math.max(0, Math.min(1, (z - flatA) / 0.6, (flatB - z) / 0.6)) : 0; // flattening ramps over 0.6 m
      const prims = sc.prims.filter(p => !drop || !drop.includes(p.part)).map(p => p.part === 'core' || p.part === 'pod' ? Object.assign({}, p, { w: Math.max(0.012, p.w), h: Math.max(0.012, p.h), n: p.n + (Math.max(4.5, p.n) - p.n) * k }) : p);
      return { z, oy: sc.oy, prims, crease }; };
    const secs = [];
    for (const z of zs) { if (mouthZ !== null && z > mouthZ && !secs.some(q => q.crease)) { secs.push(station(mouthZ, ['trunk', 'tunnel', 'bridge'], true)); secs.push(station(mouthZ, null, true)); } secs.push(station(z)); }
    const zTail = zMain;
    // the real (blended) skin's half-width at height y: walk the union ray until it lands at that height (markings, gun ports)
    const surfX = (z, y) => { if (chined || z > zMain) return sp.sideAt(z, y); const sc = station(z);
      const ray = a => { const dx = Math.cos(a), dy = Math.sin(a); let sum = 0; for (const q of sc.prims) { const t = farHit(0, sc.oy, dx, dy, q); if (t > 0) sum += Math.pow(t, UNION_P); } const rr = Math.pow(sum, 1 / UNION_P); return [dx * rr, sc.oy + dy * rr]; };
      let lo = -1.5, hi = 1.5; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (ray(m)[1] < y) lo = m; else hi = m; } // bisect the ray angle until the outline is at height y
      return ray((lo + hi) / 2)[0]; };
    const radome = sp.jet && pl.era >= 5 && e0.intakeProfile !== 'nose_cone';
    const glare = !ww1 && !sp.big && lum > 140 && pl.era <= 4; // olive anti-glare panels were a WW2 / Korea-era practice
    const noseDark = rule(e0.intakeProfile === 'nose_cone', 'nose_cone: open nose intake with lip' + (e0.intake && e0.intake.shockCone ? ' and shock cone' : ''));
    const inNozzle = (x, y) => nozzleEngines.some(e => Math.hypot((x - e.x) / e.sx, (y - e.y) / e.sy) < e.r);
    const fusPaint = (x, y, z, ny, nz) => {
      if (nz < -0.98 && z < z0 + 0.05 && noseDark) return 0x101010;                  // intake mouth
      if (nz > 0.98 && z > zTail - 0.05) return inNozzle(x, y) ? 0x161412 : shade(pt.bot, 0.72); // the blunt exhaust plane around the nozzles
      if (chined && mouthZ !== null && nz < -0.6 && Math.abs(z - mouthZ) < 0.02) return 0x0e0e0e; // caret intake mouths
      if (radome && z < z0 + L * 0.09) return shade(pt.top, 0.7);
      if (glare && ny > 0.55 && z > z0 + L * (sp.jet ? 0.1 : 0.05) && z < sp.canopy.z - sp.canopy.len * 0.5) return 0x2f3229;
      return ny < -0.25 ? pt.bot : pt.top;
    };
    rule(deck, 'TWIN_NACELLE_DECK: cockpit pod + two engine tunnels from the intake mouths to the nozzles, welded by a solid bridging deck');
    if (rule(chined, 'CHINED_STEALTH: hexagonal hard-edged fuselage; the chine widens over the caret intakes and runs on into the wing roots')) {
      rule(true, 'rear deck taper: the flat top and bottom decks converge onto ' + (nozzleEngines.length ? 'the flat 2D nozzle flaps' : 'a slim tail stinger') + ' - no flat rear wall');
      // the same stations as a hexagon: flat top and bottom faces, side walls angled out to the chine (solid between the engines)
      // the side walls carry two extra corners at the intake's top and bottom lip height: ahead of and behind the intakes they
      // lie on the straight wall, over the intakes the chine juts out between them, so the caret mouth is only as tall as the inlet
      const ih = e0.intake && e0.intakeProfile === 'side_box' ? e0.intake.height / 2 : 0;
      const hexSt = (z, wide) => { const q = Object.assign({}, sp.at(z)), k0 = sp.chine.hex(q), k = sp.rearHex(z, k0); let wc = wide ? sp.chineW(z) : q.w;
        if (k !== k0) { wc = wc + (k.wc - wc) * k.u; q.w = wc; }                       // rear deck taper: the chine closes in with the decks
        const yU = Math.min(k.cy + ih, k.cy + (k.top - k.cy) * 0.8), yL = Math.max(k.cy - ih, k.cy - (k.cy - k.bot) * 0.8);
        const xU = q.w - (q.w - k.wt) * (yU - k.cy) / Math.max(1e-6, k.top - k.cy), xL = q.w - (q.w - k.wb) * (k.cy - yL) / Math.max(1e-6, k.cy - k.bot);
        return { z, c: [[wc, k.cy], [xU, yU], [k.wt, k.top], [-k.wt, k.top], [-xU, yU], [-wc, k.cy], [-xL, yL], [-k.wb, k.bot], [k.wb, k.bot], [xL, yL]] }; };
      body.add(loftPrism(secs.map((q, i) => hexSt(q.z, !(q.crease && secs[i + 1] && secs[i + 1].crease))), 'fuselage'), fusPaint); tag(body, 'fus', mainUV);
      rule(mouthZ !== null, 'caret intakes: diamond mouths cut into the chine, their walls continuing the chine line into the wing roots');
    } else { body.add(loftUnion(secs, 48, 'fuselage'), fusPaint); tag(body, 'fus', mainUV); }
    rule(secs.some(q => q.prims.some(p => p.part === 'bridge')), 'solid bridging deck welds the tunnels\' inner walls together from the intakes to the tail (no gap on the centreline)');
    rule(secs.some(q => q.prims.some(p => p.part === 'trunk')), 'intake trunks blended into the fuselage skin (smooth union, no clamped-on boxes)');
    rule(secs.some(q => q.prims.some(p => p.part === 'housing')), 'rear fuselage swells around the engines and ends blunt at the exhaust plane');
    if (deck && rule(true, 'tail booms outboard of the engines, carrying the fins and tailplanes past the nozzles')) {
      const zb0 = sp.tunnel.zT - 0.5, zb1 = sp.tunnel.zB + sp.entry.engines.nozzleLength * 0.75;
      for (const sd of [-1, 1]) { const bs = []; for (let i = 0; i <= 12; i++) { const z = zb0 + (zb1 - zb0) * i / 12, b = Object.assign({}, sp.tailBoom(Math.min(z, sp.tunnel.zB))), k = i < 11 ? 1 : i === 11 ? 0.8 : 0.45;
          if (z > sp.tunnel.zB - 0.3) { const ng = nozzleEngines.find(g => Math.sign(g.x) === sd), top = b.y + b.h, bot = Math.max(top - b.h * 2, ng.y + ng.r * 1.04); // aft of the exhaust plane only above the nozzle
            if (Math.abs(b.x - Math.abs(ng.x)) < ng.r + b.w) { b.y = (top + bot) / 2; b.h = Math.max(0.03, (top - bot) / 2); } }
          bs.push({ z, w: b.w * k, h: b.h * (0.7 + 0.3 * k), y: b.y + b.h * 0.3 * (1 - k), x: sd * b.x }); }
        body.add(loftBody(bs, 20, 3.5, 'tail boom'), camo); tag(body, 'fus', fusUV(sd * sp.tunnel.at(zb1).x, () => sp.tailBoom(sp.tunnel.zB).y, () => 0.3)); } }
    if (rule(sp.boom, 'fairing above the exhausts carrying the fin root (the fuselage stops at the nozzle plane below it)')) {
      const bs = []; for (let i = 0; i <= 14; i++) { const z = sp.nozzleZ - 0.4 + (sp.boomEnd - sp.nozzleZ + 0.4) * i / 14, b = sp.boom(z); bs.push({ z, w: Math.max(0.02, b.w), h: Math.max(0.02, b.h), y: b.y }); }
      body.add(loftBody(bs, 28, sp.n, 'tail boom'), camo); tag(body, 'fus', mainUV);
    }
    if (sp.strakes && rule(true, 'side strakes carrying the tailplanes beside the nozzle')) { const k = sp.strakes;
      for (const sd of [-1, 1]) { const g = loftBody([0, 0.1, 0.8, 1].map((t, i) => ({ z: k.z0 + (k.z1 - k.z0) * t, w: k.w * [0.4, 1, 1, 0.5][i], h: k.h * [0.4, 1, 1, 0.5][i], y: k.y, x: sd * (k.x - k.w * 0.4) })), 16, 3, 'tail strake'); body.add(g, camo); tag(body, 'fus', mainUV); } }
    // intake mouths of the trunks / tunnels: a raked lip ring with a dark mouth plate just inside it
    if (mouthZ !== null && !chined) { const rake = e0.intake ? e0.intake.rake : 0;
      for (const p of station(mouthZ).prims.filter(p => p.part === 'trunk' || p.part === 'tunnel')) {
        body.add(lipRing(p.x, p.y, p.w, p.h, p.n, mouthZ - 0.14, mouthZ + 0.03, rake, 'intake lip'), shade(pt.top, 0.92));
        body.add(loftBody([{ z: mouthZ - 0.03, w: p.w * 0.97, h: p.h * 0.97, y: p.y, x: p.x }, { z: mouthZ - 0.015, w: p.w * 0.97, h: p.h * 0.97, y: p.y, x: p.x }], 24, p.n, 'mouth plate'), 0x0b0b0b); } }

    // ---------------- nose: intake lip and shock cone / radar pitot / propeller hub
    if (noseDark) {
      const s = sp.at(z0), r = Math.min(s.w, s.h) * 1.03;
      body.add(latheRing([[r * 0.8, z0 - 0.05], [r, z0 - 0.05], [r, z0 + r * 0.3], [r * 0.8, z0 + r * 0.3]], 24, 'intake lip', 0, s.y, 1, s.h / s.w), shade(pt.top, 0.9));
      if (sp.extra.cone) body.add(latheRing([[0.001, z0 - r * 0.9], [r * 0.5, z0 + 0.1], [0.001, z0 + 0.1]], 18, 'shock cone', 0, s.y), metal);
    }
    if (sp.jet && !noseDark && pl.era >= 4) body.add(cyl(0.025, 0.025, L * 0.05, 6), metal, [0, sp.at(z0).y, z0 - L * 0.02], [Math.PI / 2, 0, 0]); // pitot
    if (rule(sp.extra.gau8, 'GAU-8 barrel cluster under the nose')) { // A-10: the GAU-8's barrel cluster under the nose, just left of centre
      body.add(cyl(0.17, 0.17, 1.2, 10), 0x2a2a2a, [-0.15, sp.at(z0).y - R * 0.25, z0 - 0.45], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; body.add(cyl(0.025, 0.025, 1.4, 5), 0x1a1a1a, [-0.15 + Math.cos(a) * 0.11, sp.at(z0).y - R * 0.25 + Math.sin(a) * 0.11, z0 - 0.6], [Math.PI / 2, 0, 0]); }
    }
    if (rule(sp.extra.duck, 'side-by-side duckbill nose')) { const s = sp.at(z0 + L * 0.08); body.add(loftBody([0, 0.08, 0.18].map(t => { const q = sp.at(z0 + t * L); return { z: z0 + t * L + 0.05, w: q.w * 1.25 + 0.1, h: q.h * 0.5, y: q.y - q.h * 0.2 }; }), 18, 2.4, 'duckbill'), camo); }

    // ---------------- engines
    const props = [], glows = [];
    // ================= STAGE 2: open exhaust nozzles =================
    // the fuselage stops blunt at the exhaust plane; each engine ends in an open, hollow tailpipe: a metal cylinder ring
    // standing slightly proud of the body, dark heat-stained inner wall, and deep inside it the flame holder, the turbine
    // cone and a dark engine face that seals the part
    // sawtooth (chevron) trailing edge: triangle wave of the given period and depth, as a function of position along the edge
    const saw = (t, period, depth) => { const f = t / period - Math.floor(t / period); return depth * (1 - Math.abs(2 * f - 1)); };
    const nozzle2D = (e, x, y, zn) => { // F-22: flat 2.5 : 1 vectoring slot; the upper and lower flaps end in sawtooth edges
      const hw = e.r * e.sx, hh = e.r * e.sy, ln = e.nl, wall = 0.05, teeth = 3, depth = Math.min(0.32, ln * 0.25); // n: near-rectangular superellipse corners
      // wedge flaps: thick where they hinge on the deck, converging to a thin plate at the exit (outer surface carries the deck slope on);
      // the exit edge of the upper and lower flaps is cut into chevrons (sawtooth), the side walls stay straight
      const zExit = zn + ln, cut = (px, py, pz) => { if (pz < zExit - 1e-4) return pz; const dx = (px - x) / hw, dy = Math.abs(py - y) / hh, wv = Math.max(0, Math.min(1, (dy - 0.45) / 0.25));
        return pz - depth * wv + saw((dx + 1) / 2 * teeth * 2, 2, depth) * wv; }; // teeth peaks reach the full exit, valleys cut back by depth
      const g = slotRing([[1, zn - 0.35], [1, zn], [0.86, zn + ln * 0.6], [0.78, zExit], [0.78 - wall / hh, zExit], [0.8 - wall / hh, zn + ln * 0.5], [1 - wall / hh, zn - 0.35]], 160, 'nozzle', x, y, hw, hh, hh * 0.35, cut);
      body.add(g, (px, py, pz) => { const ddy = Math.abs(py - y) / hh, ddx = Math.abs(px - x) / hw; if (ddy < 0.86 && ddx < 0.86 && pz > zn - 0.3) return 0x1f1d1b; // sooty inner walls
        return new THREE.Color(0x80817f).lerp(new THREE.Color(0x5c5b58), Math.max(0, Math.min(1, (pz - zn) / ln))).getHex(); }); // radar-absorbent grey flaps
      body.parts[body.parts.length - 1].skin = 3;
      body.add(slotRing([[0.001, zn - 0.02], [0.9, zn - 0.02], [0.9, zn + 0.02], [0.001, zn + 0.02]], 64, 'engine face', x, y, hw, hh, hh * 0.35), 0x0d0c0b);
      for (const k of [-0.5, 0, 0.5]) body.add(box(0.03, hh * 1.7, 0.06), 0x2a2826, [x + k * hw, y, zn + 0.06]); // vanes / struts in the throat
      if (pl.ab) { const gg = new THREE.Mesh(zcyl(hh * 0.9, hh * 0.1, L * 0.3, 12), mat('glow')); gg.scale.set(hw / hh, 1, 1); gg.position.set(x, y, zn + ln + L * 0.15); gg.visible = false; glows.push(gg); }
    };
    const nozzle = (e, x, y, zn) => {
      const style = e.style || (pl.ab ? 'feathered' : 'plain'), ab = style !== 'plain';
      if (rule(style === '2d_serrated', '2D vectoring nozzles: flat 2.5 : 1 slots with sawtooth upper and lower flap edges')) return nozzle2D(e, x, y, zn);
      const ro = e.r, ri = e.r * 0.88, ln = e.nl || e.r * (ab ? 0.55 : 0.32), sx = e.sx || 1, sy = e.sy || 1, np = e.rect ? 0 : style === 'round_serrated' ? 18 : 16;
      // real exhaust metal: a hot-blued / straw titanium band next to the skin, darkening to sooty steel at the lip
      const ringPaint = (px, py, pz) => { const dx = (px - x) / sx, dy = (py - y) / sy, rr = Math.hypot(dx, dy), u = Math.max(0, Math.min(1, (pz - zn) / ln));
        if (rr < ri * 0.99 || (pz > zn + ln - 0.02 && rr < (ri + ro) / 2)) return 0x24211e;                       // sooty inner wall
        const c = new THREE.Color(ab ? 0x8c8478 : 0x7d7c78).lerp(new THREE.Color(ab ? 0x4a4038 : 0x55524c), u);
        if (np && Math.floor((Math.atan2(dy, dx) / (Math.PI * 2) + 0.5) * np * 2 + 0.5) % 2) c.multiplyScalar(0.86);  // overlapping petals
        return c.getHex(); };
      // profile: from inside the skin, the outer surface converges (boat-tail), then for afterburners the divergent petals run
      // straight to a scalloped lip; inside, the throat narrows then opens to the exit
      const outer = ab ? [[ro, zn - 0.3], [ro, zn], [ro * 0.92, zn + ln * 0.45], [ro * 0.86, zn + ln]] : [[ro, zn - 0.3], [ro, zn], [ro * 0.94, zn + ln]];
      const inner = ab ? [[ri * 0.95, zn + ln], [ri * 0.82, zn + ln * 0.5], [ri * 0.86, zn - 0.3]] : [[ri * 0.98, zn + ln], [ri, zn - 0.3]];
      const g = latheRing([...outer, ...inner], np ? np * 4 : 36, 'nozzle', x, y, sx, sy, e.rect ? 4 : 2);
      if (np && ab) { const pa = g.attributes.position; // scalloped exit: each petal's trailing edge stands out a little past its neighbours
        const serr = rule(style === 'round_serrated', 'round vectoring nozzles with sawtooth petal edges (stealth)');
        for (let k = 0; k < pa.count; k++) { if (pa.getZ(k) < zn + ln - 0.01) continue; const a = Math.atan2(pa.getY(k) - y, pa.getX(k) - x);
          pa.setZ(k, pa.getZ(k) + (serr ? saw(a / (Math.PI * 2) * np + 0.5, 1, ro * 0.22) - ro * 0.22 : 0.045 * Math.max(0, Math.cos(a * np)))); } // serrated: pointed chevron petals
        g.computeVertexNormals(); }
      body.add(g, ringPaint); body.parts[body.parts.length - 1].skin = 3;
      if (style === 'bare') { // F-15: no feathers - the actuator rods and their brackets run along the outside of the nozzle
        for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a), p0 = new V(x + c * ro * 1.02, y + s2 * ro * 1.02, zn - 0.05), p1 = new V(x + c * ro * 0.92, y + s2 * ro * 0.92, zn + ln * 0.75);
          body.add(tube([p0, p1], 0.028), 0x6e6a64); body.add(box(0.07, 0.05, 0.1), 0x4a4640, [p1.x, p1.y, p1.z], [0, 0, a]); } }
      const zf = zn + 0.02;                                                          // engine face on the exhaust plane: the void is the full tailpipe
      body.add(latheRing([[0.001, zf - 0.02], [ri * 0.83, zf - 0.02], [ri * 0.83, zf + 0.02], [0.001, zf + 0.02]], 28, 'engine face', x, y, sx, sy, e.rect ? 4 : 2), 0x0d0c0b);
      if (!e.rect) {
        body.add(latheRing([[ri * 0.5, zf + 0.04], [ri * 0.6, zf + 0.04], [ri * 0.6, zf + 0.11], [ri * 0.5, zf + 0.11]], 20, 'flame holder', x, y), 0x3a3632);
        body.add(latheRing([[0.001, zf + 0.025], [ri * 0.28, zf + 0.025], [0.001, zf + 0.02 + ri * 0.45]], 16, 'turbine cone', x, y), 0x2e2b28);
      }
      if (pl.ab) { const gg = new THREE.Mesh(zcyl(ri * 0.9, ri * 0.06, L * 0.32, 12), mat('glow')); gg.scale.set(sx, sy, 1); gg.position.set(x, y, zn + ln + L * 0.16); gg.visible = false; glows.push(gg); }
    };
    const nacelle = (e, prof, name) => { body.add(loftBody(prof.map(([t, k, ky]) => ({ z: e.z - e.len / 2 + t * e.len, w: e.r * k, h: e.r * (ky || k), y: e.y, x: e.x })), 20, 2, name), (x, y, z, ny, nz) => nz < -0.98 ? 0x101010 : ny < -0.25 ? pt.bot : pt.top); tag(body, 'fus', fusUV(e.x, () => e.y, () => e.r)); };
    for (const e of sp.engines) {
      if (e.kind === 'fus' || e.kind === 'tunnel') nozzle(e, e.x, e.y, e.nozzle);
      else if (e.kind === 'underwing' || e.kind === 'wingnac' || e.kind === 'pod') {
        nacelle(e, [[0, 0.86], [0.05, 0.97], [0.25, 1], [0.7, 0.94], [1, 0.72]], e.kind);
        const zf = e.z - e.len / 2;
        body.add(latheRing([[e.r * 0.72, zf - 0.06], [e.r * 0.9, zf - 0.06], [e.r * 0.9, zf + 0.25], [e.r * 0.72, zf + 0.25]], 20, 'nacelle lip', e.x, e.y), shade(pt.top, 0.9));
        body.add(latheRing([[0.001, zf - e.r * 0.2], [e.r * 0.3, zf + e.r * 0.2], [0.001, zf + e.r * 0.2]], 14, 'fan hub', e.x, e.y), e.kind === 'pod' ? 0x8a8a8a : metal);
        nozzle({ r: e.r * 0.72 }, e.x, e.y, e.z + e.len / 2);
        if (e.kind === 'underwing') { const wa = sp.wingAt(sp.wingF(e.x)); body.add(box(0.12, Math.max(0.1, wa.y - e.y - e.r * 0.6), e.len * 0.45), camo, [e.x, (wa.y + e.y + e.r * 0.6) / 2, e.z - e.len * 0.05]); }
        if (e.kind === 'pod') { const ft = sp.topAt(e.z, e.x * 0.4), side = Math.sign(e.x); // pylon from the upper rear fuselage
          const py = box(0.18, Math.max(0.2, e.y - e.r * 0.7 - ft + 0.25), e.len * 0.42); py.rotateZ(side * 0.5); body.add(py, camo, [e.x * 0.72, (e.y - e.r * 0.7 + ft) / 2, e.z]); }
      } else if (e.kind === 'sidenac' || e.kind === 'nacelle') { // jet nacelles
        nacelle(e, [[0, 0.88, 0.92], [0.06, 0.98, 1], [0.5, 1, 1], [0.85, 0.96, 0.94], [1, 0.84, 0.82]], e.kind);
        nozzle({ r: e.r * 0.84, style: e.style, nl: e.style ? e.r * 0.5 : undefined }, e.x, e.y, e.z + e.len / 2);
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
          body.add(loftBody([[0, 0.9], [0.5, 0.7], [0.9, 0.55], [1, 0.4]].map(([t, k]) => ({ z: bz0 + t * (bz1 - bz0), w: e.r * k, h: e.r * k * 1.05, y: e.y, x: e.x })), 18, 2, 'boom'), camo); tag(body, 'fus', fusUV(e.x, () => e.y, () => e.r * 0.7));
        }
      }
      const s = e.kind === 'prop' ? sp.at(z0) : { w: e.r * 0.82, h: e.r * 0.82, y: e.y };
      const cr = Math.min(s.w, s.h), cy = e.kind === 'prop' ? s.y : e.y;
      if (e.radial) { // radial engine: cowling ring, dark front with cylinder heads
        body.add(latheRing([[cr * 0.78, zf - 0.06], [cr * 1.04, zf - 0.06], [cr * 1.04, zf + 0.3], [cr * 0.78, zf + 0.3]], 26, 'cowl lip', e.x, cy), pt.acc === 0xcccccc ? pt.top : pt.acc);
        body.add(cyl(cr * 0.8, cr * 0.8, 0.06, 22), 0x1c1c1c, [e.x, cy, zf + 0.05], [Math.PI / 2, 0, 0]);
        const nc = pl.era <= 2 ? 9 : 14; for (let k = 0; k < nc; k++) { const a = k / nc * Math.PI * 2; body.add(box(cr * 0.18, cr * 0.34, 0.12), 0x3c3c3c, [e.x + Math.cos(a) * cr * 0.55, cy + Math.sin(a) * cr * 0.55, zf + 0.02], [0, 0, a + Math.PI / 2]); }
      } else if (e.kind === 'prop' && !ww1) for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) { // inline engine: exhaust stacks seated on the cowling
        const z = z0 + Math.max(0.55, L * 0.075) + k * 0.17, y = sp.at(z).y + sp.at(z).h * 0.3, x = sp.sideAt(z, y); body.add(box(0.1, 0.08, 0.12), 0x2c2622, [sd * (x + 0.025), y, z], [0, 0, sd * 0.4]); } // six ejector stubs ~17 cm apart
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
      body.add(lipRing(x, y, w, h, n, zi - 0.1, zi + 0.04, Math.atan(rake || 0) * 180 / Math.PI, 'intake lip'), shade(pt.top, 0.92)); // rounded lip, as on the trunks
    };
    rule(deck && it, 'intakes lead straight into the two engine tunnels');
    if (it && it.type !== 'nose_cone' && !deck && !(chined && it.type === 'side_box')) {
      const zi = z0 + it.at * L, len = it.length * L, w = it.width / 2, h = it.height / 2, rake = Math.tan(it.rake * Math.PI / 180); // mouth half-sizes (m)
      const trunks = mouthZ !== null ? station(mouthZ).prims.filter(p => p.part === 'trunk') : [];
      if (rule(it.type === 'side_box' || it.type === 'cheek_crescent', it.type === 'side_box' ? 'side_box: raked rounded-rectangular intake trunks blended into the fuselage sides' : 'cheek_crescent: half-round cheek intakes blended into the fuselage')) for (const p of trunks) {
        const s = Math.sign(p.x), x = p.x, y = p.y;
        if (rule(it.splitter && s > 0, 'boundary-layer splitter plates')) {} if (it.splitter) body.add(box(0.04, h * 1.7, len * 0.3), camo, [x - s * w * 1.12, y, zi + len * 0.1]);
        if (rule(it.shockCone && s > 0, 'half-cone shock bodies in the intakes')) {} if (it.shockCone) body.add(latheRing([[0.001, zi - h * 0.7], [Math.min(w, h) * 0.6, zi + 0.1], [0.001, zi + 0.1]], 14, 'half cone', x - s * w * 0.3, y), metal);
      }
      else if (rule(it.type === 'chin_scoop', 'chin_scoop: intake trunk under the forward fuselage, blended into the belly')) {}
      else if (rule(it.type === 'ventral_box', 'ventral_box: raked intakes under the LERX, ahead of the engine nacelles')) {
        const ns = sp.engines.filter(e => e.kind === 'nacelle');
        for (const e of ns) duct(e.x, e.y - e.r * 0.15, zi, len + (e.z - e.len / 2 - zi) + 0.3, w, h, 3.2, rake, 'ventral intake');
        if (ns.length === 2 && rule(chined, 'solid keel bridging the engine nacelles inner walls to the fuselage, from the intakes to the tail')) {
          const e = ns[0], za = zi + len * 0.5, zb = e.z + e.len / 2 - 0.3, ks = [];
          for (let i = 0; i <= 12; i++) { const z = za + (zb - za) * i / 12, yt = sp.botAt(z) + 0.15, yb = e.y - e.r * 0.75; ks.push({ z, w: Math.abs(e.x), h: Math.max(0.05, (yt - yb) / 2), y: (yt + yb) / 2 }); }
          body.add(loftBody(ks, 24, 5, 'keel bridge'), camo); }
      }
      else if (rule(it.type === 'wing_root', 'wing_root: intake slots in the wing-root leading edges')) for (const s of [-1, 1]) { const w0 = sp.wingAt(0.02); body.add(box(w * 2, Math.min(h * 2, sp.wing.t * w0.c * 0.9), 0.06), 0x0e0e0e, [s * (sp.wing.x0 + w * 1.2), w0.y, w0.le - 0.03]); }
    }
    rule(e0.intakeProfile === 'nacelle', 'nacelle: each engine nacelle / pod carries its own intake');

    // ---------------- canopy / cockpit
    const cp = sp.canopy, cz = cp.z, putPilot = (z, y, x) => {
      pilotB.add(sphere(0.12), ww1 ? 0x4a3420 : sp.jet && pl.era >= 4 ? 0x9a9a8a : 0x3a3328, [x || 0, y, z]);
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
    if (rule(cp.type === 'open', 'open cockpit with windscreen')) {
      const top = sp.topAt(cz), ring = new THREE.TorusGeometry(Math.min(0.42, sp.at(cz).w * 0.75), 0.045, 6, 18); ring.rotateX(Math.PI / 2); ckB.add(ring, 0x3a2614, [0, top + 0.01, cz + 0.1], null, [1, 1, 1.25]);
      const wsZ = cz - 0.45, wsW = Math.max(0.24, R * 0.36), wsH = Math.max(0.22, R * 0.34), wt = sp.topAt(wsZ);
      const ws = box(wsW * 2, wsH, 0.02); ws.rotateX(-0.35); glassB.add(ws, 0xffffff, [0, wt + wsH * 0.45, wsZ]);
      ckB.add(tube([new V(-wsW, wt, wsZ), new V(-wsW, wt + wsH * 0.9, wsZ + wsH * 0.32), new V(wsW, wt + wsH * 0.9, wsZ + wsH * 0.32), new V(wsW, wt, wsZ)], 0.014), 0x2a2a2a);
      if (pl.era >= 2) body.add(loftBody([0, 0.3, 0.7, 1].map(t => ({ z: cz + 0.35 + t * L * 0.16, w: R * 0.22 * (1 - t * 0.6), h: R * 0.42 * (1 - t * 0.85) + 0.02, y: sp.topAt(cz + 0.35 + t * L * 0.16) - 0.05 })), 14, 2, 'headrest'), pt.top);
      putPilot(cz + 0.12, top + 0.12);
      if (cp.two) { const z2 = cz + L * 0.13, t2 = sp.topAt(z2), r2 = new THREE.TorusGeometry(Math.min(0.4, sp.at(z2).w * 0.72), 0.045, 6, 18); r2.rotateX(Math.PI / 2); ckB.add(r2, 0x3a2614, [0, t2 + 0.01, z2]); putPilot(z2, t2 + 0.12); }
      if (rule(has('gunHump'), 'gun hump ahead of the open cockpit')) body.add(loftBody([0, 0.5, 1].map(t => ({ z: cz - L * 0.2 + t * L * 0.14, w: R * 0.5, h: R * 0.28 * Math.sin(Math.PI * (0.15 + t * 0.7)), y: sp.topAt(cz - L * 0.2 + t * L * 0.14) - 0.05 })), 16, 2, 'gun hump'), camo);
    } else if (rule(cp.type === 'glazed_nose' || cp.type === 'stepped', 'glazed bomber nose (' + cp.type + ')')) {
      // bombers: a glazed shell over the nose (fully glazed nose, or the bomb-aimer's nose under a stepped cockpit)
      const gl = cp.type === 'glazed_nose' ? L * 0.1 : L * 0.045, gs = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10, z = z0 - 0.03 + u * gl, s = sp.at(Math.max(z0, z)); gs.push({ z, w: s.w * 1.03 + 0.01, h: s.h * 1.03 + 0.01, y: s.y }); }
      glassB.add(loftBody(gs, 24, sp.n, 'glazed nose'), 0xffffff);
      for (const u of [0.35, 0.7]) { const z = z0 + u * gl, s = sp.at(z), pts = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2; pts.push(new V(s.w * 1.05 * Math.cos(a), s.y + s.h * 1.05 * Math.sin(a), z)); } ckB.add(tube(pts, 0.025), frameC); }
      if (cp.type === 'stepped') { canopy(CAN.framed, cz, Math.max(1.4, L * 0.08), Math.min(sp.at(cz).w * 0.85, R * 0.75), R * 0.55, 0, { arcs: [0.12, 0.45, 0.8], rail: [0.1, 1] }); for (const sd of [-0.3, 0.3]) putPilot(cz + 0.1, sp.topAt(cz) + 0.12, sd * R); }
      else for (const sd of [-0.3, 0.3]) putPilot(z0 + gl * 0.8, sp.at(z0 + gl).y + 0.1, sd * R);
    } else {
      const kind = cp.type, prof = kind === 'greenhouse' ? CAN.greenhouse : kind === 'bubble' || kind === 'side_by_side' ? CAN.bubble : CAN.framed;
      const frames = kind === 'bubble' || kind === 'side_by_side' ? { arcs: cp.frameless ? [] : [0.16], rail: null } : kind === 'greenhouse' ? { arcs: [0.12, 0.3, 0.5, 0.7, 0.88], rail: [0.1, 1] } : { arcs: [0.13, 0.4, 0.72], rail: [0.1, 1] };
      // dark cockpit tub and coaming inside the glass
      ckB.add(cyl(1, 1, 0.02, 18), 0x17191b, [cp.x, sp.topAt(cz, cp.x) - 0.02, cz], null, [cp.w * 0.85, 1, cp.len * 0.42]);
      ckB.add(box(cp.w * 1.6, 0.1, 0.22), 0x1d1f21, [cp.x, sp.topAt(cz - cp.len * 0.3, cp.x) + 0.03, cz - cp.len * 0.3]);
      canopy(prof, cz, cp.len, cp.w, cp.h, cp.x, frames);
      if (rule(kind === 'razorback', 'razorback spine behind the canopy')) { // razorback: the spine fairs the canopy back into the tail
        const zA = cz + cp.len / 2 - 0.05, zB = Math.min(sp.fins[0] ? sp.fins[0].zLE : L * 0.4, zA + L * 0.32), rs = [];
        for (let i = 0; i <= 8; i++) { const u = i / 8, z = zA + u * (zB - zA), top = sp.topAt(z); rs.push({ z, w: cp.w * 0.9 * (1 - u * 0.75), h: Math.max(0.03, (cp.h * 0.72 + 0.07) * (1 - u) + 0.04), y: top - 0.07 }); }
        body.add(loftBody(rs, 16, 2.2, 'razorback'), camo);
      }
      const seats = cp.two ? (kind === 'side_by_side' ? [[cz - 0.1, -cp.w * 0.42], [cz - 0.1, cp.w * 0.42]] : [[cz - cp.len * 0.22, 0], [cz + cp.len * 0.22, 0]]) : [[cz + cp.len * 0.05, 0]];
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
      const geo = loftSurface(st, 18, 'wing' + i), pf = wingPaint(g);
      const wuv = (x, y, z) => { const f = Math.max(0, Math.min(1, (Math.abs(x) - g.x0) / (g.b - g.x0))), w = sp.wingAt(f, g); return [Math.abs(x), (z - w.le) / w.c, w.c]; };
      wr.add(geo, pf); tag(wr, 'surf', wuv); wl.add(mirrorX(geo), pf); tag(wl, 'surf', wuv);
      if (rule(g.tiptanks && i === 0, 'wing-tip tanks')) { const tip = sp.wingAt(1, g), tl = Math.max(2.4, tip.c * 2.4), tr = Math.max(0.3, tl * 0.12);
        const tank = [0, 0.1, 0.3, 0.7, 0.9, 1].map((t, k) => ({ z: tip.le + tip.c * 0.4 - tl * 0.5 + t * tl, w: tr * [0.05, 0.7, 1, 1, 0.7, 0.05][k], h: tr * [0.05, 0.7, 1, 1, 0.7, 0.05][k], y: tip.y, x: tip.x + tr * 0.2 }));
        const tg = loftBody(tank, 16, 2, 'tip tank'); wr.add(tg, camo); wl.add(mirrorX(tg), camo); }
      if (rule(g.fences && i === 0, 'wing fences')) for (let k = 0; k < g.fences; k++) { const w = sp.wingAt(0.3 + k * 0.22, g); for (const [b, s] of [[wr, 1], [wl, -1]]) b.add(box(0.03, g.t * w.c + 0.12, w.c * 0.9), shade(pt.top, 0.92), [s * w.x, w.y + 0.05, w.le + w.c * 0.47]); }
      if (rule(g.tiprail && i === 0, 'wing-tip missile rails')) { const tip = sp.wingAt(1, g); for (const [b, s] of [[wr, 1], [wl, -1]]) b.add(cyl(0.08, 0.08, tip.c * 1.6, 8), metal, [s * (tip.x + 0.05), tip.y, tip.le + tip.c * 0.4], [Math.PI / 2, 0, 0]); }
    });
    if (sp.arch === 'TWIN_NACELLE_DECK' && rule(sp.extra.lerx, 'lexPresence: flat, sharp LEX shelf from the wing root forward along the cockpit')) {
      const w0 = sp.wingAt(0), zA = Math.max(sp.tunnel.zA - 0.3, cp.z + cp.len * 0.2), q = sp.tunnel.at(w0.le), y = q.y + q.h + 0.03;
      const lx = loftSurface([{ x: sp.at(zA).w * 0.85, le: zA, c: w0.le - zA + w0.c * 0.25, y, t: 0.012 }, { x: q.x + q.w, le: w0.le - 0.1, c: w0.c * 0.3, y, t: 0.012 }], 8, 'lex');
      body.add(lx, camo); body.add(mirrorX(lx), camo); }
    else if (rule(sp.extra.lerx, 'leading-edge root extensions')) { const w0 = sp.wingAt(0), zA = w0.le - L * 0.24, s = sp.at(zA + L * 0.1);
      const lx = loftSurface([{ x: s.w * 0.6, le: zA, c: w0.le - zA + w0.c * 0.3, y: w0.y, t: 0.025 }, { x: sp.wing.x0 + R * 0.75, le: w0.le - 0.15, c: w0.c * 0.35, y: w0.y, t: 0.025 }], 8, 'lerx');
      body.add(lx, camo); body.add(mirrorX(lx), camo); }
    if (rule(sp.extra.canards, 'canards: forward lifting surfaces ' + (sp.extra.canards ? sp.extra.canards.offset : 0) + ' m behind the cockpit centre')) {
      const cd = sp.extra.canards, zc = cp.z + cd.offset, s0 = sp.at(zc), y = s0.y + cd.height * s0.h, x0 = sp.sideAt(zc, y) * 0.85, c = cd.length * 0.9;
      const cg = loftSurface([{ x: x0, le: zc - c * 0.5, c, y, t: 0.04 }, { x: x0 + cd.length, le: zc - c * 0.5 + Math.tan(cd.sweep) * cd.length, c: c * 0.3, y, t: 0.04 }], 8, 'canard');
      body.add(cg, camo); body.add(mirrorX(cg), camo); }
    // ---------------- radiators (registry radiator block, real sizes): a fairing with a dark, lipped inlet and a tapering exit
    const rad = sp.radiator;
    const bath = (b, x, zA, len, w, d, yTop, yBot, name) => { // stations: open inlet, full section, then the exit flap closing into the skin
      const st = [0, 0.08, 0.55, 0.85, 1].map((t, k) => { const z = zA + t * len, top = yTop(z), bot = yBot(z) + (top - yBot(z)) * [0, 0, 0, 0.35, 0.8][k]; return { z, w: w / 2 * [1, 1, 1, 0.92, 0.7][k], h: Math.max(0.03, (top - bot) / 2), y: (top + bot) / 2, x }; });
      b.add(loftBody(st, 24, 3, name), (px, py, pz, ny, nz) => nz < -0.6 && pz < zA + 0.05 ? 0x0c0c0c : ny < -0.25 ? pt.bot : pt.top);
      b.add(lipRing(x, st[0].y, w / 2 * 0.97, st[0].h * 0.97, 3, zA - 0.06, zA + 0.03, 0, 'radiator lip'), shade(pt.bot, 0.9)); };
    if (rad && rule(rad.type === 'belly', 'belly radiator scoop (' + rad.length + ' m long, ' + rad.depth + ' m deep)')) {
      const zA = z0 + rad.at * L, b0 = sp.botAt(zA); bath(body, 0, zA, rad.length, rad.width, rad.depth, z => sp.botAt(z) + 0.12, z => Math.min(b0 - rad.depth, sp.botAt(z) - 0.05), 'belly scoop'); }
    if (rad && rule(rad.type === 'chin', 'chin radiator under the engine (' + rad.length + ' m long, ' + rad.depth + ' m deep)')) {
      const zA = z0 + rad.at * L, b0 = sp.botAt(zA); bath(body, 0, zA, rad.length, rad.width, rad.depth, z => sp.botAt(z) + 0.12, z => Math.min(b0 - rad.depth * 0.8, sp.botAt(z) - 0.05), 'chin radiator'); }
    if (rad && rule(rad.type === 'wing', 'underwing radiator baths at ' + Math.round(rad.span * 100) + '% semi-span')) for (const [b, sd] of [[wl, -1], [wr, 1]]) {
      const w = sp.wingAt(rad.span), zA = w.le + w.c * rad.at, lowY = z => sp.wingAt(rad.span).y - naca(Math.max(0, Math.min(1, (z - w.le) / w.c)), sp.wing.t) * w.c;
      bath(b, sd * w.x, zA, rad.length, rad.width, rad.depth, z => lowY(z) + 0.05, () => lowY(zA + rad.length * 0.3) - rad.depth, 'wing radiator'); }
    if (rad && rule(rad.type === 'wingRoot', 'cooling inlets in the wing-root leading edges')) for (const [b, sd] of [[wl, -1], [wr, 1]]) {
      const w = sp.wingAt(rad.span); b.add(box(rad.width, rad.depth, 0.05), 0x0c0c0c, [sd * (w.x + rad.width / 2), w.y, w.le + 0.035]); } // only its front face shows, as a slot in the rounded leading edge
    // ---------------- variable-sweep glove: the fixed inner wing from the fuselage side out to the pivot, its leading edge swept further
    if (sp.glove && rule(true, 'fixed wing glove to the pivot at ' + Math.round(sp.glove.span * 100) + '% semi-span, ' + sp.glove.sweep + ' deg leading edge')) {
      const wp = sp.wingAt(sp.glove.span), w0 = sp.wingAt(0), xi = Math.max(0.05, sp.wing.x0 * 0.9), le0 = wp.le - (wp.x - xi) * Math.tan(sp.glove.sweep * Math.PI / 180);
      const gl = loftSurface([{ x: xi, le: le0, c: w0.le + w0.c * 0.7 - le0, y: w0.y, t: 0.035 }, { x: wp.x, le: wp.le, c: wp.c * 0.55, y: wp.y, t: 0.04 }], 10, 'glove');
      body.add(gl, camo); tag(body, 'surf', (x, y, z) => [Math.abs(x), 0.5, 1]); body.add(mirrorX(gl), camo); tag(body, 'surf', (x, y, z) => [Math.abs(x), 0.5, 1]); }
    if (rule(sp.extra.gearPods, 'main-gear pods under the wings')) { const [gx, gl] = sp.extra.gearPods; for (const s of [-1, 1]) { const w = sp.wingAt(sp.wingF(gx * S)), len = gl * L, r = Math.max(0.35, R * 0.45);
      body.add(loftBody([0, 0.15, 0.5, 0.85, 1].map((t, k) => ({ z: w.le - len * 0.35 + t * len, w: r * [0.2, 0.8, 1, 0.8, 0.2][k] * 0.8, h: r * [0.2, 0.8, 1, 0.8, 0.2][k], y: w.y - r * 0.55, x: s * gx * S })), 16, 2, 'gear pod'), camo); } }
    if (rule(sp.extra.cft, 'conformal fuel tanks')) for (const s of [-1, 1]) { const zA = sp.wing.rootZ - L * 0.05; body.add(loftBody([0, 0.1, 0.9, 1].map((t, k) => ({ z: zA + t * L * 0.3, w: R * [0.2, 0.45, 0.45, 0.2][k], h: R * [0.2, 0.42, 0.42, 0.2][k], y: sp.wing.y - R * 0.15, x: s * (sp.sideAt(zA + L * 0.15, sp.wing.y) + R * 0.2) })), 14, 2.6, 'cft'), camo); }
    if (rule(sp.extra.belly, 'ventral tank')) { const zA = sp.wing.rootZ; body.add(loftBody([0, 0.15, 0.85, 1].map((t, k) => ({ z: zA + t * L * 0.3, w: R * [0.2, 0.55, 0.55, 0.2][k], h: R * [0.2, 0.5, 0.5, 0.2][k], y: sp.botAt(zA + L * 0.15) - R * 0.3 })), 16, 2, 'ventral tank'), camo); }
    // wing guns: barrels out of the real leading edge
    const wingGunAt = x => { const f = sp.wingF(x), w = sp.wingAt(f); return w; };
    // biplanes: struts, bracing wires, cabane, fixed undercarriage
    if (sp.bi) {
      const lo = sp.wings[0], up = sp.wings[sp.wings.length - 1], sx = (lo.b) * (has('vStruts') ? 0.62 : 0.66), fl = sp.wingF(sx);
      const pl0 = sp.wingAt(Math.min(1, (sx - lo.x0) / (lo.b - lo.x0)), lo), pu = sp.wingAt(Math.min(1, (sx - up.x0) / (up.b - up.x0)), up);
      for (const [b, d] of [[wl, -1], [wr, 1]]) {
        if (rule(has('vStruts'), 'sesquiplane V-struts')) for (const k of [0.2, 0.7]) b.add(tube([new V(d * sx * 0.98, pl0.y + 0.03, pl0.le + pl0.c * 0.4), new V(d * sx, pu.y - 0.03, pu.le + pu.c * k)], 0.035), 0x5a4a3a);
        else for (const k of [0.22, 0.72]) b.add(tube([new V(d * sx, pl0.y + 0.03, pl0.le + pl0.c * k), new V(d * sx, pu.y - 0.03, pu.le + pu.c * k)], 0.035), 0x5a4a3a);
        if (pl.id !== 'fd7') { b.add(tube([new V(d * R * 0.6, pl0.y + 0.03, pl0.le + pl0.c * 0.3), new V(d * sx, pu.y - 0.05, pu.le + pu.c * 0.3)], 0.01), 0x8a8a8a); b.add(tube([new V(d * R * 0.6, pu.y - 0.05, pu.le + pu.c * 0.6), new V(d * sx, pl0.y + 0.05, pl0.le + pl0.c * 0.6)], 0.01), 0x8a8a8a); }
      }
      for (const k of [0.2, 0.7]) { const zc = up.rootZ + up.rc * k, ft = sp.topAt(zc); for (const s of [-1, 1]) body.add(tube([new V(s * sp.at(zc).w * 0.6, ft - 0.05, zc + 0.15), new V(s * R * 0.35, up.y - 0.03, zc)], 0.03), 0x5a4a3a); }
      for (const s of [-1, 1]) { const gz = lo.rootZ + lo.rc * 0.05, gy = -R * 2.0; body.add(tube([new V(s * R * 0.7, sp.botAt(gz) + 0.05, gz - 0.3), new V(s * R * 1.0, gy, gz)], 0.03), 0x4a4a4a); body.add(tube([new V(s * R * 0.7, sp.botAt(gz + 0.6) + 0.05, gz + 0.5), new V(s * R * 1.0, gy, gz)], 0.03), 0x4a4a4a);
        const wh = latheRing([[0.12, -0.06], [0.32, -0.06], [0.32, 0.06], [0.12, 0.06]], 16, 'wheel'); wh.rotateY(Math.PI / 2); body.add(wh, dark, [s * R * 1.05, gy, gz]); }
      body.add(cyl(0.025, 0.025, R * 2.1, 6), 0x4a4a4a, [0, -R * 2.0, lo.rootZ + lo.rc * 0.05], [0, 0, Math.PI / 2]);
      body.add(box(0.06, 0.4, 0.5), 0x4a3a28, [0, sp.botAt(L * 0.44) - 0.1, L * 0.44], [0.6, 0, 0]); // tail skid
    } else if (rule(has('fixedGear'), 'fixed undercarriage')) for (const s of [-1, 1]) {
      const gx = s * S * 0.15, w = wingGunAt(gx), gy = w.y - R * 1.2, gz = w.le + w.c * 0.3;
      body.add(loftSurface([{ x: 0, le: -0.2, c: has('spats') ? 0.42 : 0.25, y: 0, t: 0.3 }, { x: w.y - gy, le: -0.2, c: has('spats') ? 0.42 : 0.25, y: 0, t: 0.3 }], 6, 'gear leg').rotateZ(-Math.PI / 2), camo, [gx, w.y + 0.05, gz]);
      if (rule(has('spats'), 'streamlined wheel spats')) body.add(loftBody([0, 0.15, 0.45, 0.8, 1].map((t, k) => ({ z: gz - 0.55 + t * 1.15, w: 0.17 * [0.2, 0.8, 1, 0.75, 0.15][k], h: 0.36 * [0.25, 0.85, 1, 0.8, 0.2][k], y: gy })), 14, 2, 'spat'), camo);
      else { const wh = latheRing([[0.1, -0.07], [0.3, -0.07], [0.3, 0.07], [0.1, 0.07]], 16, 'wheel'); wh.rotateY(Math.PI / 2); body.add(wh, dark, [gx, gy, gz]); }
    }
    if (rule(has('bracingWires') && !sp.bi, 'monoplane wing bracing wires')) for (const s of [-1, 1]) { const w = wingGunAt(s * S * 0.3); for (const yy of [sp.topAt(cz - 0.5) - 0.02, sp.botAt(cz - 0.5) + 0.05]) (s < 0 ? wl : wr).add(tube([new V(s * sp.at(cz - 0.5).w * 0.7, yy, cz - 0.5), new V(s * w.x, w.y, w.le + w.c * 0.4)], 0.012), 0x9a9a9a); }

    // ---------------- tail surfaces
    const st = sp.stab;
    if (st) {
      const at = f => { const x = st.x0 + (st.b - st.x0) * f; return { x, le: st.zLE + st.sw * (x - st.x0), c: st.rc * (1 - f) + st.tc * f, y: st.y + Math.tan(st.dih) * (x - st.x0) }; };
      const facet = rule(st.diamond && chined, 'faceted diamond stabilators: double-wedge section, edges aligned with the wing (' + st.swTE + ' deg trailing edge)');
      const geo = facet ? facetSurface([0, 0.25, 0.5, 0.75, 1].map(f => Object.assign(at(f), { t: 0.045 })), 'stabiliser') : loftSurface(surfStations({ t: st.t }, at), 12, 'stabiliser'), suv = (x, y, z) => { const a = at(Math.max(0, Math.min(1, (Math.abs(x) - st.x0) / (st.b - st.x0)))); return [Math.abs(x), (z - a.le) / a.c, a.c]; };
      body.add(geo, (x, y, z, ny) => { const f = (Math.abs(x) - st.x0) / (st.b - st.x0), a = at(Math.max(0, Math.min(1, f))), fr = (z - a.le) / a.c, base = ny < -0.25 ? pt.bot : pt.top; return fr > 0.7 && (!sp.jet || pl.era <= 4) ? shade(base, 0.86) : base; }); tag(body, 'surf', suv);
      body.add(facet ? mirrorFlat(geo) : mirrorX(geo), (x, y, z, ny) => { const f = (Math.abs(x) - st.x0) / (st.b - st.x0), a = at(Math.max(0, Math.min(1, f))), fr = (z - a.le) / a.c, base = ny < -0.25 ? pt.bot : pt.top; return fr > 0.7 && (!sp.jet || pl.era <= 4) ? shade(base, 0.86) : base; }); tag(body, 'surf', suv);
    }
    const flash = pl.nation === 'fra' ? [0x0055a4, 0xffffff, 0xef4135] : pl.nation === 'uk' ? (pl.era <= 2 ? [0x1c2f6e, 0xffffff, 0xc8102e] : pl.era === 3 ? [0xc8102e, 0xffffff, 0x1c2f6e] : [0xc8102e, 0x1c2f6e]) : null;
    rule(e0.tailConfiguration === 't_tail', 't_tail: tailplane on top of the fin');
    rule(e0.horizontalTail === 'fin_mid', 'cruciform: tailplane part-way up the fin');
    rule(e0.horizontalTail === 'none', 'tailless: no horizontal tail');
    rule(e0.tailConfiguration === 'twin_endplate', 'twin_endplate: fins on the tailplane tips');
    rule(e0.tailConfiguration === 'twin_boom', 'twin_boom: fins on the booms, tailplane between them');
    rule(e0.tailConfiguration === 'twin_vertical_straight', 'twin_vertical_straight: two upright fins');
    rule(e0.tailConfiguration === 'twin_vertical_canted', 'twin_vertical_canted: fins tilted outwards by ' + e0.finCantDeg + ' deg');
    sp.fins.forEach((fn, i) => {
      // built along +X (height) with the chord along Z, then stood up (and canted) about the Z axis
      const h = fn.h, at = f => ({ x: f * h, le: fn.zLE + fn.sw * f * h, c: fn.rc * (1 - f) + fn.tc * f, y: 0 });
      const g = loftSurface(surfStations({ t: fn.t }, at, { square: false }), 10, 'fin');
      g.rotateZ(Math.PI / 2 + fn.cant);
      body.add(g, (x, y, z) => { const f = Math.max(0, Math.min(1, (y - fn.base) / h)), a = at(f); return (z - a.le) / a.c > 0.72 && !sp.jet ? shade(pt.top, 0.86) : pt.top; }, [fn.x, fn.base, 0]);
      tag(body, 'surf', (x, y, z) => { const a = at(Math.max(0, Math.min(1, (y - fn.base) / h))); return [y - fn.base, (z - a.le) / a.c, a.c]; });
      if (flash && sp.fins.length === 1) { const f = 0.45, a = at(f), half = naca(0.5, fn.t) * a.c + 0.012, w = a.c * 0.12;
        flash.forEach((c, k) => { for (const sd of [-1, 1]) mkB.add(box(0.01, h * 0.42, w), c, [sd * half, fn.base + h * f, a.le + a.c * 0.35 + (k - (flash.length - 1) / 2) * w]); }); }
    });
    if (rule(sp.dorsal && sp.fins.length === 1, 'dorsal fin fillet')) { const fn = sp.fins[0], dl = L * 0.18, zA = fn.zLE - dl * 0.85;
      const g = loftSurface([{ x: 0, le: zA, c: dl + fn.rc * 0.2, y: 0, t: 0.06 }, { x: fn.h * 0.25, le: fn.zLE + fn.sw * fn.h * 0.2, c: fn.rc * 0.15, y: 0, t: 0.06 }], 6, 'dorsal'); g.rotateZ(Math.PI / 2); body.add(g, pt.top, [0, sp.topAt(fn.zLE) - 0.12, 0]); }
    if (rule(sp.ventral, 'ventral fin')) { const v = sp.ventral, g = loftSurface([{ x: 0, le: v.zLE, c: v.rc, y: 0, t: 0.06 }, { x: v.h, le: v.zLE + v.rc * 0.45, c: v.rc * 0.45, y: 0, t: 0.06 }], 6, 'ventral fin'); g.rotateZ(-Math.PI / 2); body.add(g, pt.bot, [0, sp.botAt(v.zLE + v.rc / 2) + 0.1, 0]); }

    // ---------------- guns
    for (const [gid, n, mount] of pl.guns) {
      const cal = GUNS[gid].cal / 1000, len = 0.35 + cal * 22;
      for (let i = 0; i < n; i++) {
        if (mount === 'wing') { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2), x = s * (sp.wing.x0 + S * (0.09 + k * 0.03)), w = wingGunAt(x);
          (s < 0 ? wl : wr).add(zcyl(cal * 2, cal * 2.6, len, 6), dark, [x, w.y, w.le - len / 2 + 0.1]); }
        else if (mount === 'nose' && !sp.jet) body.add(zcyl(cal * 2, cal * 2, len, 6), dark, [(i - (n - 1) / 2) * 0.15, sp.at(z0).y + (pl.eng >= 2 ? R * 0.1 : 0), z0 - len / 2 + 0.25]);
        else if (mount === 'nose' && sp.jet && !sp.extra.gau8) { const z = z0 + L * 0.2 + (i >> 1) * 0.25, s = i % 2 ? 1 : -1, y = sp.at(z).y - sp.at(z).h * 0.35, x = deck ? sp.sideAt(z, y) : surfX(z, y) - 0.02; body.add(zcyl(cal * 1.8, cal * 2.6, 0.4, 6), dark, [s * x, y, z]); }
        else if (mount === 'sync') { const z = z0 + L * 0.2, x = (i - (n - 1) / 2) * 0.22; body.add(zcyl(cal * 2.2, cal * 2.2, len + 0.3, 6), dark, [x, sp.topAt(z, x) + cal * 2, z]); }
      }
    }
    // ---------------- defensive turrets
    for (const t of pl.turrets) { const tp = turretPos(pl, t[2]), r = Math.max(0.35, R * 0.35);
      glassB.add(sphere(1, 12, 8), 0xffffff, [tp.x, tp.y, tp.z], null, [r, r, r]);
      for (let k = 0; k < t[1]; k++) body.add(zcyl(0.02, 0.025, 0.9, 5), dark, [tp.x + (k - (t[1] - 1) / 2) * 0.12, tp.y, tp.z + (t[2] === 'nose' ? -1 : 1) * (r + 0.4)]); }

    // ---------------- markings: wrapped onto the skin like decals (every vertex moved onto the real surface, keeping its
    // layer offset). Each marking is placed where it fits whole: on the wing within the chord and span, on the fuselage in a
    // clear stretch of the side (behind the wing and ahead of the tail, else ahead of the wing) and no taller than the body
    const top = sp.wings[sp.wings.length - 1];
    const extent = axis => { const b = new Builder(); insignia(b, mark, 1, [0, 0, 0], axis, pl.era); const g = b.build(); g.computeBoundingBox(); const bb = g.boundingBox;
      return axis === 'y' ? { ex: Math.max(-bb.min.x, bb.max.x), ez: Math.max(-bb.min.z, bb.max.z) } : { ez: Math.max(-bb.min.z, bb.max.z), ey: Math.max(-bb.min.y, bb.max.y) }; };
    { const E = extent('y'), f0 = Math.min(0.75, Math.max(0.3, (S * 0.32 - top.x0) / (top.b - top.x0))), w = sp.wingAt(f0, top);
      const fits = (size, cx, cz) => { for (let k = 0; k <= 8; k++) { const x = cx + (k / 4 - 1) * E.ex * size; if (x < top.x0 + 0.1 || x > top.b - 0.15) return false;
          const a = sp.wingAt(Math.max(0, Math.min(1, (x - top.x0) / (top.b - top.x0))), top); if (cz - E.ez * size < a.le + a.c * 0.06 || cz + E.ez * size > a.le + a.c * 0.92) return false; } return true; };
      let size = Math.min(S * 0.12, 1.8, w.c * 0.8), cx = w.x, cz = w.le + w.c * 0.45;
      for (let n = 0; n < 30 && !fits(size, cx, cz); n++) { size *= 0.93; cx = Math.max(top.x0 + 0.1 + E.ex * size, Math.min(top.b - 0.15 - E.ex * size, cx)); const a = sp.wingAt(Math.max(0, Math.min(1, (cx - top.x0) / (top.b - top.x0))), top); cz = a.le + a.c * 0.47; }
      if (size > 0.2 && fits(size, cx, cz)) for (const s of [-1, 1]) { const b = new Builder(); insignia(b, mark, size, [0, 0, 0], 'y', pl.era); const g = b.build(), pa = g.attributes.position;
        for (let k = 0; k < pa.count; k++) { const x = s * cx + pa.getX(k), z = cz + pa.getZ(k), a = sp.wingAt(Math.max(0, Math.min(1, (Math.abs(x) - top.x0) / (top.b - top.x0))), top);
          pa.setXYZ(k, x, a.y + naca(Math.max(0, Math.min(1, (z - a.le) / a.c)), top.t) * a.c + 0.004 + pa.getY(k), z); } // on the upper aerofoil surface
        (s < 0 ? mkL : mkR).parts.push({ g, color: 0xffffff, preColored: true }); } }
    { const E = extent('x'), zEnd = (chined ? sp.rearTaper.z0 : Math.min(L / 2, zMain)) - 0.3, w0 = sp.wingAt(0);
      // stretches of the side covered by something: the wing root (and LERX / strakes), the canopy, intake mouths, the tailplane root, canards
      const busy = [[cp.z - cp.len * 0.6, cp.z + cp.len * 0.6]]; if (!chined) busy.push([w0.le - (sp.extra.lerx ? L * 0.2 : 0.3), w0.le + w0.c + 0.3]); // stealth: the wing joins at the chine, the wall below it stays clear
      if (sp.stab && e0.horizontalTail === 'fuselage') busy.push([sp.stab.zLE - 0.3, sp.stab.zLE + sp.stab.rc + 0.3]);
      if (sp.intakeZ !== null && e0.intakeProfile !== 'nose_cone' && !chined) busy.push([sp.intakeZ - 0.4, sp.intakeZ + 0.8]);
      if (sp.extra.canards) busy.push([cp.z + sp.extra.canards.offset - 1.2, cp.z + sp.extra.canards.offset + 1.2]);
      const free = []; let z = z0 + L * 0.12; for (const [a, b] of busy.slice().sort((p, q) => p[0] - q[0])) { if (a > z) free.push([z, Math.min(a, zEnd)]); z = Math.max(z, b); } if (zEnd > z) free.push([z, zEnd]);
      const hAt = zz => deck ? sp.tunnel.at(zz).h * 0.75 : chined ? (sp.chine.hex(sp.at(zz)).cy - (sp.at(zz).y - sp.at(zz).h)) * 0.5 : sp.at(zz).h, yAt = zz => deck ? sp.tunnel.at(zz).y : chined ? (sp.chine.hex(sp.at(zz)).cy + sp.at(zz).y - sp.at(zz).h) / 2 : sp.at(zz).y; // stealth: on the flat wall below the chine
      // the best stretch: room for the whole marking at the largest size, preferring behind the wing
      let best = null;
      for (const [a, b] of free) { if (b - a < 0.6) continue; const zc = (a + b) / 2, sz = Math.min((b - a) / (2 * E.ez) * 0.92, Math.min(hAt(zc - (b - a) * 0.25), hAt(zc), hAt(zc + (b - a) * 0.25)) * 2 * 0.82 / (2 * E.ey), 1.5);
        const score = sz * (zc > w0.le ? 1.15 : 1); if (!best || score > best.score) best = { zc, sz, score }; }
      if (best && best.sz > 0.22) { let size = best.sz; const zc = best.zc, y = yAt(zc);
        // shrink until every part of the marking lies on the skin (nothing past the top or bottom of the body)
        for (let n = 0; n < 12; n++) { let ok = true; for (const dz of [-1, 0, 1]) for (const dy of [-1, 1]) if (surfX(zc + dz * E.ez * size, y + dy * E.ey * size) < Math.max(0.12, (deck ? sp.tunnel.at(zc).w : sp.at(zc).w) * 0.35)) ok = false; if (ok) break; size *= 0.9; }
        const N = 6, gz = k => zc - E.ez * size * 1.05 + E.ez * size * 2.1 * k / N, gy = k => y - E.ey * size * 1.05 + E.ey * size * 2.1 * k / N, grid = [];
        for (let a = 0; a <= N; a++) { grid.push([]); for (let c = 0; c <= N; c++) grid[a].push(surfX(gz(a), gy(c))); }
        const skinX = (zz, yy) => { const u = Math.max(0, Math.min(N - 1e-6, (zz - gz(0)) / (gz(1) - gz(0)))), v = Math.max(0, Math.min(N - 1e-6, (yy - gy(0)) / (gy(1) - gy(0)))), a = Math.floor(u), c = Math.floor(v), fu = u - a, fv = v - c;
          return (grid[a][c] * (1 - fu) + grid[a + 1][c] * fu) * (1 - fv) + (grid[a][c + 1] * (1 - fu) + grid[a + 1][c + 1] * fu) * fv; };
        if (size > 0.22) for (const sd of [-1, 1]) { const b = new Builder(); insignia(b, mark, size, [sd * 1e-4, y, zc], 'x', pl.era); const g = b.build(), pa = g.attributes.position;
          for (let k = 0; k < pa.count; k++) pa.setX(k, sd * (skinX(pa.getZ(k), pa.getY(k)) + 0.006 + Math.abs(pa.getX(k))));
          g.computeBoundingSphere(); mkB.parts.push({ g, color: 0xffffff, preColored: true }); } } }

    // ---------------- assemble
    const grp = { props, glows };
    // ================= STAGE 4: the skin shader (panel lines, rivets, panel tones, camouflage) on the airframe =================
    const skin = { top: pt.top, bot: pt.bot }, skinM = Models.skinMat(pl, pt);
    grp.body = new THREE.Mesh(body.build(skin), skinM);
    grp.glass = new THREE.Mesh(glassB.build(), mat('glass'));
    if (pilotB.parts.length) { const pm = new THREE.Mesh(pilotB.build(), mat('vc')); pm.name = 'pilot'; grp.glass.add(pm); }
    if (ckB.parts.length) grp.glass.add(new THREE.Mesh(ckB.build(), mat('vc')));
    grp.wingL = new THREE.Mesh(wl.build(skin), skinM); grp.wingR = new THREE.Mesh(wr.build(skin), skinM);
    // ---- flaps: a panel under the trailing edge of the inner wing (0.74 chord to the trailing edge), hinged at its front
    // edge; it lies inside the wing when up and swings down when lowered (split / plain flap). Built in hinge-local
    // coordinates and rotated about the hinge line (inner to outer hinge point) by the aircraft each frame
    const hingePanel = (pts, color, name, hinge) => { const b = new Builder(); b.add(pts.geo, color); const m = new THREE.Mesh(b.build(skin), skinM);
      m.position.set(...pts.at); m.name = name; m.userData = { hinge }; return m; };
    if (pl.flaps && pl.flaps !== 'none' && !sp.bi) { const g = sp.wings[0], f0 = 0.1, f1 = sp.wing.tc > sp.wing.rc * 0.15 ? 0.5 : 0.36;
      const st = [f0, (f0 + f1) / 2, f1].map(f => { const w = sp.wingAt(f, g); return { x: w.x, le: w.le + w.c * 0.74, c: w.c * 0.25, y: w.y - naca(0.86, g.t) * w.c * 0.55, t: 0.06 }; });
      const a = new V(st[0].x, st[0].y, st[0].le), b2 = new V(st[2].x, st[2].y, st[2].le), axis = b2.clone().sub(a).normalize();
      const geo = loftSurface(st, 6, 'flap'); geo.translate(-a.x, -a.y, -a.z);
      for (const [wing, s] of [[grp.wingR, 1], [grp.wingL, -1]]) { const gg = s > 0 ? geo : mirrorX(geo);
        const m = hingePanel({ geo: gg, at: [s * a.x, a.y, a.z] }, camo, 'flap', { kind: 'flap', axis: [s * axis.x, axis.y, axis.z], sign: s }); wing.add(m); }
      rule(true, 'flap panels hinged at 74% chord, ' + Math.round(f0 * 100) + '-' + Math.round(f1 * 100) + '% semi-span, animated'); }
    // ---- air brakes: jets - side panels on the rear fuselage hinged at their front edge (a dorsal panel on the twin-tail deck
    // jets, F-15 / Su-27 style); dive bombers - perforated plates under the wings that swing down 80-90 deg
    grp.brakes = [];
    if (pl.airbrake) {
      if (!sp.jet) { const g = sp.wings[0]; for (const f of [0.28, 0.48]) { const w = sp.wingAt(f, g), len = Math.min(1.2, w.c * 0.45), wid = Math.max(0.6, (g.b - g.x0) * 0.18);
          const geo = box(wid, 0.03, len); geo.translate(0, 0, len / 2);
          for (const [wing, s] of [[grp.wingR, 1], [grp.wingL, -1]]) wing.add(hingePanel({ geo, at: [s * w.x, w.y - naca(0.2, g.t) * w.c - 0.03, w.le + w.c * 0.2] }, shade(pt.bot, 0.8), 'divebrake', { kind: 'brake', axis: [1, 0, 0], sign: -1, max: 85 })); }
        rule(true, 'dive brakes under the wings, animated'); }
      else if (deck) { const z = sp.wing.rootZ + sp.wing.rc * 0.15, len = Math.min(2.6, L * 0.13), wid = Math.min(1.4, sp.at(z).w * 1.4), y = sp.topAt(z) + 0.01;
        const geo = box(wid, 0.05, len); geo.translate(0, 0.025, len / 2); body.parts.length; grp.brakes.push(hingePanel({ geo, at: [0, y, z] }, pt.top, 'speedbrake', { kind: 'brake', axis: [1, 0, 0], sign: 1, max: 45 }));
        rule(true, 'dorsal speed brake behind the cockpit, animated'); }
      else { const z = z0 + L * 0.62, y = sp.at(z).y, len = Math.min(1.6, L * 0.09), hh = Math.min(0.7, sp.at(z).h * 0.8), x = surfX(z, y);
        for (const s of [-1, 1]) { const geo = box(0.04, hh, len); geo.translate(0, 0, len / 2);
          grp.brakes.push(hingePanel({ geo, at: [s * (x + 0.02), y, z] }, pt.top, 'speedbrake', { kind: 'brake', axis: [0, 1, 0], sign: -s, max: 55 })); }
        rule(true, 'side speed brakes on the rear fuselage, animated'); }
      for (const m of grp.brakes) grp.body.add(m);
    }
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
    Airframe.anomalies = Airframe.anomalies || {}; Airframe.anomalies[pl.id] = sp.notes.concat(applied);
    return grp;
  }
  // merge non-indexed, vertex-coloured geometries
  function merge(geos) {
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeBoundingSphere(); return g;
  }
  Models.primitives = { loftBody, latheRing, loftSurface, loftPrism, loftUnion, lipRing, slotRing, mirrorX, orient, naca };
})();
