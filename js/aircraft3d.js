// ============================================================================
// Detailed aircraft models (replaces the simple builder in models.js).
// Generated from the database dimensions plus each type's real features
// (looks.js), in the aircraft frame (nose -Z, up +Y, right +X), as a few merged
// vertex-coloured meshes: body, left / right wing (detachable), glass + pilot,
// propellers, afterburner glow, landing gear, national markings.
// Canopies, gun barrels, masts and markings are placed by casting rays onto
// the finished surfaces, so nothing floats or sticks out.
// ============================================================================
(() => {
  const { Builder, panel, box, cyl, zcyl, paint, layout, mat, turretPos, insignia } = Models;
  const V = THREE.Vector3;
  const SHOCK_CONE = ['mig21bis', 'mig21mf', 'su7b'];
  const LERX = ['f16c', 'fa18e', 'su27', 'su35s', 'mig29', 'mig29g', 'f2a', 'su57', 'f22a', 'su34'];
  const RADIAL_IDS = ['p12', 'p26', 'p47d', 'f4u1d', 'fw190a', 'la5fn', 'a6m2', 'ki43', 'ki84', 'n1k2', 'i15', 'i16', 'gladiator', 'ki27', 'ki10', 'b5n', 'sbd', 'a1h', 'd3a', 'camel', 'dr1', 'n17', 'n17ru', 'n24ko3', 'n28', 'he51', 'hart'];
  const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };
  function lathe(L, fr, prof, segs, phi) {
    const pts = prof.map(([t, r]) => new THREE.Vector2(Math.max(0.001, r * fr), -L / 2 + t * L));
    const g = new THREE.LatheGeometry(pts, segs || 20, phi || 0); g.rotateX(Math.PI / 2); return g;
  }
  // a tube along a list of points (canopy frames, wires)
  const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(4, pts.length * 3), r, 5, false);
  function profile(pl, lay, lk) {
    if (lay.jet) {
      if (lk.has('noseint')) return [[0, 0.62], [0.02, 0.72], [0.12, 0.9], [0.3, 1], [0.8, 0.95], [0.96, 0.78], [1, 0.72]];
      if (lk.has('roundnose')) return [[0, 0.05], [0.03, 0.6], [0.1, 0.92], [0.25, 1], [0.8, 0.95], [1, 0.4]];
      if (lay.big) return [[0, 0.1], [0.04, 0.5], [0.12, 0.85], [0.25, 1], [0.8, 0.95], [1, 0.4]];
      return [[0, 0.02], [0.04, 0.22], [0.12, 0.52], [0.24, 0.82], [0.34, 1], [0.84, 0.96], [0.96, 0.8], [1, 0.74]];
    }
    if (lk.has('roundnose')) return [[0, 0.1], [0.025, 0.7], [0.08, 0.95], [0.18, 1], [0.6, 0.98], [0.84, 0.6], [0.97, 0.28], [1, 0.15]];
    if (lay.big || pl.eng >= 2) return [[0, 0.35], [0.03, 0.72], [0.09, 0.92], [0.18, 1], [0.6, 0.98], [0.84, 0.6], [0.97, 0.28], [1, 0.15]];
    if (RADIAL_IDS.includes(pl.id)) return [[0, 0.3], [0.006, 0.98], [0.03, 1.06], [0.15, 1.04], [0.22, 1], [0.46, 0.97], [0.72, 0.6], [0.93, 0.28], [1, 0.12]];
    return [[0, 0.18], [0.03, 0.55], [0.08, 0.8], [0.16, 0.92], [0.3, 1], [0.46, 0.97], [0.72, 0.6], [0.93, 0.28], [1, 0.12]];
  }
  Models.aircraft = function (pl) {
    const lay = layout(pl), lk = lay.look || look(pl), { L, S, fr, chord, tipC, sweep, wingZ, wingY, tailZ, cockZ } = lay, pt = paint(pl), sh = pl.shape;
    const camo = [pt.top, pt.bot], dark = 0x262626, metal = 0x5a5e62, frameC = shade(pt.top, 0.55), ctrl = [shade(pt.top, 0.86), shade(pt.bot, 0.9)];
    const body = new Builder(), wl = new Builder(), wr = new Builder(), glassB = new Builder(), pilotB = new Builder();
    const ww1 = pl.era === 1 || (lay.bi && pl.era <= 2);
    const ray = new THREE.Raycaster();
    // ---------------- fuselage (built first so other parts can be fitted to its surface)
    const fusGeo = lathe(L, fr, profile(pl, lay, lk), ww1 ? 4 : 20, ww1 ? Math.PI / 4 : 0);
    fusGeo.scale(ww1 ? 1.05 : sh === 'jet_tt' ? 1.12 : 0.94, sh === 'jet_tt' ? 0.88 : 1, 1);
    const fusMesh = new THREE.Mesh(fusGeo, mat('vc'));
    // paint that follows the real schemes: a darker radome on radar-nosed jets, a dark anti-glare panel ahead of the
    // windscreen on light-coloured aircraft
    const lum = (pt.top >> 16 & 255) * 0.3 + (pt.top >> 8 & 255) * 0.59 + (pt.top & 255) * 0.11;
    const radome = lay.jet && pl.era >= 5 && !lk.has('noseint'), glare = !ww1 && !lay.big && lum > 140;
    const fusPaint = (x, y, z, ny) => {
      if (radome && z < -L / 2 + L * 0.09) return shade(pt.top, 0.7);
      if (glare && ny > 0.55 && z > -L / 2 + L * (lay.jet ? 0.1 : 0.05) && z < cockZ - L * 0.04) return 0x2f3229;
      return ny < -0.25 ? pt.bot : pt.top;
    };
    body.add(fusGeo, fusPaint);
    const topAt = (z, x) => { ray.set(new V(x || 0, fr * 6, z), new V(0, -1, 0)); ray.far = fr * 12; const h = ray.intersectObject(fusMesh, false)[0]; return h ? h.point.y : fr * 0.9; };
    const sideAt = (z, y, s) => { ray.set(new V(s * fr * 3, y, z), new V(-s, 0, 0)); ray.far = fr * 6; const h = ray.intersectObject(fusMesh, false)[0]; return h ? h.point.x : s * fr; };
    if (lay.jet && pl.eng === 2 && sh !== 'jet_s2' && sh !== 'jet_bomber' && !lk.has('pods')) {
      for (const s of [-1, 1]) body.add(zcyl(fr * 0.66, fr * 0.6, L * 0.62, 16), camo, [s * fr * 0.68, -fr * 0.15, L * 0.18]);
      body.add(box(fr * (sh === 'jet_tt' ? 2.7 : 2.2), fr * 0.45, L * 0.55), camo, [0, fr * 0.05, L * 0.16]); // flat deck between the engines
    }
    // ---------------- intakes, radiators, nose details
    if (lay.jet) {
      if (lk.has('noseint')) {
        body.add(cyl(fr * 0.6, fr * 0.6, 0.06, 18), dark, [0, 0, -L / 2 + 0.02], [Math.PI / 2, 0, 0]);
        if (SHOCK_CONE.includes(pl.id)) body.add(zcyl(0.02, fr * 0.42, L * 0.08, 12), metal, [0, 0, -L / 2 - L * 0.02]);
      }
      if (lk.has('sideint') && pl.era >= 5) for (const s of [-1, 1]) {
        const iw = fr * 0.55, ih = fr * 0.95, il = L * 0.3, iz = -L * 0.1, iy = -fr * 0.12, rk = il * 0.12, x = sideAt(iz, iy, s) + s * iw * 0.3;
        const g = box(iw, ih, il), pa = g.attributes.position; // rake the mouth: the top lip sits further forward
        for (let i = 0; i < pa.count; i++) if (pa.getZ(i) < 0) pa.setZ(i, pa.getZ(i) - (pa.getY(i) / ih + 0.5) * rk);
        g.computeVertexNormals(); body.add(g, camo, [x, iy, iz]);
        const th = Math.atan2(rk, ih), face = box(iw * 0.78, ih * 0.82 / Math.cos(th), 0.03);
        body.add(face, 0x141414, [x, iy, iz - il / 2 - rk / 2 - 0.02], [-th, 0, 0]);
        body.add(box(0.03, ih * 0.9, il * 0.5), camo, [x - s * iw * 0.62, iy, iz - il * 0.2]); // boundary-layer splitter plate
      }
      else if (lk.has('sideint')) for (const s of [-1, 1]) {
        const iz = -L * 0.13, il = L * 0.24, ir = fr * 0.42, x = sideAt(iz, -fr * 0.2, s) + s * ir * 0.75;
        body.add(zcyl(ir, ir * 0.9, il, 12), camo, [x, -fr * 0.2, iz]);
        body.add(cyl(ir * 0.85, ir * 0.85, 0.04, 12), dark, [x, -fr * 0.2, iz - il / 2 - 0.01], [Math.PI / 2, 0, 0]);
      }
      if (lk.has('chinint')) { const iz = -L * 0.12, il = L * 0.22; body.add(zcyl(fr * 0.5, fr * 0.45, il, 14), camo, [0, -fr * 0.85, iz], null, [1.15, 0.8, 1]); body.add(cyl(fr * 0.45, fr * 0.45, 0.04, 14), dark, [0, -fr * 0.85, iz - il / 2 - 0.01], [Math.PI / 2, 0, 0], [1.15, 1, 0.8]); }
      if (lk.has('ventint')) for (const s of [-1, 1]) { const iz = wingZ - chord * 0.35, il = L * 0.22; body.add(box(fr * 0.75, fr * 0.65, il), camo, [s * fr * 1.25, -fr * 0.7, iz]); body.add(box(fr * 0.6, fr * 0.5, 0.04), dark, [s * fr * 1.25, -fr * 0.7, iz - il / 2 - 0.01]); }
      if (lk.has('rootint')) for (const s of [-1, 1]) body.add(box(fr * 0.5, fr * 0.22, 0.6), dark, [s * fr * 1.05, wingY, wingZ - chord * 0.5 + 0.25]);
      if (!lk.has('noseint') || SHOCK_CONE.includes(pl.id)) body.add(zcyl(0.025, 0.04, L * 0.08, 6), metal, [0, 0, -L / 2 - L * 0.04]); // pitot probe
      if (LERX.includes(pl.id)) for (const s of [-1, 1]) body.add(panel(fr * 1.3, L * 0.32, 0.4, L * 0.16, 0.08, s, 0), camo, [s * fr * 0.55, wingY + 0.02, wingZ - chord * 0.55]);
    } else {
      if (lk.has('chinrad')) body.add(zcyl(fr * 0.45, fr * 0.5, L * 0.14, 12), camo, [0, -fr * 0.95, -L * 0.36], null, [1.1, 0.9, 1]);
      if (lk.has('bellyscoop')) body.add(zcyl(fr * 0.35, fr * 0.45, L * 0.22, 12), camo, [0, -fr * 0.95, L * 0.08], null, [1, 0.85, 1]);
      if (lk.has('wingrad')) for (const s of [-1, 1]) body.add(box(fr * 0.7, fr * 0.3, chord * 0.5), camo, [s * (fr * 0.5 + S * 0.09), wingY - Math.max(0.12, chord * 0.12) * 0.5 - fr * 0.12, wingZ]);
    }
    // ---------------- cockpit
    const two = pl.crew.length > 1 && !lay.big;
    const cz = cockZ + (two && !lay.jet ? L * 0.04 : 0);
    const putPilot = (z, y, x) => { pilotB.add(new THREE.SphereGeometry(0.15, 10, 8), ww1 ? 0x4a3420 : lay.jet && pl.era >= 4 ? 0x9a9a8a : 0x3a3328, [x || 0, y, z]);
      pilotB.add(new THREE.SphereGeometry(1, 10, 6), ww1 ? 0x5a4630 : 0x4a4a3a, [x || 0, y - 0.26, z + 0.05], null, [0.23, 0.13, 0.15]); };
    if (lk.has('open')) {
      const top = topAt(cz);
      // leather-trimmed coaming ring sitting on the fuselage, a small windscreen and a headrest
      const ring = new THREE.TorusGeometry(fr * 0.42, 0.045, 6, 18); ring.rotateX(Math.PI / 2); body.add(ring, 0x3a2614, [0, top + 0.02, cz + 0.1], null, [1, 1, 1.25]);
      const wsW = Math.max(0.24, fr * 0.36), wsH = Math.max(0.24, fr * 0.34), wsZ = cz - fr * 0.55;
      glassB.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, [0, top - 0.02, wsZ], [-0.35, 0, 0], [wsW, wsH, 0.05]);
      { const pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; pts.push(new V(Math.cos(a) * wsW, top - 0.02 + Math.sin(a) * wsH * Math.cos(0.35), wsZ + Math.sin(a) * wsH * Math.sin(0.35))); } body.add(tube(pts, 0.015), 0x2a2a2a); } // windscreen frame
      if (pl.era >= 2) body.add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), pt.top, [0, top - 0.04, cz + fr * 0.9], null, [fr * 0.22, fr * 0.42, fr * 0.8]); // headrest fairing
      putPilot(cz + 0.12, top + 0.12);
      if (two) { const t2 = topAt(cz + L * 0.13); const r2 = new THREE.TorusGeometry(fr * 0.4, 0.045, 6, 18); r2.rotateX(Math.PI / 2); body.add(r2, 0x3a2614, [0, t2 + 0.02, cz + L * 0.13]); putPilot(cz + L * 0.13, t2 + 0.12); }
      if (lk.has('hump')) body.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), camo, [0, topAt(cz - L * 0.12) - 0.05, cz - L * 0.12], null, [fr * 0.55, fr * 0.3, L * 0.09]);
    } else if ((lay.big && !lay.jet && !lk.has('greenhouse')) || lk.has('roundnose') || lk.has('stepped')) {
      // bombers: glazed nose (fully glazed and rounded, or a bomb-aimer's nose under a stepped cockpit)
      if (lk.has('roundnose')) glassB.add(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, [0, 0, -L / 2 + L * 0.075], [-Math.PI / 2, 0, 0], [fr * 0.93, L * 0.085, fr * 0.93]);
      else {
        glassB.add(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, [0, -fr * 0.05, -L / 2 + 0.25], [-Math.PI / 2, 0, 0], [fr * 0.42, L * 0.05, fr * 0.42]);
        const ctop = Math.min(topAt(cockZ - L * 0.04), topAt(cockZ + L * 0.04)) - 0.04;
        glassB.add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, [0, ctop, cockZ], null, [fr * 0.62, fr * 0.42, L * 0.06]);
        for (const dz of [-0.6, 0, 0.6]) { const k = Math.sqrt(1 - dz * dz), pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; pts.push(new V(Math.cos(a) * fr * 0.62 * k, ctop + Math.sin(a) * fr * 0.42 * k + 0.01, cockZ + dz * L * 0.06)); } body.add(tube(pts, 0.025), frameC); }
      }
      if (lk.has('roundnose')) for (const s of [-0.3, 0.3]) putPilot(-L / 2 + L * 0.09, fr * 0.25, s * fr);
      else for (const s of [-0.3, 0.3]) putPilot(cockZ + 0.1, topAt(cockZ) - 0.12, s * fr);
    } else {
      // canopy: a half-ellipsoid seated on the fuselage; frames are curves lying on its surface
      const kind = lk.has('greenhouse') ? 'greenhouse' : lk.has('razor') ? 'razor' : lk.has('framed') ? 'framed' : lk.has('sbs') ? 'sbs' : 'bubble';
      const len = lay.jet ? L * (two ? 0.12 : 0.075) * (kind === 'sbs' ? 0.9 : 1) : L * (kind === 'greenhouse' ? (two ? 0.16 : 0.12) : 0.07);
      const rx = fr * (kind === 'sbs' ? 0.8 : lay.jet ? 0.46 : 0.5), ry = fr * (kind === 'bubble' ? 0.62 : 0.52);
      const y0 = Math.min(topAt(cz - len * 0.7), topAt(cz), topAt(cz + len * 0.7)) - 0.04;
      glassB.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, [0, y0, cz], null, [rx, ry, len]);
      body.add(cyl(1, 1, 0.02, 18), 0x17191b, [0, topAt(cz) + 0.005, cz], null, [rx * 0.9, 1, len * 0.86]); // cockpit opening
      body.add(box(rx * 1.1, 0.1, 0.25), 0x1d1f21, [0, topAt(cz - len * 0.55) + 0.04, cz - len * 0.6]); // instrument coaming
      if (!lay.jet || pl.era <= 4) body.add(box(0.05, 0.12, 0.02), 0x2a2a2a, [0, topAt(cz - len * 0.55) + 0.14, cz - len * 0.58]); // reflector gunsight
      const arc = dz => { const k = Math.sqrt(Math.max(0, 1 - dz * dz)), pts = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; pts.push(new V(Math.cos(a) * rx * k * 1.005, y0 + Math.sin(a) * ry * k * 1.005, cz + dz * len)); } body.add(tube(pts, 0.022), frameC); };
      const rail = () => { const pts = []; for (let i = 0; i <= 10; i++) { const dz = -0.85 + i * 0.17; pts.push(new V(0, y0 + ry * Math.sqrt(Math.max(0, 1 - dz * dz)) * 1.005, cz + dz * len)); } body.add(tube(pts, 0.02), frameC); };
      arc(-0.72); // windscreen frame
      if (kind === 'framed' || kind === 'razor') { arc(-0.35); arc(0.3); rail(); }
      if (kind === 'greenhouse') { for (let dz = -0.4; dz < 0.8; dz += 0.3) arc(dz); rail(); }
      if (kind === 'razor') { // razorback: the spine fairs the canopy into the rear fuselage
        const rl = L * 0.28, base = topAt(cz + len + rl * 0.5) - 0.05, h = y0 + ry * 0.75 - base;
        if (h > 0.05) { const w = panel(h, rl, rl * 0.15, -rl * 0.42, rx * 1.4, 1, 0); w.rotateZ(Math.PI / 2); body.add(w, camo, [0, base, cz + len * 0.75 + rl * 0.5]); }
      }
      putPilot(cz + (two ? -len * 0.35 : len * 0.1), y0 + ry * 0.3, kind === 'sbs' ? -rx * 0.4 : 0);
      if (two) putPilot(kind === 'sbs' ? cz - len * 0.35 : cz + len * 0.45, y0 + ry * 0.3, kind === 'sbs' ? rx * 0.4 : 0);
      if (!lay.jet && pl.era >= 3 && kind !== 'bubble') { const mz = cz + len * 1.25, mt = topAt(mz); body.add(panel(fr * 0.5, 0.14, 0.05, 0.08, 0.02, 1, 0).rotateZ(Math.PI / 2), shade(pt.top, 0.7), [0, mt - 0.02, mz]); } // slim radio mast, standing on the spine, standing on the spine
    }
    // ---------------- wings
    const thick = Math.max(0.12, chord * (lay.jet ? 0.06 : 0.12)), half = S / 2 - fr * 0.5;
    let dih = sh === 'mono' || sh === 'twin' ? 0.07 : sh === 'jet_d' ? -0.02 : 0.03;
    if (lk.has('anhedral')) dih = -0.17; if (lk.has('highwing') || lk.has('shoulder')) dih = Math.min(dih, 0.03);
    const wingsAt = [];
    if (lay.bi && sh !== 'tri') wingsAt.push([wingY, 0], [lay.upperY, -chord * 0.15]);
    else if (sh === 'tri') wingsAt.push([wingY, 0], [fr * 0.6, -chord * 0.1], [lay.upperY + 0.2, -chord * 0.2]);
    else wingsAt.push([wingY, 0]);
    const ellipseTip = pl.ellipse || lk.has('ellip') ? 0.4 : 1;
    const twoPanel = lk.has('invgull') ? [0.3, -0.24, 0.12] : lk.has('f4') ? [0.68, 0, 0.21] : null; // [knee span fraction, inner dihedral, outer dihedral]
    wingsAt.forEach(([y, dz], i) => {
      const lower = lay.bi && i === 0, sesq = lower && lk.has('sesqui');
      const hs = sh === 'tri' ? half * (1 - i * 0.04) : sesq ? half * 0.8 : lower ? half * 0.94 : half, c0 = sesq ? chord * 0.55 : chord, tc = (sesq ? tipC * 0.55 : tipC) * ellipseTip;
      for (const [b, d] of [[wl, -1], [wr, 1]]) {
        let tipY;
        if (twoPanel && !lay.bi) {
          const [kf, d1, d2] = twoPanel, hk = hs * kf, ck = c0 * (1 - kf) + tc * kf, yk = y + Math.tan(d1) * hk;
          b.add(panel(hk, c0, ck, sweep * kf, thick, d, d1), camo, [d * fr * 0.5, y, wingZ + dz]);
          b.add(panel(hs - hk, ck, tc, sweep * (1 - kf), thick * 0.85, d, d2), camo, [d * (fr * 0.5 + hk), yk, wingZ + dz + sweep * kf]);
          tipY = yk + Math.tan(d2) * (hs - hk);
        } else {
          b.add(panel(hs, c0, tc, sweep, thick, d, dih), camo, [d * fr * 0.5, y, wingZ + dz]);
          tipY = y + Math.tan(dih) * hs;
          // control surfaces on the trailing edge: ailerons outboard, flaps inboard
          const strip = (f0, f1, depth) => { const cAt = f => c0 * (1 - f) + tc * f, yAt = f => y + Math.tan(dih) * hs * f + (thick / 2) * (1 - 0.4 * f) + 0.012, te = f => wingZ + dz + sweep * f + cAt(f) / 2;
            const hw = hs * (f1 - f0), rc = cAt(f0) * depth, tcc = cAt(f1) * depth; b.add(panel(hw, rc, tcc, (te(f1) - tcc / 2) - (te(f0) - rc / 2), 0.02, d, Math.atan2(yAt(f1) - yAt(f0), hw)), ctrl, [d * (fr * 0.5 + hs * f0), yAt(f0), te(f0) - rc / 2]); };
          if (i === wingsAt.length - 1 || !lay.bi) { strip(0.55, 0.93, 0.24); if (!ww1 && sh !== 'jet_d' && sh !== 'jet_dc') strip(0.06, 0.52, 0.22); if (sh === 'jet_d' || sh === 'jet_dc') strip(0.08, 0.85, 0.12); }
        }
        b.add(new THREE.SphereGeometry(1, 10, 6), camo, [d * (fr * 0.5 + hs), tipY, wingZ + dz + sweep], null, [Math.max(0.08, tc * 0.18), thick * 0.3 + 0.02, tc * 0.5]); // rounded tip
        if (lk.has('tiptanks') && i === wingsAt.length - 1) b.add(zcyl(0.05, 0.35, 2.8, 12), camo, [d * (fr * 0.5 + hs + 0.25), tipY, wingZ + dz + sweep - 0.2]);
      }
    });
    // the (lower) wing at a given span position: height of the chord line, leading edge, chord
    const wingAt = x => { const hs = half, f = Math.max(0, Math.min(1, (Math.abs(x) - fr * 0.5) / hs)), c = chord * (1 - f) + tipC * ellipseTip * f;
      let y = wingY + Math.tan(dih) * hs * f; if (twoPanel && !lay.bi) { const [kf, d1, d2] = twoPanel; y = wingY + (f < kf ? Math.tan(d1) * hs * f : Math.tan(d1) * hs * kf + Math.tan(d2) * hs * (f - kf)); }
      return { y, le: wingZ + sweep * f - c / 2, c }; };
    if (lay.bi) { // struts, bracing wires, cabane, fixed undercarriage
      const top = wingsAt[wingsAt.length - 1][0], bot = wingsAt[0][0], sx = half * (lk.has('sesqui') ? 0.55 : 0.62);
      for (const [b, d] of [[wl, -1], [wr, 1]]) {
        if (lk.has('sesqui')) { b.add(box(0.06, top - bot, 0.06), 0x5a4a3a, [d * sx, (top + bot) / 2, wingZ - chord * 0.3], [0.3, 0, 0]); b.add(box(0.06, top - bot, 0.06), 0x5a4a3a, [d * sx, (top + bot) / 2, wingZ], [-0.3, 0, 0]); } // V-strut
        else for (const zz of [-chord * 0.3, chord * 0.25]) b.add(box(0.06, top - bot, 0.06), 0x5a4a3a, [d * sx, (top + bot) / 2, wingZ + zz - chord * 0.07]);
        if (pl.id !== 'fd7') b.add(tube([new V(d * fr * 0.6, bot + 0.05, wingZ - chord * 0.1), new V(d * sx, top - 0.05, wingZ - chord * 0.1)], 0.01), 0x8a8a8a);
      }
      for (const zz of [-chord * 0.3, chord * 0.2]) { const zc = wingZ + zz - chord * 0.1, ft = topAt(zc); for (const s of [-1, 1]) body.add(box(0.05, top - ft + 0.05, 0.05), 0x5a4a3a, [s * fr * 0.45, (top + ft) / 2, zc]); }
      body.add(box(fr * 1.2, 0.08, chord * 0.9), camo, [0, top, wingZ - chord * 0.15]);
      for (const s of [-1, 1]) { body.add(box(0.05, fr * 1.4, 0.05), 0x4a4a4a, [s * fr * 0.8, -fr * 1.4, wingZ - chord * 0.3]); body.add(cyl(0.32, 0.32, 0.12, 14), dark, [s * fr * 1.0, -fr * 2.0, wingZ - chord * 0.3], [0, 0, Math.PI / 2]); }
      body.add(box(fr * 2.2, 0.05, 0.05), 0x4a4a4a, [0, -fr * 2.0, wingZ - chord * 0.3]);
      body.add(box(0.06, 0.4, 0.5), 0x4a3a28, [0, -fr * 0.45, L * 0.46], [0.6, 0, 0]);
    } else if (pl.fixedGear) for (const s of [-1, 1]) {
      const gx = s * S * 0.15, w = wingAt(gx), gy = w.y - fr * 1.2;
      body.add(box(lk.has('spats') ? 0.16 : 0.12, w.y - gy, lk.has('spats') ? 0.42 : 0.22), camo, [gx, (w.y + gy) / 2, w.le + w.c * 0.3]); // leg (faired on spatted types)
      if (lk.has('spats')) body.add(new THREE.SphereGeometry(1, 12, 8), camo, [gx, gy, w.le + w.c * 0.3], null, [0.16, 0.36, 0.62]); // streamlined wheel spat
      else body.add(cyl(0.3, 0.3, 0.14, 14), dark, [gx, gy, w.le + w.c * 0.3], [0, 0, Math.PI / 2]);
    }
    if (lk.has('wire')) for (const s of [-1, 1]) { const w = wingAt(s * S * 0.3); for (const yy of [topAt(cz - 0.5) - 0.05, -fr * 1.1]) (s < 0 ? wl : wr).add(tube([new V(s * fr * 0.4, yy, cz - 0.5), new V(s * S * 0.3, w.y, w.le + w.c * 0.4)], 0.012), 0x9a9a9a); }
    if (sh === 'jet_dc') for (const s of [-1, 1]) body.add(panel(S * 0.14, L * 0.09, L * 0.04, L * 0.04, 0.08, s, 0), camo, [s * fr * 0.8, fr * 0.2, -L * 0.28]);
    // ---------------- tail
    const mkFin = [];
    const tailBase = (sh === 'jet_d' || sh === 'jet_dc') ? L * 0.2 : chord, hsSpan = S * (lay.jet ? 0.22 : 0.18) * (lk.has('twinfin') ? 1.15 : 1), hsChord = tailBase * (lay.jet ? 0.55 : 0.6), finH = Math.max(1, S * (lay.jet ? 0.17 : 0.13) * (lay.big ? 1.1 : 1));
    const tailY = pl.tTail || lk.has('ttail') ? finH * 0.95 : lk.has('cruciform') ? finH * 0.4 : 0;
    const stabDih = lk.has('f4') ? -0.4 : 0;
    if (lay.hasStab) for (const s of [-1, 1]) {
      body.add(panel(hsSpan, hsChord, hsChord * 0.55, lay.jet ? hsChord * 0.5 : 0, 0.1, s, stabDih), camo, [s * fr * 0.15, tailY, tailZ]);
      body.add(new THREE.SphereGeometry(1, 10, 6), camo, [s * (fr * 0.15 + hsSpan), tailY + Math.tan(stabDih) * hsSpan, tailZ + (lay.jet ? hsChord * 0.5 : 0)], null, [lay.jet ? 0.06 : hsChord * 0.12, 0.05, hsChord * 0.27]);
      if (!lay.jet || pl.era <= 5) body.add(panel(hsSpan * 0.9, hsChord * 0.28, hsChord * 0.18, lay.jet ? hsChord * 0.6 : hsChord * 0.08, 0.12, s, stabDih), ctrl, [s * fr * 0.2, tailY + 0.01, tailZ + hsChord * 0.38]);
    }
    const fin = (x, cant, hk, yb) => {
      const h = finH * (hk || 1), g = panel(h, hsChord * 1.2, hsChord * 0.5, lay.jet ? hsChord * 0.7 : hsChord * 0.25, 0.12, 1, 0); g.rotateZ(Math.PI / 2 + cant); body.add(g, pt.top, [x, yb, tailZ - hsChord * 0.1]);
      body.add(new THREE.SphereGeometry(1, 10, 6), pt.top, [x - h * Math.sin(cant), yb + h * Math.cos(cant), tailZ - hsChord * 0.1 + (lay.jet ? hsChord * 0.7 : hsChord * 0.25)], [0, 0, cant], [0.06, lay.jet ? 0.06 : hsChord * 0.14, hsChord * 0.25]); // rounded tip
      if (lk.has('dorsal') && cant === 0) { const dl = L * 0.2, d = panel(h * 0.28, dl, 0.05, dl * 0.48, 0.08, 1, 0); d.rotateZ(Math.PI / 2); body.add(d, pt.top, [x, topAt(tailZ - hsChord * 0.6) - 0.08, tailZ - hsChord * 0.6 - dl * 0.1]); } // dorsal fillet
      const r = panel(h * 0.85, hsChord * 0.35, hsChord * 0.2, lay.jet ? hsChord * 0.75 : hsChord * 0.3, 0.14, 1, 0); r.rotateZ(Math.PI / 2 + cant); body.add(r, shade(pt.top, 0.85), [x, yb + 0.05, tailZ + hsChord * 0.38]);
    };
    if (lk.has('twinfin')) for (const s of [-1, 1]) fin(s * (fr * 0.15 + hsSpan), 0, 0.65, tailY - finH * 0.25); // end-plate fins on the tailplane tips
    else if (sh === 'jet_tt') { fin(-fr * 1.0, 0.25, 1, fr * 0.4); fin(fr * 1.0, -0.25, 1, fr * 0.4); }
    else fin(0, 0, 1, topAt(tailZ) - 0.1);
    // fin flash: British and French tail stripes (front to back)
    const flash = pl.nation === 'fra' ? [0x0055a4, 0xffffff, 0xef4135] : pl.nation === 'uk' ? (pl.era <= 2 ? [0x1c2f6e, 0xffffff, 0xc8102e] : pl.era === 3 ? [0xc8102e, 0xffffff, 0x1c2f6e] : [0xc8102e, 0x1c2f6e]) : null;
    if (flash && !lk.has('twinfin') && sh !== 'jet_tt') {
      const yb = topAt(tailZ) - 0.1, w = hsChord * 0.13, zc = tailZ - hsChord * 0.1 + (lay.jet ? hsChord * 0.7 : hsChord * 0.25) * 0.4 + hsChord * 0.05;
      flash.forEach((c, i) => { for (const sd of [-1, 1]) mkFin.push([c, [sd * 0.072, yb + finH * 0.42, zc + (i - (flash.length - 1) / 2) * w], [0.01, finH * 0.42, w]]); });
    }
    if (sh === 'twin' && pl.id === 'p38l') for (const s of [-1, 1]) body.add(zcyl(fr * 0.6, fr * 0.35, L * 0.75, 12), camo, [s * S * 0.18, wingY + 0.1, wingZ + L * 0.22]);
    // ---------------- engines
    const props = [], glows = [];
    for (const e of lay.engines) {
      if (e.pod) { // A-10: podded turbofans high on the rear fuselage, on short pylons
        body.add(lathe(e.len, e.r, [[0, 0.85], [0.08, 1], [0.7, 0.95], [1, 0.7]], 16), camo, [e.x, e.y, e.z]);
        body.add(cyl(e.r * 0.8, e.r * 0.8, 0.04, 16), dark, [e.x, e.y, e.z - e.len / 2 - 0.01], [Math.PI / 2, 0, 0]);
        const ft = topAt(e.z, e.x * 0.5); body.add(box(0.15, Math.max(0.1, e.y - e.r - ft + 0.1), e.len * 0.5), camo, [e.x * 0.75, (e.y - e.r + ft) / 2, e.z]);
        continue;
      }
      if (e.jet) {
        body.add(zcyl(e.r, e.r * 0.86, L * 0.07, 16), metal, [e.x, e.y, L * 0.47]);
        body.add(cyl(e.r * 0.78, e.r * 0.78, 0.04, 16), 0x1a1612, [e.x, e.y, L * 0.505], [Math.PI / 2, 0, 0]);
        if (pl.ab) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; body.add(box(e.r * 0.36, 0.03, L * 0.05), 0x3e3a36, [e.x + Math.cos(a) * e.r * 0.86, e.y + Math.sin(a) * e.r * 0.86, L * 0.52], [0, 0, a + Math.PI / 2]); }
        const gg = new THREE.Mesh(zcyl(e.r * 0.75, e.r * 0.05, L * 0.35, 12), mat('glow')); gg.position.set(e.x, e.y, L * 0.5 + L * 0.17); gg.visible = false; glows.push(gg);
      } else if (lay.jet) {
        body.add(lathe(e.len, e.r, [[0, 0.8], [0.06, 1], [0.7, 0.95], [1, 0.72]], 16), camo, [e.x, e.y, e.z]);
        body.add(cyl(e.r * 0.7, e.r * 0.7, 0.04, 14), dark, [e.x, e.y, e.z - e.len / 2 - 0.01], [Math.PI / 2, 0, 0]);
        body.add(cyl(e.r * 0.55, e.r * 0.55, 0.04, 14), 0x1a1612, [e.x, e.y, e.z + e.len / 2 + 0.01], [Math.PI / 2, 0, 0]);
      } else {
        const radial = e.x !== 0 ? (pl.era >= 3) : RADIAL_IDS.includes(pl.id), front = e.z - e.len / 2;
        if (e.x !== 0) body.add(lathe(e.len, e.r, [[0, 0.75], [0.05, 1], [0.4, 1], [1, 0.45]], 16), camo, [e.x, e.y, e.z]);
        if (radial) {
          const lip = new THREE.TorusGeometry(e.r * 0.95, e.r * 0.07, 6, 20); body.add(lip, pt.acc === 0xcccccc ? camo : pt.acc, [e.x, e.y, front + 0.04]);
          body.add(cyl(e.r * 0.9, e.r * 0.9, 0.04, 20), 0x1d1d1d, [e.x, e.y, front + 0.12], [Math.PI / 2, 0, 0]);
          const n = pl.era <= 2 ? 9 : 14;
          for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; body.add(box(e.r * 0.22, e.r * 0.42, e.r * 0.25), 0x3c3c3c, [e.x + Math.cos(a) * e.r * 0.62, e.y + Math.sin(a) * e.r * 0.62, front + 0.18], [0, 0, a + Math.PI / 2]); }
        } else if (e.x === 0) {
          // inline engine: exhaust stacks on both sides of the nose, seated on the cowling
          for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const z = -L / 2 + L * 0.1 + k * L * 0.032, x = sideAt(z, fr * 0.32, s); body.add(box(0.12, 0.07, 0.14), 0x2c2622, [x + s * 0.03, fr * 0.32, z], [0, 0, s * 0.5]); }
        }
        body.add(lathe(e.r * 0.85, e.r * 0.36, [[0, 0.02], [0.4, 0.75], [1, 1]], 12), pt.acc, [e.x, e.y, front - e.r * 0.42]);
        const pg = new THREE.Group(), pr = Math.max(1.1, e.r * (pl.eng === 1 ? 1.6 : 1.7)), nb = pl.era >= 3 ? (pl.mass > 3500 ? 4 : 3) : 2, blades = new Builder();
        for (let i = 0; i < nb; i++) { const bl = panel(pr * 0.9, 0.24, 0.1, 0, 0.04, 1, 0); bl.rotateZ(Math.PI / 2); bl.rotateY(0.35); blades.add(bl, pl.era === 1 ? 0x6b4a2a : 0x1e1e1e, [0, pr * 0.08, 0], [0, 0, i / nb * Math.PI * 2]); }
        if (pl.era >= 3) for (let i = 0; i < nb; i++) { const a = i / nb * Math.PI * 2 + Math.PI / 2; blades.add(box(0.12, pr * 0.1, 0.05), 0xd8c020, [Math.cos(a) * pr * 0.93, Math.sin(a) * pr * 0.93, 0], [0, 0, a - Math.PI / 2]); }
        pg.add(new THREE.Mesh(blades.build(), mat('vc')));
        pg.add(new THREE.Mesh(new THREE.CircleGeometry(pr, 24), mat('prop')));
        pg.position.set(e.x, e.y, front - 0.12); props.push(pg);
      }
    }
    // ---------------- guns: barrels sticking out of the real leading edge / cowling
    for (const [gid, n, mount] of pl.guns) {
      const cal = GUNS[gid].cal / 1000, len = 0.35 + cal * 22;
      for (let i = 0; i < n; i++) {
        if (mount === 'wing') { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2), x = s * (fr + S * (0.11 + k * 0.03)), w = wingAt(x);
          (s < 0 ? wl : wr).add(zcyl(cal * 2, cal * 2.6, len, 6), dark, [x, w.y, w.le - len / 2 + 0.12]); }
        else if (mount === 'nose' && !lay.jet) body.add(zcyl(cal * 2, cal * 2, len, 6), dark, [(i - (n - 1) / 2) * 0.15, (pl.eng >= 2 ? fr * 0.1 : 0), -L * 0.5 - len / 2 + 0.25]);
        else if (mount === 'nose' && lay.jet) { const z = -L * 0.3 - (i >> 1) * 0.25, s = i % 2 ? 1 : -1, x = sideAt(z, -fr * 0.35, s); body.add(zcyl(cal * 1.8, cal * 2.6, 0.4, 6), dark, [x, -fr * 0.35, z]); }
        else if (mount === 'sync') { const z = -L * 0.3, x = (i - (n - 1) / 2) * 0.22; body.add(zcyl(cal * 2.2, cal * 2.2, len + 0.3, 6), dark, [x, topAt(z, x) + cal * 2, z]); }
      }
    }
    // ---------------- defensive turrets
    for (const t of pl.turrets) { const tp = turretPos(pl, t[2]), r = Math.max(0.35, fr * 0.35);
      glassB.add(new THREE.SphereGeometry(1, 12, 8), 0xffffff, [tp.x, tp.y, tp.z], null, [r, r, r]);
      for (let k = 0; k < t[1]; k++) body.add(zcyl(0.02, 0.025, 0.9, 5), dark, [tp.x + (k - (t[1] - 1) / 2) * 0.12, tp.y, tp.z + (t[2] === 'nose' ? -1 : 1) * (r + 0.4)]); }
    // ---------------- assemble
    const g = new THREE.Group();
    const bodyMesh = new THREE.Mesh(body.build(), mat('vc')); g.add(bodyMesh);
    const glass = new THREE.Mesh(glassB.build(), mat('glass')); g.add(glass);
    const pilot = pilotB.parts.length ? new THREE.Mesh(pilotB.build(), mat('vc')) : null; if (pilot) glass.add(pilot);
    const wingL = new THREE.Mesh(wl.build(), mat('vc')), wingR = new THREE.Mesh(wr.build(), mat('vc')); g.add(wingL, wingR);
    // ---------------- markings, dropped onto the real surfaces
    const mkB = new Builder(), mkL = new Builder(), mkR = new Builder();
    for (const [c, p, sz] of mkFin) mkB.add(box(sz[0], sz[1], sz[2]), c, p);
    const onSurface = (mesh, from, dir) => { ray.set(from, dir); ray.far = 50; const h = ray.intersectObject(mesh, false)[0]; return h ? h.point : null; };
    { const [y0, dz] = wingsAt[wingsAt.length - 1], hs = sh === 'tri' ? half * (1 - (wingsAt.length - 1) * 0.04) : half;
      const f = Math.min(0.75, Math.max(0.3, (S * 0.32 - fr * 0.5) / hs)), chordAt = chord * (1 - f) + tipC * ellipseTip * f, size = Math.min(S * 0.12, 1.8, chordAt * 0.8);
      for (const s of [-1, 1]) { const x = s * (fr * 0.5 + hs * f), z = wingZ + dz + sweep * f - chordAt * 0.05, hit = onSurface(s < 0 ? wingL : wingR, new V(x, y0 + 8, z), new V(0, -1, 0));
        if (hit) insignia(s < 0 ? mkL : mkR, pl.nation, size, [x, hit.y + 0.02, z], 'y', pl.era); } }
    { const z = L * (lay.jet ? 0.14 : 0.16), y = lay.jet ? 0 : fr * 0.05;
      for (const s of [-1, 1]) { const hit = onSurface(fusMesh, new V(s * fr * 2.1, y, z), new V(-s, 0, 0)); if (!hit) continue;
        const r = Math.abs(hit.x), size = Math.min(r * 1.25, fr * 1.3, 1.5); if (size > 0.2) insignia(mkB, pl.nation, size, [hit.x + s * 0.02, y, z], 'x', pl.era); } }
    if (mkL.parts.length) wingL.add(new THREE.Mesh(mkL.build(), mat('vc2'))); if (mkR.parts.length) wingR.add(new THREE.Mesh(mkR.build(), mat('vc2')));
    const marks = mkB.parts.length ? new THREE.Mesh(mkB.build(), mat('vc2')) : null; if (marks) g.add(marks);
    if (!ww1 && pl.era >= 2) {
      const [y0, dz] = wingsAt[wingsAt.length - 1], tz = wingZ + dz + sweep;
      for (const [w, d, col] of [[wingL, -1, 0xff2a2a], [wingR, 1, 0x30ff60]]) { const lb = new Builder(), x = d * (fr * 0.5 + half) + d * 0.02, hit = onSurface(w, new V(x * 0.995, y0 + 6, tz), new V(0, -1, 0));
        lb.add(new THREE.SphereGeometry(0.06, 8, 6), col, [x, hit ? hit.y - 0.03 : y0, tz - (lk.has('tiptanks') ? 1.4 : 0)]); w.add(new THREE.Mesh(lb.build(), mat('lamp'))); }
      const tl = new Builder(); tl.add(new THREE.SphereGeometry(0.05, 8, 6), 0xffffff, [0, lay.jet ? topAt(L * 0.42) : 0.05, L / 2 - 0.02]); g.add(new THREE.Mesh(tl.build(), mat('lamp')));
    }
    for (const p of props) g.add(p); for (const gl of glows) g.add(gl);
    // ---------------- retractable landing gear (hidden unless lowered)
    let gearMesh = null;
    if (!lay.fixed) {
      const gb = new Builder(), wr2 = lay.wheelR, gl = lay.gearLen, gz = wingZ - chord * 0.15;
      for (const sd of [-1, 1]) { gb.add(cyl(0.07, 0.07, gl, 6), 0x555555, [sd * lay.gearX, wingY - gl / 2, gz]); gb.add(cyl(wr2, wr2, wr2 * 0.5, 14), dark, [sd * lay.gearX, wingY - gl, gz], [0, 0, Math.PI / 2]); gb.add(box(0.03, gl * 0.8, wr2 * 1.6), camo, [sd * (lay.gearX + 0.18), wingY - gl * 0.45, gz]); }
      if (lay.jet) { gb.add(cyl(0.05, 0.05, lay.gearH - wr2 * 0.8, 6), 0x555555, [0, -(lay.gearH - wr2 * 0.8) / 2, -L * 0.32]); gb.add(cyl(wr2 * 0.8, wr2 * 0.8, wr2 * 0.4, 12), dark, [0, -lay.gearH + wr2 * 0.8, -L * 0.32], [0, 0, Math.PI / 2]); }
      else { const th = Math.max(0.3, lay.gearH * 0.45); gb.add(box(0.08, th, 0.08), 0x555555, [0, -th / 2, L * 0.4]); gb.add(cyl(0.18, 0.18, 0.12, 10), dark, [0, -th, L * 0.4], [0, 0, Math.PI / 2]); }
      gearMesh = new THREE.Mesh(gb.build(), mat('vc')); gearMesh.visible = false; g.add(gearMesh);
    }
    fusGeo.dispose();
    g.userData = { props, glows, wingL, wingR, body: bodyMesh, glass, pilot, marks, lay, gear: gearMesh };
    return g;
  };
})();
