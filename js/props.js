// ============================================================================
// Props: the buildings, vehicles, ships and equipment that make up the ground targets (bases3d.js) and the tanks that
// drive around (vehicles.js), shaped after the real thing: gabled and sawtooth roofs, window bands, lofted ship hulls,
// tanks with sloped armour, road wheels and a gun, era by era. Every prop is built in its own local frame (front = -Z,
// up = +Y) and placed with at(b, x, z, rot), which returns an add(geometry, colour, pos, rot, scale) for that frame.
// ============================================================================
const Props = (() => {
  const V = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion;
  const box = (w, h, d, sx, sy, sz) => new THREE.BoxGeometry(w, h, d, sx || 1, sy || 1, sz || 1);
  const cyl = (rt, rb, h, s, open, t0, tl) => new THREE.CylinderGeometry(rt, rb, h, s || 10, 1, !!open, t0 || 0, tl == null ? Math.PI * 2 : tl);
  const zcyl = (rNose, rTail, len, s) => { const g = cyl(rTail, rNose, len, s); g.rotateX(Math.PI / 2); return g; };
  const xcyl = (r, len, s) => { const g = cyl(r, r, len, s); g.rotateZ(Math.PI / 2); return g; };
  // a side profile [[z, y], ...] (z along the length, front = -z) extruded across the width (x)
  function prof(pts, width) {
    const s = new THREE.Shape(); pts.forEach(([u, v], i) => i ? s.lineTo(u, v) : s.moveTo(u, v)); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false }); g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2); return g;
  }
  // a cross-section [[x, y], ...] extruded along the length (z)
  function sect(pts, len) {
    const s = new THREE.Shape(); pts.forEach(([u, v], i) => i ? s.lineTo(u, v) : s.moveTo(u, v)); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); return g;
  }
  const gable = (w, rh, len) => sect([[-w / 2, 0], [w / 2, 0], [0, rh]], len);
  // a half-cylinder arch standing on the ground, its axis along z (Nissen huts, hangars, aircraft shelters)
  function arch(r, len, s) { const g = cyl(r, r, len, s || 14, false, -Math.PI / 2, Math.PI); g.rotateX(-Math.PI / 2); return g; }
  // the window bands of a w x h x d block: one strip of glass per floor on each of the four walls, just proud of them
  function windows(w, h, d, floorH) {
    const fl = Math.max(1, Math.min(8, Math.round(h / (floorH || 3.4)))), fh = h / fl, P = [], N = []; // (tall blocks: at most 8 bands)
    const quad = (cx, cz, nx, nz, len, y0, y1) => { const tx = nz, tz = -nx, e = 0.04, ax = cx + nx * e, az = cz + nz * e, hx = tx * len / 2, hz = tz * len / 2;
      const v = [[ax - hx, y0, az - hz], [ax + hx, y0, az + hz], [ax + hx, y1, az + hz], [ax - hx, y1, az - hz]];
      for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...v[k]); N.push(nx, 0, nz); } };
    for (let f = 0; f < fl; f++) { const y0 = f * fh + fh * 0.32, y1 = f * fh + fh * 0.78;
      quad(0, d / 2, 0, 1, w * 0.86, y0, y1); quad(0, -d / 2, 0, -1, w * 0.86, y0, y1); quad(w / 2, 0, 1, 0, d * 0.86, y0, y1); quad(-w / 2, 0, -1, 0, d * 0.86, y0, y1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return g;
  }
  function block(a, w, h, d, wall, win, floorH) { const g = box(w, h, d); g.translate(0, h / 2, 0); a(g, wall); a(windows(w, h, d, floorH), win); }

  // place a prop: geometry in the prop's frame -> the builder, standing at (x, y0, z) turned `rot` about the vertical
  function at(b, x, z, rot, y0) {
    const W = new M4().makeRotationY(rot || 0).setPosition(x, y0 || 0, z);
    return (geo, col, p, r, s) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(new M4().compose(new V(...(p || [0, 0, 0])), new Q().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), new V(...(s || [1, 1, 1]))));
      g.applyMatrix4(W);
      if (typeof col === 'function') { const f = col; b.add(g, (gx, gy, gz, ny, nz) => f(gx, gy - (y0 || 0), gz, ny, nz)); } else b.add(g, col);
    };
  }

  // ---------------------------------------------------------------- buildings
  // a house / office: walls with windows and a gabled (or flat, for big modern blocks) roof
  function house(b, x, z, rot, w, d, h, o = {}) {
    const a = at(b, x, z, rot), wall = o.wall || 0x9a8e7c, roof = o.roof || 0x6a3a2a;
    block(a, w, h, d, wall, o.win || 0x3a4048, o.floorH);
    if (o.flat) { a(box(w + 0.4, 0.5, d + 0.4), o.roofCol || 0x55524c, [0, h + 0.25, 0]); return; }
    a(gable(w + 0.8, w * 0.38, d + 0.8), roof, [0, h, 0]);
    if (o.chimney !== false && w > 6) a(box(0.9, w * 0.4, 0.9), 0x6a4a3a, [w * 0.22, h + w * 0.2, d * 0.25]);
  }
  // barracks hut (wooden, gabled), Nissen hut (corrugated half-cylinder), or modern concrete barracks block
  function hut(b, x, z, rot, era) {
    const a = at(b, x, z, rot);
    if (era <= 2) { a(box(6, 2.6, 20), 0x7a6a50, [0, 1.3, 0]); a(gable(6.6, 2.2, 20.6), 0x4a4038, [0, 2.6, 0]); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) a(box(0.05, 0.8, 1), 0x2a2a28, [s * 3.02, 1.6, -7.5 + i * 5]); return; }
    if (era <= 4) { a(arch(3.5, 18, 12), 0x6e7066); for (const e of [-1, 1]) a(box(7, 3.4, 0.2), 0x5a5444, [0, 1.7, e * 9]); a(box(1.2, 2, 0.1), 0x3a3028, [0, 1, -9.1]); return; }
    house(b, x, z, rot, 12, 36, 7, { wall: 0xb4b0a4, win: 0x3a4450, flat: true, floorH: 3.5 });
  }
  function tent(b, x, z, rot, s) { const a = at(b, x, z, rot); a(gable(4.4 * s, 2.6 * s, 5.5 * s), [0x6b6440, 0x5b5430]); a(box(0.08, 3 * s, 0.08), 0x4a3a2a, [0, 1.5 * s, -2.8 * s]); }
  // factory hall: brick walls with tall windows and a sawtooth ("north-light") roof
  function hall(b, x, z, rot, w, d, h) {
    const a = at(b, x, z, rot); block(a, w, h, d, 0x8a4e3c, 0x30363c, h / 2);
    const n = Math.max(2, Math.round(d / 9)), step = d / n;
    for (let i = 0; i < n; i++) { const z0 = -d / 2 + i * step; a(prof([[z0, 0], [z0 + step, 0], [z0, step * 0.45]], w), 0x606468, [0, h, 0]); a(box(w * 0.98, step * 0.42, 0.1), 0x8fa6b8, [0, h + step * 0.22, z0 + 0.06]); }
  }
  function chimney(b, x, z, h) { const a = at(b, x, z, 0); a(cyl(h * 0.035, h * 0.06, h, 12), 0x7b4a3a, [0, h / 2, 0]); for (const f of [0.55, 0.9]) a(cyl(h * 0.045, h * 0.045, 0.8, 12), 0x5a3020, [0, h * f, 0]); a(cyl(h * 0.04, h * 0.036, 1.2, 12), 0x2a2220, [0, h + 0.4, 0]); }
  function waterTower(b, x, z) { const a = at(b, x, z, 0); for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) a(cyl(0.25, 0.3, 22, 6), 0x5a5a58, [dx, 11, dz], [dz * 0.02, 0, -dx * 0.02]); a(cyl(5, 5, 6, 16), 0x8a8a80, [0, 25, 0]); a(cyl(0.5, 5.2, 2, 16), 0x6a6a64, [0, 29, 0]); }
  function gasholder(b, x, z, r) { const a = at(b, x, z, 0); a(cyl(r, r, r * 0.9, 20), 0x6a7468, [0, r * 0.45, 0]); a(cyl(r * 0.9, r, 1, 20), 0x5a645a, [0, r * 0.9 + 0.5, 0]); for (let i = 0; i < 10; i++) { const t = i / 10 * Math.PI * 2; a(cyl(0.3, 0.3, r * 1.15, 5), 0x3e423e, [Math.cos(t) * r * 1.03, r * 0.57, Math.sin(t) * r * 1.03]); } }
  function storage(b, x, z, r) { const a = at(b, x, z, 0); a(cyl(r, r, r * 1.1, 16), 0xb8b8b0, [0, r * 0.55, 0]); a(cyl(r * 0.3, r * 1.02, r * 0.25, 16), 0x9a9a94, [0, r * 1.22, 0]); }
  function tower(b, x, z, rot, era) { // airfield control tower: a block with the glazed cab on top
    const h = era >= 5 ? 18 : 9, a = at(b, x, z, rot);
    if (era >= 5) { a(cyl(2.4, 2.8, h, 10), 0xb8b4aa, [0, h / 2, 0]); a(cyl(4.6, 3.6, 3.2, 10), 0x7fa0b8, [0, h + 1.6, 0]); a(cyl(4.9, 4.9, 0.6, 10), 0x55524c, [0, h + 3.5, 0]); a(cyl(0.1, 0.1, 4, 4), 0x333333, [0, h + 5.5, 0]); }
    else { house(b, x, z, rot, 10, 10, h, { wall: 0xb0a890, flat: true, floorH: 3 }); a(box(7, 3, 7), 0x8fa8c0, [0, h + 1.9, 0]); a(box(8, 0.4, 8), 0x55524c, [0, h + 3.6, 0]); }
  }
  // hardened aircraft shelter (Cold War jets): a low concrete arch with a flat door at the front
  function shelter(b, x, z, rot) { const a = at(b, x, z, rot); a(arch(11, 32, 14), 0x8a8a80, [0, 0, 0], null, [1, 0.72, 1]); a(box(20, 8, 0.8), 0x6e6e66, [0, 4, -16]); }
  function watchtower(b, x, z) { const a = at(b, x, z, 0); for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) a(box(0.25, 8, 0.25), 0x5a4a38, [dx, 4, dz]); a(box(3.4, 2, 3.4), 0x6a5a44, [0, 9, 0]); a(gable(4, 1.2, 4), 0x4a3a2a, [0, 10, 0]); }

  // ---------------------------------------------------------------- vehicles
  const OLIVE = era => era >= 6 ? 0x6b6e4a : era >= 4 ? 0x58603e : 0x4f5638;
  // a tank of its era: WW1 rhomboid; then a hull with a sloped glacis, tracks over road wheels, a turret and the gun
  function tankBody(add, era, tc) {
    const ol = OLIVE(era), dk = 0x262626;
    if (era === 1) { // Mark IV-style rhomboid with side sponsons
      add(prof([[-4.2, 0.2], [-3.4, 2.6], [3.2, 2.6], [4.0, 0.9], [3.2, 0.2]], 3.6), ol);
      for (const s of [-1, 1]) { add(prof([[-4.4, 0.1], [-3.5, 2.7], [3.3, 2.7], [4.2, 0.9], [3.3, 0.1]], 0.6), dk, [s * 2.05, 0, 0]); add(box(0.9, 1.1, 1.8), ol, [s * 2.6, 1.4, -0.4]); add(zcyl(0.07, 0.08, 1.4, 6), dk, [s * 3.0, 1.5, -1.5]); }
      add(box(1.4, 0.3, 1.4), tc, [0, 2.75, 0]); return;
    }
    const L = era >= 5 ? 9.0 : era >= 3 ? 6.3 : 4.6, W = era >= 5 ? 3.5 : era >= 3 ? 2.6 : 1.9, H = era >= 5 ? 1.2 : 1.3, gun = era >= 5 ? 5.6 : era >= 3 ? 3.6 : 1.8, tr = W * 0.24;
    // hull: glacis at the front (-z), sloped rear deck
    add(prof([[-L / 2, 0.75], [-L / 2 + 1.3, 0.75 + H], [L / 2 - 0.4, 0.75 + H], [L / 2, 0.75 + H * 0.5], [L / 2 - 0.2, 0.55], [-L / 2 + 0.5, 0.45]], W - tr * 2), ol);
    for (const s of [-1, 1]) {
      add(prof([[-L / 2 - 0.1, 0.6], [-L / 2 + 0.6, 1.25], [L / 2 - 0.3, 1.25], [L / 2 + 0.1, 0.6], [L / 2 - 0.4, 0.05], [-L / 2 + 0.5, 0.05]], tr), dk, [s * (W / 2 - tr / 2), 0, 0]);
      const n = era >= 5 ? 7 : 5; for (let i = 0; i < n; i++) { const wz = -L / 2 + 0.9 + i * (L - 1.8) / (n - 1); add(xcyl(0.38, 0.12, 8), 0x4a4a44, [s * (W / 2 + 0.04), 0.5, wz]); add(xcyl(0.12, 0.16, 6), 0x2e2e2a, [s * (W / 2 + 0.1), 0.5, wz]); }
      for (const e of [-1, 1]) add(xcyl(0.3, 0.12, 10), 0x3a3a36, [s * (W / 2 + 0.04), 0.95, e * (L / 2 - 0.15)]); // sprocket and idler
      add(box(0.12, 0.15, L * 0.9), ol, [s * (W / 2 - tr / 2), H + 0.8, 0]); // track guard
    }
    // turret: cast and rounded in WW2, flat and angular on modern tanks
    const tw = W * 0.62, tl = L * 0.36, th = era >= 5 ? 0.8 : 0.95, ty = 0.75 + H;
    if (era >= 6) add(prof([[-tl / 2 - 0.4, 0], [-tl / 2, th], [tl / 2 + 0.3, th], [tl / 2 + 0.6, th * 0.3], [tl / 2 + 0.4, 0]], tw), ol, [0, ty, -0.2]);
    else { const s = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); add(s, ol, [0, ty, -0.1], null, [tw / 2, th * 1.15, tl / 2]); }
    add(box(tw * 0.35, th * 0.6, 0.5), ol, [0, ty + th * 0.45, -tl / 2 - 0.15]); // mantlet
    add(zcyl(era >= 5 ? 0.09 : 0.07, era >= 5 ? 0.13 : 0.1, gun, 8), dk, [0, ty + th * 0.45, -tl / 2 - gun / 2 - 0.2]);
    if (era >= 5) add(zcyl(0.16, 0.16, 0.9, 8), dk, [0, ty + th * 0.45, -tl / 2 - gun * 0.55]); // fume extractor
    add(cyl(0.38, 0.42, 0.3, 10), ol, [tw * 0.18, ty + th + 0.1, 0.2]); // commander's cupola
    add(box(tw * 0.7, 0.06, 0.5), tc, [0, ty + th + 0.03, 0.5]);
  }
  function tankAt(b, x, z, rot, era, tc) { tankBody(at(b, x, z, rot), era, tc || 0x888888); }
  function truck(b, x, z, rot, era) {
    const a = at(b, x, z, rot), ol = OLIVE(era), dk = 0x222222;
    a(box(2.3, 1.7, 2.0), ol, [0, 1.75, -2.6]); a(box(2.2, 0.75, 0.08), 0x4a5a68, [0, 2.15, -3.62]); a(box(2.0, 1.0, 1.2), ol, [0, 1.3, -4.0]); // cab, windscreen, bonnet
    a(box(2.4, 0.5, 4.4), ol, [0, 1.2, 0.9]); const tilt = cyl(1.2, 1.2, 4.3, 10, false, -Math.PI / 2, Math.PI); tilt.rotateX(Math.PI / 2); tilt.rotateZ(Math.PI / 2); a(tilt, 0x5e5a40, [0, 1.6, 0.9], null, [1, 1.05, 1]);
    for (const zz of [-3.4, 0.2, 1.8]) for (const s of [-1, 1]) a(xcyl(0.5, 0.35, 10), dk, [s * 1.05, 0.5, zz]);
  }
  // a parked aircraft (fighter: straight wing before the jet age, swept after; big for bombers)
  function parkedPlane(b, x, z, rot, era, s) {
    const a = at(b, x, z, rot, 0), c = era >= 5 ? 0x7a8088 : 0x55604a, L = 10 * s;
    a(zcyl(0.5 * s, 0.3 * s, L, 8), c, [0, 1.6 * s, 0]);
    if (era >= 5) { a(prof([[-0.5 * s, 0], [2.6 * s, 0], [2.6 * s, 0.25], [1.4 * s, 0.25]], 9 * s), c, [0, 1.5 * s, 0.3 * s]); }
    else a(box(11 * s, 0.25, 1.9 * s), c, [0, 1.5 * s, -0.8 * s]);
    a(box(4 * s, 0.2, 1.1 * s), c, [0, 1.7 * s, L * 0.42]); a(box(0.15, 1.6 * s, 1.3 * s), c, [0, 2.4 * s, L * 0.42]);
    a(box(0.4 * s, 0.4 * s, 1.2 * s), 0x6a8aa8, [0, 2.1 * s, -L * 0.15]);
  }

  // ---------------------------------------------------------------- ships
  // a lofted hull: fine entry at the bow, parallel middle body, rounded or transom stern, sheer rising to the bow;
  // red below the waterline, a black boot-topping, grey topsides, a deck (wooden on older warships)
  function hull(b, L, B, F, T, o = {}) {
    const n = 26, sec = t => {
      const hb = B / 2 * (t < 0.32 ? Math.pow(Math.sin(t / 0.32 * Math.PI / 2), 0.85) : t > 0.82 ? 1 - Math.pow((t - 0.82) / 0.18, 2) * (o.transom ? 0.25 : 0.55) : 1);
      const sheer = F * (1 + (t < 0.35 ? 0.35 * Math.pow(1 - t / 0.35, 2) : 0) + (t > 0.9 ? 0.04 : 0)), keel = T * (t < 0.08 ? 0.3 + t / 0.08 * 0.7 : 1);
      return [[hb, sheer], [hb * 0.99, 0.2], [hb * 0.92, -keel * 0.45], [hb * 0.6, -keel * 0.9], [0.01, -keel]];
    };
    const P = [], idx = [], rows = [];
    for (let i = 0; i <= n; i++) { const t = i / n, z = -L / 2 + t * L, s = sec(t), row = [];
      for (let k = 0; k < s.length; k++) { row.push(P.length / 3); P.push(s[k][0], s[k][1], z); }
      for (let k = s.length - 1; k >= 0; k--) { row.push(P.length / 3); P.push(-s[k][0], s[k][1], z); }
      rows.push(row); }
    const m = rows[0].length;
    for (let i = 0; i < n; i++) for (let k = 0; k < m - 1; k++) { const a0 = rows[i][k], a1 = rows[i][k + 1], b0 = rows[i + 1][k], b1 = rows[i + 1][k + 1]; idx.push(a0, b0, a1, a1, b0, b1); }
    // the stern transom closes the sides
    const last = rows[n]; for (let k = 1; k < m - 1; k++) idx.push(last[0], last[k + 1], last[k]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
    const top = o.col || 0x5b636b, deck = o.deck || 0x7a7466;
    b.add(g, (x, y) => y < 0.1 ? 0x7a2e26 : y < 0.9 ? 0x222222 : top);
    // the deck: its own flat surface along the sheer line
    const D = [], DN = [];
    for (let i = 0; i < n; i++) { const p = k => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]], a0 = p(rows[i][0]), a1 = p(rows[i][m - 1]), b0 = p(rows[i + 1][0]), b1 = p(rows[i + 1][m - 1]);
      for (const v of [a0, a1, b0, b0, a1, b1]) { D.push(...v); DN.push(0, 1, 0); } }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(D, 3)); dg.setAttribute('normal', new THREE.Float32BufferAttribute(DN, 3)); b.add(dg, deck);
  }
  // gun turret: a sloped-front house with its barrels
  function turret(a, z, y, r, guns, fwd, cal) {
    a(prof([[-r * 1.1, 0], [-r * 0.8, r * 0.8], [r * 0.9, r * 0.8], [r * 1.1, 0]], r * 1.8), 0x4b535b, [0, y, z], [0, fwd > 0 ? Math.PI : 0, 0]);
    for (let g = 0; g < guns; g++) a(zcyl(cal, cal * 1.3, r * 3.2, 6), 0x2e3236, [(g - (guns - 1) / 2) * r * 0.42, y + r * 0.4, z - fwd * (r * 1.1 + r * 1.6)]);
  }
  function warship(b, kind, k, era, tc) {
    const modern = era >= 5, carrier = kind === 'carrier';
    if (carrier) {
      const big = k === 3, L = big ? 260 : 150, B = big ? 32 : 21, F = big ? 15 : 11, a = at(b, 0, 0, 0);
      hull(b, L, B, F, big ? 10 : 7, { transom: true, deck: 0x585a54 });
      a(box(B * 1.25, 0.8, L * 0.96), 0x55564f, [0, F + 1.5, 4]); // flight deck overhang
      a(box(0.6, 0.06, L * 0.9), 0xe8e8e0, [0, F + 1.95, 4]);
      if (era >= 5) { a(box(B * 0.9, 0.05, L * 0.5), 0x4c4d47, [-B * 0.25, F + 1.93, 30], [0, 0.16, 0]); a(box(0.5, 0.07, L * 0.5), 0xe8d050, [-B * 0.25, F + 1.97, 30], [0, 0.16, 0]); } // angled deck
      const ix = B * 0.55; a(box(6, 12, 34), 0x5b636b, [ix, F + 8, 10]); a(box(5, 6, 12), 0x4b535b, [ix, F + 17, 8]); a(box(5.4, 1.6, 10), 0x6e8aa0, [ix, F + 14.6, 0]);
      a(cyl(0.4, 0.5, 14, 6), 0x333333, [ix, F + 26, 6]); a(box(6, 0.3, 0.3), 0x333333, [ix, F + 30, 6]); if (!modern) a(cyl(2.4, 2.8, 8, 10), 0x444444, [ix, F + 18, 18]);
      for (let i = 0; i < (big ? 14 : 8); i++) parkedPlane(b, (i % 2 ? 1 : -1) * B * 0.25, L * 0.42 - i * 9, Math.PI, era, 1);
      a(box(B * 0.3, 0.2, 5), tc, [0, F + 2.05, L * 0.44]);
      return { L, B, F };
    }
    const L = modern ? [0, 120, 150, 170][k] : [0, 110, 180, 250][k], B = modern ? [0, 13, 16, 18][k] : [0, 11, 18, 32][k], F = modern ? [0, 7, 8, 9][k] : [0, 6, 8, 10][k], T = B * 0.32, a = at(b, 0, 0, 0);
    hull(b, L, B, F, T, { transom: modern, deck: modern ? 0x6a6e70 : 0x9a8466 });
    if (modern) { // frigate / destroyer: gun, missile cells, a slab-sided superstructure, the mast with its radars, helicopter deck
      turret(a, -L * 0.33, F, 1.8, 1, -1, 0.12);
      a(box(B * 0.5, 0.6, L * 0.08), 0x3e4448, [0, F + 0.3, -L * 0.22]); // VLS cells
      a(prof([[-L * 0.16, 0], [-L * 0.13, F * 1.1], [L * 0.12, F * 1.1], [L * 0.14, 0]], B * 0.8), 0x6b737b, [0, F, -L * 0.02]);
      a(prof([[-4, 0], [-3, 4], [4, 4], [5, 0]], B * 0.55), 0x6e8090, [0, F * 2.1, -L * 0.1]); // bridge
      a(new THREE.ConeGeometry(2.6, 14, 4), 0x6b737b, [0, F * 2.1 + 7, -L * 0.05], [0, Math.PI / 4, 0]); a(box(4.5, 2.6, 0.3), 0x4a5056, [0, F * 2.1 + 9, -L * 0.07]);
      a(box(B * 0.3, 5, 8), 0x5b636b, [0, F + 2.5 + F * 0.9, L * 0.12]); // funnel
      a(box(B * 0.9, 0.08, L * 0.18), 0x4a4e52, [0, F + 0.04, L * 0.38]); a(box(0.3, 0.1, L * 0.16), 0xe8e8e0, [0, F + 0.1, L * 0.38]); // flight deck + line
    } else { // WW1 / WW2: turrets fore and aft (superfiring), the bridge tower, raked funnels, the mast
      const tur = k === 3 ? 4 : k === 2 ? 4 : 2, tr = [0, 1.8, 3.4, 6.2][k], guns = k === 3 ? 3 : k === 2 ? 2 : 1, cal = [0, 0.1, 0.16, 0.3][k];
      const fz = [-L * 0.34, -L * 0.34 + tr * 2.8], az = [L * 0.36, L * 0.36 - tr * 2.8];
      for (let i = 0; i < tur; i++) { const fore = i < tur / 2, j = fore ? i : i - tur / 2, z = (fore ? fz : az)[j]; turret(a, z, F + (j ? tr * 0.7 : 0), tr, guns, fore ? -1 : 1, cal); if (j) a(cyl(tr * 0.8, tr * 0.9, tr * 0.7, 10), 0x4b535b, [0, F + tr * 0.35, z]); }
      const bz = -L * 0.14, bh = F * (k === 3 ? 2.6 : 1.4);
      if (k === 3) { // battleship: a stepped tower of decks and platforms
        const tiers = 5; for (let i = 0; i < tiers; i++) { const f = 1 - i * 0.16, hh = bh / tiers; a(box(B * 0.42 * f, hh * 0.85, L * 0.11 * f), 0x6b737b, [0, F + i * hh + hh * 0.42, bz + i * 0.6]); a(box(B * 0.46 * f, 0.25, L * 0.12 * f), 0x4b535b, [0, F + (i + 1) * hh - 0.1, bz + i * 0.6]); }
      } else a(prof([[-L * 0.07, 0], [-L * 0.06, bh], [L * 0.05, bh], [L * 0.06, 0]], B * 0.42), 0x6b737b, [0, F, bz]);
      a(box(B * 0.36, F * 0.5, L * 0.04), 0x6e8090, [0, F + bh + F * 0.25, bz - L * 0.02]); // bridge with its windows
      a(box(B * 0.3, 1.2, 4), 0x4b535b, [0, F + bh + F * 0.6, bz - L * 0.01]); // rangefinder
      const nf = k === 3 ? 1 : 2; for (let i = 0; i < nf; i++) a(cyl(B * 0.07, B * 0.085, F * 1.6, 12), 0x55595e, [0, F + F * 0.8 + bh * 0.3, bz + L * 0.09 + i * B * 0.5], [0.12, 0, 0]);
      a(cyl(0.25, 0.35, F * 3.2, 6), 0x333333, [0, F + F * 1.6 + bh * 0.5, bz - 2]); a(box(B * 0.4, 0.2, 0.2), 0x333333, [0, F + F * 2.6 + bh * 0.5, bz - 2]); // mast and yard
      if (k === 1) for (const zz of [L * 0.08, L * 0.2]) a(zcyl(0.25, 0.25, 7, 6), 0x3a3e42, [0, F + 0.8, zz], [0, Math.PI / 2, 0]); // torpedo tubes
      if (k === 3) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) turret(a, -L * 0.05 + i * L * 0.07, F + 1, 1.4, 2, -1, 0.07); // secondary battery
    }
    a(box(B * 0.3, 0.2, 5), tc, [0, F + 0.5, L * 0.44]);
    return { L, B, F };
  }

  // ---------------------------------------------------------------- air defence
  // SA-2 (S-75): a single big two-stage missile on a rail launcher in its earth revetment
  function sa2(b, x, z, rot) {
    const a = at(b, x, z, rot); const berm = new THREE.TorusGeometry(9, 1.6, 6, 18); berm.rotateX(Math.PI / 2); a(berm, 0x7a6a4a, [0, 0.8, 0], null, [1, 1.2, 1]);
    const A = 0.6, on = t => [0, 3.2 + Math.sin(A) * t, -Math.cos(A) * t]; // a point t metres along the rail from its pivot
    a(box(3, 1.2, 5), 0x5b6346, [0, 0.6, 0]); a(box(1.2, 2.2, 1.2), 0x4a5038, [0, 2.1, 0]); a(box(0.6, 0.5, 9), 0x4a5038, on(1), [A, 0, 0]);
    const up = (t, h) => { const p = on(t); return [0, p[1] + Math.cos(A) * h, p[2] + Math.sin(A) * h]; }; // riding on top of the rail
    a(zcyl(0.18, 0.26, 7.4, 8), 0xd8d8d0, up(3.0, 0.6), [A, 0, 0]); a(zcyl(0.33, 0.33, 2.6, 8), 0xc8c8c0, up(-2.0, 0.65), [A, 0, 0]);
    for (let i = 0; i < 4; i++) a(box(1.8, 0.05, 0.9), 0xb0b0a8, up(-2.9, 0.65), [A, 0, i * Math.PI / 4 * 2]);
    for (let i = 0; i < 4; i++) a(box(0.9, 0.04, 0.5), 0xb0b0a8, up(5.5, 0.6), [A, 0, Math.PI / 4 + i * Math.PI / 2]);
  }
  // 2K12 Kub (SA-6): three missiles on a turntable over a tracked chassis
  function kub(b, x, z, rot, era, tc) {
    const a = at(b, x, z, rot), ol = OLIVE(era);
    a(prof([[-3.6, 0.5], [-3.0, 1.6], [3.4, 1.6], [3.6, 0.6], [3.2, 0.3], [-3.2, 0.3]], 3.0), ol); for (const s of [-1, 1]) a(box(0.5, 0.9, 7), 0x262626, [s * 1.6, 0.6, 0]);
    a(cyl(1.1, 1.2, 0.5, 10), ol, [0, 1.85, 0.5]);
    for (const dx of [-0.9, 0, 0.9]) { a(zcyl(0.17, 0.17, 5.8, 8), 0xd8d8d0, [dx, 3.5, 0.0], [0.45, 0, 0]); a(box(0.08, 0.5, 0.6), 0xb8b8b0, [dx, 2.3, 2.5], [0.45, 0, 0]); }
    a(box(2.6, 0.25, 1.2), ol, [0, 2.3, 1.4], [0.45, 0, 0]); // launch rails' cradle
    a(box(0.8, 0.05, 0.8), tc, [0, 1.62, 2.6]);
  }
  // fire-control radar on a vehicle: a cab and the dish / antenna on a mast
  function radarVan(b, x, z, rot, era) { const a = at(b, x, z, rot); a(box(2.6, 2.6, 7), OLIVE(era), [0, 1.8, 0]); a(cyl(0.2, 0.2, 2, 6), 0x333333, [0, 4, 1]); const d = new THREE.SphereGeometry(2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3); d.rotateX(Math.PI / 2); a(d, 0xb8b8b0, [0, 5.4, 1.4]); a(box(4, 1.2, 0.4), 0x6a6a64, [0, 5, -1]); }

  return { at, box, cyl, zcyl, xcyl, prof, sect, gable, arch, windows, house, hut, tent, hall, chimney, waterTower, gasholder, storage, tower, shelter, watchtower, tankBody, tankAt, truck, parkedPlane, hull, warship, sa2, kub, radarVan, OLIVE };
})();
