// ============================================================================
// Detailed aircraft models (replaces the simple builder in models.js).
// Everything is still generated from the database dimensions, in the aircraft
// frame (nose -Z, up +Y, right +X), as a few merged vertex-coloured meshes:
//   body (fuselage, engines, tail, details), left / right wing (detachable),
//   glass (canopy) + pilot, propellers, afterburner glow, landing gear.
// National markings are placed by casting a ray onto the finished surfaces, so
// they always sit on the skin.
// ============================================================================
(() => {
  const { Builder, panel, box, cyl, zcyl, paint, layout, mat, turretPos, insignia } = Models;
  const V = THREE.Vector3;
  const NOSE_INTAKE = ['mig15', 'mig17', 'f86f', 'f86fj', 'sabre6', 'mig21bis', 'mig21mf', 'ouragan', 'mystere4', 'f100d', 'su7b', 'g91', 'f80c'];
  const SHOCK_CONE = ['mig21bis', 'mig21mf', 'su7b'];
  const UNDERWING_RAD = ['uk', 'ger', 'fra'];
  const LERX = ['f16c', 'fa18e', 'su27', 'su35s', 'mig29', 'mig29g', 'f2a', 'su57', 'f22a', 'su34'];
  const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };
  // fuselage of revolution from a profile [t 0..1 nose->tail, r as a fraction of fr]
  function lathe(L, fr, prof, segs, phi) {
    const pts = prof.map(([t, r]) => new THREE.Vector2(Math.max(0.001, r * fr), -L / 2 + t * L));
    const g = new THREE.LatheGeometry(pts, segs || 18, phi || 0);
    g.rotateX(Math.PI / 2); // lathe axis Y -> aircraft Z (nose at -Z)
    return g;
  }
  function profile(pl, lay) {
    const sh = pl.shape;
    if (lay.jet) {
      if (NOSE_INTAKE.includes(pl.id)) return [[0, 0.62], [0.02, 0.72], [0.12, 0.9], [0.3, 1], [0.8, 0.95], [0.96, 0.78], [1, 0.72]];
      if (lay.big) return [[0, 0.1], [0.04, 0.5], [0.12, 0.85], [0.25, 1], [0.8, 0.95], [1, 0.4]];
      return [[0, 0.02], [0.04, 0.22], [0.12, 0.52], [0.24, 0.82], [0.34, 1], [0.84, 0.96], [0.96, 0.8], [1, 0.74]];
    }
    if (lay.big || pl.eng >= 2) return [[0, 0.35], [0.03, 0.72], [0.09, 0.92], [0.18, 1], [0.6, 0.98], [0.84, 0.6], [0.97, 0.28], [1, 0.15]];
    if (RADIAL_IDS.includes(pl.id)) return [[0, 0.3], [0.006, 0.98], [0.03, 1.06], [0.15, 1.04], [0.22, 1], [0.46, 0.97], [0.72, 0.6], [0.93, 0.28], [1, 0.12]];
    return [[0, 0.18], [0.03, 0.55], [0.08, 0.8], [0.16, 0.92], [0.3, 1], [0.46, 0.97], [0.72, 0.6], [0.93, 0.28], [1, 0.12]];
  }
  const RADIAL_IDS = ['p12', 'p26', 'p47d', 'f4u1d', 'fw190a', 'la5fn', 'a6m2', 'ki43', 'ki84', 'n1k2', 'i15', 'i16', 'gladiator', 'ki27', 'ki10', 'b5n', 'sbd', 'a1h', 'd3a', 'camel', 'dr1', 'n17', 'n17ru', 'n24ko3', 'n28', 'he51', 'hart'];
  // a thin control-surface panel lying on the wing top surface along the trailing edge, from span fraction f0 to f1
  function surfaceStrip(b, d, x0, hs, chord, tipC, sweep, thick, y0, dih, z0, f0, f1, depth, col) {
    const cAt = f => chord * (1 - f) + tipC * f, yAt = f => y0 + Math.tan(dih) * hs * f + (thick / 2) * (1 - 0.4 * f) + 0.012;
    const teAt = f => z0 + sweep * f + cAt(f) / 2;
    const half = hs * (f1 - f0), rc = cAt(f0) * depth, tc = cAt(f1) * depth;
    const g = panel(half, rc, tc, (teAt(f1) - tc / 2) - (teAt(f0) - rc / 2), 0.02, d, Math.atan2(yAt(f1) - yAt(f0), half));
    b.add(g, col, [d * (x0 + hs * f0), yAt(f0), teAt(f0) - rc / 2]);
  }
  Models.aircraft = function (pl) {
    const lay = layout(pl), { L, S, fr, chord, tipC, sweep, wingZ, wingY, tailZ, cockZ } = lay, pt = paint(pl), sh = pl.shape;
    const camo = [pt.top, pt.bot], dark = 0x262626, metal = 0x5a5e62, ctrl = [shade(pt.top, 0.86), shade(pt.bot, 0.9)];
    const body = new Builder(), wl = new Builder(), wr = new Builder(), glassB = new Builder(), pilotB = new Builder();
    const ww1 = pl.era === 1 || (lay.bi && pl.era <= 2);
    // ---------------- fuselage
    body.add(lathe(L, fr, profile(pl, lay), ww1 ? 4 : 18, ww1 ? Math.PI / 4 : 0), camo, [0, 0, 0], null, ww1 ? [1.05, 1, 1] : [0.94, 1, 1]);
    if (lay.jet && pl.eng === 2 && sh !== 'jet_s2' && sh !== 'jet_bomber') {
      // twin-engine fighters: two engine tubes blended into a flat centre body
      for (const s of [-1, 1]) body.add(zcyl(fr * 0.66, fr * 0.6, L * 0.62, 14), camo, [s * fr * 0.68, -fr * 0.15, L * 0.18]);
      body.add(box(fr * 2.2, fr * 0.45, L * 0.55), camo, [0, fr * 0.05, L * 0.16]);
    }
    // ---------------- intakes / nose
    if (lay.jet) {
      if (NOSE_INTAKE.includes(pl.id)) {
        body.add(cyl(fr * 0.6, fr * 0.6, 0.06, 18), dark, [0, 0, -L / 2 + 0.02], [Math.PI / 2, 0, 0]);
        if (SHOCK_CONE.includes(pl.id)) body.add(zcyl(0.02, fr * 0.42, L * 0.08, 12), metal, [0, 0, -L / 2 - L * 0.02]);
      } else if (sh !== 'jet_s2' && sh !== 'jet_bomber') for (const s of [-1, 1]) {
        const iz = -L * 0.14, il = L * 0.24, ir = fr * 0.42;
        body.add(zcyl(ir, ir * 0.9, il, 12), camo, [s * fr * 1.0, -fr * 0.2, iz]);
        body.add(cyl(ir * 0.85, ir * 0.85, 0.04, 12), dark, [s * fr * 1.0, -fr * 0.2, iz - il / 2 - 0.01], [Math.PI / 2, 0, 0]);
        body.add(box(0.04, ir * 2.2, il * 0.8), shade(pt.top, 0.8), [s * fr * 0.62, -fr * 0.2, iz - il * 0.05]); // splitter plate
      }
      // pitot / probe on the nose
      if (!NOSE_INTAKE.includes(pl.id) || SHOCK_CONE.includes(pl.id)) body.add(zcyl(0.025, 0.04, L * 0.08, 6), metal, [0, 0, -L / 2 - L * 0.04]);
      if (LERX.includes(pl.id)) for (const s of [-1, 1]) body.add(panel(fr * 1.3, L * 0.32, 0.4, L * 0.16, 0.08, s, 0), camo, [s * fr * 0.55, wingY + 0.02, wingZ - chord * 0.55]);
    }
    // ---------------- canopy, cockpit and pilot
    const cockY = fr * (lay.jet ? 0.78 : 0.82);
    if (ww1) {
      // open cockpit: leather coaming and a small windscreen
      const ring = new THREE.TorusGeometry(fr * 0.42, 0.05, 6, 16); ring.rotateX(Math.PI / 2); body.add(ring, 0x3a2614, [0, fr * 1.0, cockZ + 0.15]);
      glassB.add(box(fr * 0.6, fr * 0.32, 0.02), 0xffffff, [0, fr * 1.15, cockZ - fr * 0.25], [-0.4, 0, 0]);
      pilotB.add(new THREE.SphereGeometry(0.15, 8, 6), 0x3b2a1a, [0, fr * 1.15, cockZ + 0.2]);
    } else if (lay.big && !lay.jet) {
      glassB.add(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, [0, fr * 0.72, cockZ], null, [fr * 0.6, fr * 0.45, L * 0.07]);
      glassB.add(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, [0, 0, -L / 2 + 0.05], [-Math.PI / 2, 0, 0], [fr * 0.36, L * 0.06, fr * 0.36]); // glazed nose
      for (const s of [-0.3, 0.3]) pilotB.add(new THREE.SphereGeometry(0.15, 8, 6), 0x2b2b2b, [s * fr, fr * 0.78, cockZ + 0.1]);
    } else {
      const two = pl.crew.length > 1 && !lay.big, len = L * (lay.jet ? (two ? 0.16 : 0.11) : (two ? 0.2 : 0.11));
      glassB.add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, [0, cockY, cockZ + (two ? len * 0.4 : 0)], null, [fr * 0.52, fr * 0.6, len]);
      // canopy frame: windscreen bow and (on piston fighters) framed panels
      const bow = new THREE.TorusGeometry(1, 0.04, 4, 12, Math.PI); bow.rotateY(Math.PI / 2); bow.rotateZ(Math.PI / 2);
      body.add(bow, dark, [0, cockY, cockZ - len * 0.55], [0, Math.PI / 2, 0], [fr * 0.5, fr * 0.56, 1]);
      if (!lay.jet) { body.add(bow, dark, [0, cockY, cockZ + len * 0.25], [0, Math.PI / 2, 0], [fr * 0.52, fr * 0.6, 1]); body.add(box(0.04, 0.04, len * 1.6), dark, [0, cockY + fr * 0.59, cockZ]); }
      pilotB.add(new THREE.SphereGeometry(0.15, 8, 6), 0x2b2b2b, [0, cockY + fr * 0.22, cockZ + 0.15]);
      if (two) pilotB.add(new THREE.SphereGeometry(0.15, 8, 6), 0x2b2b2b, [0, cockY + fr * 0.22, cockZ + len * 0.9]);
      // radio mast behind the canopy (WW2 piston aircraft)
      if (!lay.jet && pl.era >= 3) body.add(box(0.03, fr * 0.8, 0.18), dark, [0, fr * 1.25, cockZ + len * 1.4], [-0.25, 0, 0]);
    }
    // ---------------- wings
    const thick = Math.max(0.12, chord * (lay.jet ? 0.06 : 0.12)), half = S / 2 - fr * 0.5;
    const dih = sh === 'mono' || sh === 'twin' ? 0.07 : sh === 'jet_d' ? -0.02 : 0.03;
    const wingsAt = [];
    if (lay.bi && sh !== 'tri') wingsAt.push([wingY, 0], [lay.upperY, -chord * 0.15]);
    else if (sh === 'tri') wingsAt.push([wingY, 0], [fr * 0.6, -chord * 0.1], [lay.upperY + 0.2, -chord * 0.2]);
    else wingsAt.push([wingY, 0]);
    const ellipseTip = pl.ellipse ? 0.4 : 1;
    wingsAt.forEach(([y, dz], i) => {
      const hs = sh === 'tri' ? half * (1 - i * 0.04) : lay.bi && i === 0 ? half * 0.94 : half, tc = tipC * ellipseTip;
      for (const [b, d] of [[wl, -1], [wr, 1]]) {
        b.add(panel(hs, chord, tc, sweep, thick, d, dih), camo, [d * fr * 0.5, y, wingZ + dz]);
        // rounded wingtip
        b.add(new THREE.SphereGeometry(1, 10, 6), camo, [d * (fr * 0.5 + hs), y + Math.tan(dih) * hs, wingZ + dz + sweep], null, [Math.max(0.08, tc * 0.18), thick * 0.3 + 0.02, tc * 0.5]);
        // ailerons on the outer trailing edge, flaps inboard (on the top wing of a biplane only ailerons)
        if (i === wingsAt.length - 1 || !lay.bi) {
          surfaceStrip(b, d, fr * 0.5, hs, chord, tc, sweep, thick, y, dih, wingZ + dz, 0.55, 0.93, 0.24, ctrl);
          if (!ww1 && sh !== 'jet_d' && sh !== 'jet_dc') surfaceStrip(b, d, fr * 0.5, hs, chord, tc, sweep, thick, y, dih, wingZ + dz, 0.06, 0.52, 0.22, ctrl);
          if (sh === 'jet_d' || sh === 'jet_dc') surfaceStrip(b, d, fr * 0.5, hs, chord, tc, sweep, thick, y, dih, wingZ + dz, 0.08, 0.85, 0.12, ctrl); // elevons
        }
        // pitot tube on the left / right outer leading edge of piston aircraft
        if (!lay.jet && d > 0 && i === wingsAt.length - 1) b.add(zcyl(0.02, 0.02, 0.6, 5), metal, [d * (fr * 0.5 + hs * 0.8), y, wingZ + dz + sweep * 0.8 - (chord * 0.2 + tc * 0.8) / 2 - 0.3]);
      }
    });
    if (lay.bi) { // struts, bracing wires and centre-section cabane
      const top = wingsAt[wingsAt.length - 1][0], bot = wingsAt[0][0];
      for (const [b, d] of [[wl, -1], [wr, 1]]) {
        for (const zz of [-chord * 0.3, chord * 0.25]) b.add(box(0.06, top - bot, 0.06), 0x5a4a3a, [d * half * 0.62, (top + bot) / 2, wingZ + zz - chord * 0.07]);
        const wire = box(0.012, Math.hypot(top - bot, half * 0.55), 0.012); b.add(wire, 0x777777, [d * half * 0.36, (top + bot) / 2, wingZ - chord * 0.1], [0, 0, d * Math.atan2(half * 0.55, top - bot)]);
      }
      for (const zz of [-chord * 0.3, chord * 0.2]) for (const s of [-1, 1]) body.add(box(0.05, top - fr * 0.6, 0.05), 0x5a4a3a, [s * fr * 0.5, (top + fr * 0.6) / 2, wingZ + zz - chord * 0.1]);
      body.add(box(fr * 1.2, 0.08, chord * 0.9), camo, [0, top, wingZ - chord * 0.15]);
      for (const s of [-1, 1]) { body.add(box(0.05, fr * 1.4, 0.05), 0x4a4a4a, [s * fr * 0.8, -fr * 1.4, wingZ - chord * 0.3]); body.add(cyl(0.32, 0.32, 0.12, 14), dark, [s * fr * 1.0, -fr * 2.0, wingZ - chord * 0.3], [0, 0, Math.PI / 2]); }
      body.add(box(fr * 2.2, 0.05, 0.05), 0x4a4a4a, [0, -fr * 2.0, wingZ - chord * 0.3]); // axle
      body.add(box(0.06, 0.4, 0.5), 0x4a3a28, [0, -fr * 0.45, L * 0.46], [0.6, 0, 0]); // tail skid
    } else if (pl.fixedGear) for (const s of [-1, 1]) { body.add(box(0.14, fr * 1.2, 0.5), camo, [s * S * 0.15, wingY - fr * 0.6, wingZ - chord * 0.2]); body.add(cyl(0.3, 0.3, 0.14, 14), dark, [s * S * 0.15, wingY - fr * 1.2, wingZ - chord * 0.2], [0, 0, Math.PI / 2]); }
    if (sh === 'jet_dc') for (const s of [-1, 1]) body.add(panel(S * 0.14, L * 0.09, L * 0.04, L * 0.04, 0.08, s, 0), camo, [s * fr * 0.8, fr * 0.2, -L * 0.28]);
    // ---------------- tail
    const tailBase = (sh === 'jet_d' || sh === 'jet_dc') ? L * 0.2 : chord, hsSpan = S * (lay.jet ? 0.22 : 0.18), hsChord = tailBase * (lay.jet ? 0.55 : 0.6), finH = Math.max(1, S * (lay.jet ? 0.17 : 0.13) * (lay.big ? 1.1 : 1));
    const tailY = pl.tTail ? finH * 0.95 : (sh === 'jet_d' || sh === 'jet_dc') ? 99 : 0;
    if (tailY !== 99) for (const s of [-1, 1]) {
      body.add(panel(hsSpan, hsChord, hsChord * 0.55, lay.jet ? hsChord * 0.5 : 0, 0.1, s, 0), camo, [s * fr * 0.15, tailY, tailZ]);
      if (!lay.jet || pl.era <= 5) body.add(panel(hsSpan * 0.9, hsChord * 0.28, hsChord * 0.18, lay.jet ? hsChord * 0.6 : hsChord * 0.08, 0.12, s, 0), ctrl, [s * fr * 0.2, tailY, tailZ + hsChord * 0.38]); // elevator
    }
    const fin = (x, cant) => {
      const g = panel(finH, hsChord * 1.2, hsChord * 0.5, lay.jet ? hsChord * 0.7 : hsChord * 0.25, 0.12, 1, 0); g.rotateZ(Math.PI / 2 + cant); body.add(g, pt.top, [x, fr * 0.4, tailZ - hsChord * 0.1]);
      const r = panel(finH * 0.85, hsChord * 0.35, hsChord * 0.2, lay.jet ? hsChord * 0.75 : hsChord * 0.3, 0.14, 1, 0); r.rotateZ(Math.PI / 2 + cant); body.add(r, shade(pt.top, 0.85), [x, fr * 0.45, tailZ + hsChord * 0.38]); // rudder
      if (!lay.jet) body.add(new THREE.SphereGeometry(1, 8, 6), pt.top, [x, fr * 0.4 + finH, tailZ - hsChord * 0.1 + (lay.jet ? hsChord * 0.7 : hsChord * 0.25)], null, [0.07, 0.12, hsChord * 0.25]);
    };
    if (sh === 'jet_tt') { fin(-fr * 1.0, 0.25); fin(fr * 1.0, -0.25); } else fin(0, 0);
    if (sh === 'twin' && pl.id === 'p38l') for (const s of [-1, 1]) body.add(zcyl(fr * 0.6, fr * 0.35, L * 0.75, 12), camo, [s * S * 0.18, wingY + 0.1, wingZ + L * 0.22]);
    // ---------------- engines
    const props = [], glows = [];
    for (const e of lay.engines) {
      if (e.jet) {
        // nozzle: metal ring, dark throat; afterburning engines get a petal ring
        body.add(zcyl(e.r, e.r * 0.86, L * 0.07, 16), metal, [e.x, e.y, L * 0.47]);
        body.add(cyl(e.r * 0.78, e.r * 0.78, 0.04, 16), 0x1a1612, [e.x, e.y, L * 0.505], [Math.PI / 2, 0, 0]);
        if (pl.ab) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; body.add(box(e.r * 0.36, 0.03, L * 0.05), 0x3e3a36, [e.x + Math.cos(a) * e.r * 0.86, e.y + Math.sin(a) * e.r * 0.86, L * 0.52], [0, 0, a + Math.PI / 2]); }
        const gg = new THREE.Mesh(zcyl(e.r * 0.75, e.r * 0.05, L * 0.35, 12), mat('glow')); gg.position.set(e.x, e.y, L * 0.5 + L * 0.17); gg.visible = false; glows.push(gg);
      } else if (lay.jet) {
        // podded / nacelle jets (Me 262, Meteor, Canberra...)
        body.add(zcyl(e.r * 0.85, e.r, e.len * 0.3, 14), camo, [e.x, e.y, e.z - e.len * 0.35]);
        body.add(zcyl(e.r, e.r * 0.75, e.len * 0.7, 14), camo, [e.x, e.y, e.z + e.len * 0.15]);
        body.add(cyl(e.r * 0.7, e.r * 0.7, 0.04, 14), dark, [e.x, e.y, e.z - e.len / 2 - 0.01], [Math.PI / 2, 0, 0]);
        body.add(cyl(e.r * 0.55, e.r * 0.55, 0.04, 14), 0x1a1612, [e.x, e.y, e.z + e.len / 2 + 0.01], [Math.PI / 2, 0, 0]);
      } else {
        const radial = e.x !== 0 ? (pl.era >= 3) : RADIAL_IDS.includes(pl.id), front = e.z - e.len / 2;
        if (e.x !== 0) body.add(lathe(e.len, e.r, [[0, 0.75], [0.05, 1], [0.4, 1], [1, 0.45]], 14), camo, [e.x, e.y, e.z]);
        if (radial) {
          // cowling lip and the engine face with its cylinders
          const lip = new THREE.TorusGeometry(e.r * 0.95, e.r * 0.07, 6, 18); body.add(lip, pt.acc === 0xcccccc ? camo : pt.acc, [e.x, e.y, front + 0.04]);
          body.add(cyl(e.r * 0.9, e.r * 0.9, 0.04, 18), 0x1d1d1d, [e.x, e.y, front + 0.12], [Math.PI / 2, 0, 0]);
          const n = pl.era <= 2 ? 9 : 14;
          for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; body.add(box(e.r * 0.22, e.r * 0.42, e.r * 0.25), 0x3c3c3c, [e.x + Math.cos(a) * e.r * 0.62, e.y + Math.sin(a) * e.r * 0.62, front + 0.18], [0, 0, a + Math.PI / 2]); }
        } else if (e.x === 0) {
          // inline: exhaust stacks along both sides of the nose, a radiator scoop
          for (const s of [-1, 1]) for (let k = 0; k < 6; k++) body.add(box(0.07, 0.07, 0.14), 0x2c2622, [s * fr * 0.78, fr * 0.32, -L / 2 + L * 0.1 + k * L * 0.032], [0, 0, s * 0.5]);
          if (UNDERWING_RAD.includes(pl.nation) && pl.era >= 3) for (const s of [-1, 1]) body.add(box(fr * 0.7, fr * 0.32, chord * 0.55), camo, [s * (fr + S * 0.08), wingY - thick, wingZ]);
          else if (pl.era >= 3) body.add(box(fr * 0.75, fr * 0.42, L * 0.2), camo, [0, -fr * 0.95, L * 0.06]);
        }
        // spinner and propeller
        body.add(lathe(e.r * 0.85, e.r * 0.36, [[0, 0.02], [0.4, 0.75], [1, 1]], 12), pt.acc, [e.x, e.y, front - e.r * 0.42]);
        const pg = new THREE.Group(), pr = Math.max(1.1, e.r * (pl.eng === 1 ? 1.6 : 1.7)), nb = pl.era >= 3 ? (pl.mass > 3500 ? 4 : 3) : 2;
        const blades = new Builder();
        // a twisted, tapered blade: wide near the hub, narrow at the tip
        for (let i = 0; i < nb; i++) { const bl = panel(pr * 0.9, 0.24, 0.1, 0, 0.04, 1, 0); bl.rotateZ(Math.PI / 2); bl.rotateY(0.35); blades.add(bl, pl.era === 1 ? 0x6b4a2a : 0x1e1e1e, [0, pr * 0.08, 0], [0, 0, i / nb * Math.PI * 2]); }
        if (pl.era >= 3) for (let i = 0; i < nb; i++) { const a = i / nb * Math.PI * 2 + Math.PI / 2; blades.add(box(0.12, pr * 0.1, 0.05), 0xd8c020, [Math.cos(a) * pr * 0.93, Math.sin(a) * pr * 0.93, 0], [0, 0, a - Math.PI / 2]); } // painted tips
        pg.add(new THREE.Mesh(blades.build(), mat('vc')));
        const disc = new THREE.Mesh(new THREE.CircleGeometry(pr, 24), mat('prop')); pg.add(disc);
        pg.position.set(e.x, e.y, front - 0.12); props.push(pg);
      }
    }
    // ---------------- guns
    for (const [gid, n, mount] of pl.guns) {
      const cal = GUNS[gid].cal / 1000, len = 0.4 + cal * 25;
      for (let i = 0; i < n; i++) {
        if (mount === 'wing') { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2); (s < 0 ? wl : wr).add(zcyl(cal * 2, cal * 2.4, len, 6), dark, [s * (fr + S * (0.12 + k * 0.035)), wingY, wingZ - chord * 0.5 - len / 2]); }
        else if (mount === 'nose' && !lay.jet) body.add(zcyl(cal * 2, cal * 2, len, 6), dark, [(i - (n - 1) / 2) * 0.15, fr * 0.2, -L * 0.5 - len / 2 + 0.2]);
        else if (mount === 'nose' && lay.jet) body.add(zcyl(cal * 1.8, cal * 2.6, 0.3, 6), dark, [(i % 2 ? 1 : -1) * fr * 0.55, -fr * 0.35, -L * 0.3 - (i >> 1) * 0.25]);
        else if (mount === 'sync') body.add(zcyl(cal * 2.2, cal * 2.2, len + 0.4, 6), dark, [(i - (n - 1) / 2) * 0.25, fr * 0.95, -L * 0.28]);
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
    const ray = new THREE.Raycaster(), mkB = new Builder(), mkL = new Builder(), mkR = new Builder();
    const onSurface = (mesh, from, dir) => { ray.set(from, dir); ray.far = 50; const h = ray.intersectObject(mesh, false)[0]; return h ? h.point : null; };
    { const [y0, dz] = wingsAt[wingsAt.length - 1], hs = sh === 'tri' ? half * (1 - (wingsAt.length - 1) * 0.04) : half;
      const f = Math.min(0.75, Math.max(0.3, (S * 0.32 - fr * 0.5) / hs)), chordAt = chord * (1 - f) + tipC * ellipseTip * f, size = Math.min(S * 0.12, 1.8, chordAt * 0.8);
      for (const s of [-1, 1]) {
        const x = s * (fr * 0.5 + hs * f), z = wingZ + dz + sweep * f - chordAt * 0.05, hit = onSurface(s < 0 ? wingL : wingR, new V(x, y0 + 5, z), new V(0, -1, 0));
        if (hit) insignia(s < 0 ? mkL : mkR, pl.nation, size, [x, hit.y + 0.02, z], 'y', pl.era);
      } }
    { const z = L * (lay.jet ? 0.14 : 0.16), y = lay.jet ? 0 : fr * 0.05;
      for (const s of [-1, 1]) {
        // start just outside the fuselage (not out by the nacelles or booms)
        const hit = onSurface(bodyMesh, new V(s * fr * 2.1, y, z), new V(-s, 0, 0)); if (!hit) continue;
        const r = Math.abs(hit.x), size = Math.min(r * 1.25, fr * 1.3, 1.5);
        if (size > 0.2) insignia(mkB, pl.nation, size, [hit.x + s * 0.02, y, z], 'x', pl.era);
      } }
    if (mkL.parts.length) wingL.add(new THREE.Mesh(mkL.build(), mat('vc2'))); if (mkR.parts.length) wingR.add(new THREE.Mesh(mkR.build(), mat('vc2')));
    const marks = mkB.parts.length ? new THREE.Mesh(mkB.build(), mat('vc2')) : null; if (marks) g.add(marks);
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
    g.userData = { props, glows, wingL, wingR, body: bodyMesh, glass, pilot, marks, lay, gear: gearMesh };
    return g;
  };
})();
