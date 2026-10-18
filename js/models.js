// ============================================================================
// Procedural 3D models. Aircraft face -Z (nose), +Y up, +X right, in metres,
// sized from the database's span and length. Each aircraft is a few merged,
// vertex-coloured meshes: body, left wing, right wing (so wings can be shot
// off), propellers and an afterburner glow.
// ============================================================================
const Models = (() => {
  const V = THREE.Vector3, M4 = THREE.Matrix4;
  const matCache = {};
  function mat(kind) {
    if (matCache[kind]) return matCache[kind];
    let m;
    if (kind === 'vc') m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 22, specular: 0x1c1c1c }); // a little sheen, like painted metal
    else if (kind === 'lamp') m = new THREE.MeshBasicMaterial({ vertexColors: true });
    else if (kind === 'vc2') m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    else if (kind === 'glass') m = new THREE.MeshPhongMaterial({ color: 0x2c4050, shininess: 110, specular: 0xaabbcc, transparent: true, opacity: 0.55, depthWrite: false });
    else if (kind === 'prop') m = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    else if (kind === 'glow') m = new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    return (matCache[kind] = m);
  }

  // ---- geometry builder: collect transformed parts, merge into one non-indexed BufferGeometry with vertex colours
  class Builder {
    constructor() { this.parts = []; }
    add(geo, color, pos, rot, scale, camo) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      const m = new M4(); const q = new THREE.Quaternion();
      if (rot) q.setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'XYZ'));
      m.compose(new V(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0), q, scale ? new V(scale[0], scale[1], scale[2]) : new V(1, 1, 1));
      g.applyMatrix4(m); this.parts.push({ g, color, camo }); return this;
    }
    build() {
      let n = 0; for (const p of this.parts) n += p.g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
      let o = 0; const c = new THREE.Color(), c2 = new THREE.Color();
      for (const p of this.parts) {
        const pa = p.g.attributes.position, na = p.g.attributes.normal;
        const fn = typeof p.color === 'function' ? p.color : null;
        if (fn) { /* per-vertex paint */ } else if (Array.isArray(p.color)) { c.setHex(p.color[0]); c2.setHex(p.color[1]); } else c.setHex(p.color);
        for (let i = 0; i < pa.count; i++, o++) {
          if (fn) { const h = fn(pa.getX(i), pa.getY(i), pa.getZ(i), na.getY(i), na.getZ(i)); c.setHex(h); c2.setHex(h); }
          pos[o * 3] = pa.getX(i); pos[o * 3 + 1] = pa.getY(i); pos[o * 3 + 2] = pa.getZ(i);
          nor[o * 3] = na.getX(i); nor[o * 3 + 1] = na.getY(i); nor[o * 3 + 2] = na.getZ(i);
          // camouflage: top colour on upward faces, underside colour on downward faces
          const cc = fn ? c : Array.isArray(p.color) ? (na.getY(i) < -0.25 ? c2 : c) : c;
          col[o * 3] = cc.r; col[o * 3 + 1] = cc.g; col[o * 3 + 2] = cc.b;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere(); return g;
    }
  }
  // a tapered wing panel: root at x=0, tip at x=dir*half; chord along z; sweep moves the tip back (+z)
  function panel(half, rootC, tipC, sweep, thick, dir, dihedral) {
    const t = thick / 2, dy = Math.tan(dihedral || 0) * half;
    const rz0 = -rootC / 2, rz1 = rootC / 2, tz0 = -tipC / 2 + sweep, tz1 = tipC / 2 + sweep, x = half * dir;
    const v = [[0, -t, rz0], [0, -t, rz1], [0, t, rz1], [0, t, rz0], [x, -t * 0.6 + dy, tz0], [x, -t * 0.6 + dy, tz1], [x, t * 0.6 + dy, tz1], [x, t * 0.6 + dy, tz0]];
    const faces = [[0, 1, 2, 3], [4, 7, 6, 5], [3, 2, 6, 7], [0, 4, 5, 1], [0, 3, 7, 4], [1, 5, 6, 2]];
    const arr = [];
    for (const f of faces) { const q = dir > 0 ? f : [f[0], f[3], f[2], f[1]]; for (const i of [q[0], q[1], q[2], q[0], q[2], q[3]]) arr.push(...v[i]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s || 10); // along Y
  const zcyl = (rNose, rTail, len, s) => { const g = cyl(rTail, rNose, len, s); g.rotateX(Math.PI / 2); return g; }; // along Z, nose at -Z

  // ---- colour schemes by nation and era
  function paint(pl) {
    const n = pl.nation, e = pl.era;
    if (e === 1) return { top: { uk: 0x6b6440, ger: 0x7a6a5a, fra: 0xb8b39b, usa: 0x6b6440, ussr: 0xb5ae92, jpn: 0xb5ae92 }[n], bot: 0xd9cfa8, acc: n === 'ger' ? 0x9a3b3b : 0x444444 };
    if (e === 2) return { top: { uk: 0xb9bdb7, ger: 0x8d9384, fra: 0x8b8b6e, usa: 0x5a6e8c, ussr: 0x5f7044, jpn: 0x8b8d7a }[n], bot: n === 'usa' ? 0xd8b830 : 0xb8bcb8, acc: 0xc9a227 };
    if (e === 3) return { top: { uk: 0x5d5a3f, ger: 0x6c7461, fra: 0x6b6a52, usa: 0x55604a, ussr: 0x5b6b45, jpn: 0x4a5a3a }[n] || 0x666666, bot: { uk: 0xa8ad9a, ger: 0x9eb1c4, usa: 0x9aa4ac, jpn: 0xb6b39c }[n] || 0x9aa7b0, acc: n === 'ger' ? 0xd4c020 : 0xcccccc };
    if (e === 4) return { top: 0xb8bcc2, bot: 0xa9aeb4, acc: n === 'ussr' ? 0xaa2222 : 0x223366 };
    if (e === 5) return { top: n === 'usa' || n === 'jpn' ? 0x7d7a5c : 0x8b939c, bot: 0xb5bcc4, acc: 0x333333 };
    return { top: n === 'ussr' ? 0x8fa9c0 : 0x8a939c, bot: n === 'ussr' ? 0xa9c3d6 : 0xa3abb3, acc: 0x444444 };
  }
  function insignia(b, nation, size, pos, normalAxis, era) {
    // flat markings: a disc / cross / star, slightly off the surface
    const N = NATIONS[nation], rot = normalAxis === 'x' ? [0, 0, Math.PI / 2] : [0, 0, 0];
    const flat = (g, c, s, off) => { const p = pos.slice(); if (normalAxis === 'x') p[0] += off * Math.sign(pos[0] || 1); else p[1] += off; b.add(g, c, p, rot, [s, 1, s]); };
    const disc = cyl(1, 1, 0.02, 16);
    if (nation === 'ger') { flat(box(1, 0.02, 0.3), 0xffffff, size, 0.01); flat(box(0.3, 0.02, 1), 0xffffff, size, 0.01); flat(box(0.8, 0.02, 0.18), 0x111111, size, 0.02); flat(box(0.18, 0.02, 0.8), 0x111111, size, 0.02); return; }
    if (nation === 'jpn') { if (era >= 3 && normalAxis === 'x') flat(disc, 0xffffff, size * 0.56, 0.005); flat(disc, 0xc8102e, size * 0.5, 0.01); return; } // white-outlined hinomaru on dark-green fuselages
    if (nation === 'ussr') { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.2 : 0.5; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
      const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); flat(g, 0xcc1111, size, 0.02); return; }
    if (nation === 'usa' && era === 1) { flat(disc, 0xb22234, size * 0.5, 0.01); flat(disc, 0x1c2f6e, size * 0.34, 0.02); flat(disc, 0xffffff, size * 0.16, 0.03); return; }
    if (nation === 'usa' && era >= 3) { // star and bar (1943 on), with the red stripe from 1947
      const bar = (l, h) => normalAxis === 'x' ? box(h, 0.02, l) : box(l, 0.02, h);
      flat(bar(1.9, 0.3), 0x1c2f6e, size, 0.004); flat(bar(1.78, 0.2), 0xffffff, size, 0.007); if (era >= 4) flat(bar(1.78, 0.07), 0xb22234, size, 0.009); }
    if (nation === 'uk' && era === 3) { // WW2 RAF: yellow-ringed type C1 on the fuselage, type B (no white) on the upper wings
      if (normalAxis === 'x') { flat(disc, 0xd8b030, size * 0.56, 0.005); flat(disc, N.roundel[2], size * 0.5, 0.01); flat(disc, N.roundel[1], size * 0.3, 0.02); flat(disc, N.roundel[0], size * 0.22, 0.03); }
      else { flat(disc, N.roundel[2], size * 0.5, 0.01); flat(disc, N.roundel[0], size * 0.22, 0.03); }
      return; }
    if (nation === 'usa') { flat(disc, 0x1c2f6e, size * 0.45, 0.01); const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.17 : 0.42; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
      const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); flat(g, 0xffffff, size, 0.035); return; }
    flat(disc, N.roundel[2], size * 0.5, 0.01); flat(disc, N.roundel[1], size * 0.34, 0.02); flat(disc, N.roundel[0], size * 0.18, 0.03);
  }

  // ---- shared layout: also used by the damage model's hit boxes
  const layoutCache = {};
  function layout(pl) {
    if (layoutCache[pl.id]) return layoutCache[pl.id];
    // everything comes from the parametric airframe (airframe.js), so hit boxes, gear, stores and the cockpit eye match the model
    const sp = Airframe.spec(pl), w = sp.wing, root = sp.wingAt(0), tip = sp.wingAt(1), L = sp.L, S = sp.S, fr = sp.H / 2, jet = sp.jet; // fr: fuselage half-depth
    const st = sp.stab, fin = sp.fins[0];
    const lay = { L, S, fr, chord: w.rc, tipC: w.tc, sweep: (tip.le + tip.c / 2) - (root.le + root.c / 2), wingZ: root.le + root.c / 2, wingY: w.y,
      tailZ: st ? st.zLE + st.rc / 2 : fin.zLE + fin.rc / 2, cockZ: sp.canopy.z,
      engines: sp.engines.map(e => ({ x: e.x, y: e.y, z: e.z, r: e.r, len: e.len, jet: !!e.jet && (e.kind === 'fus' || e.kind === 'nacelle'), pod: e.kind === 'pod' })),
      bi: sp.bi, big: sp.big, jet, upperY: sp.wings[sp.wings.length - 1].y, extras: sp.extras, hasStab: !!st, spec: sp,
      tail: { hsSpan: st ? st.b : 0, hsChord: st ? (st.rc + st.tc) / 2 : 0, tailY: st ? st.y : 0, finH: fin.h, finTop: fin.base + fin.h, finX: Math.max(...sp.fins.map(f => Math.abs(f.x))), finC: fin.rc } };
    lay.eyeY = sp.canopy.type === 'open' ? sp.topAt(sp.canopy.z) + 0.34 : sp.topAt(sp.canopy.z, sp.canopy.x) + Math.min(0.48, sp.canopy.h * 0.5);
    // landing gear: fixed gear (biplanes etc.) or retractable main gear under the wings; gearH = height of the CG above the ground when sitting on the wheels
    Object.assign(lay, { fixed: sp.gear.fixed, wheelR: sp.gear.wheelR, gearLen: sp.gear.gearLen, gearH: sp.gear.gearH, gearX: sp.gear.gearX });
    return (layoutCache[pl.id] = lay);
  }

  function turretPos(pl, arc) {
    const lay = layout(pl), L = lay.L, fr = lay.fr;
    return arc === 'rear' ? new V(0, fr * 0.9, lay.cockZ + Math.max(1.3, L * 0.12)) : arc === 'dorsal' ? new V(0, fr * 1.0, L * 0.05) : arc === 'ventral' ? new V(0, -fr * 1.0, L * 0.12)
      : arc === 'tail' ? new V(0, 0, L * 0.5) : new V(0, 0, -L * 0.5);
  }
  // falling debris piece from a mesh (a detached wing)
  function debris(mesh) { const m = new THREE.Mesh(mesh.geometry, mesh.material); return m; }

  // ---- ground targets ------------------------------------------------------
  const TEAM_COL = [0x3a6fd8, 0xd83a3a];
  const RUNWAY = [0, 450, 650, 1000, 1500, 1700, 1800, 1800]; // m, by era
  function aaMount(era, heavy) {
    const b = new Builder(), g = new THREE.Group();
    b.add(cyl(1.6, 1.9, 0.6, 10), 0x6d6a5a, [0, 0.3, 0]); // sandbag ring
    const base = new THREE.Mesh(b.build(), mat('vc')); g.add(base);
    const tb = new Builder();
    if (era >= 6 && heavy) { tb.add(box(2.4, 1.2, 3.2), 0x5b6346, [0, 1.3, 0]); for (const x of [-0.6, 0.6]) for (const y of [0.5, 1.2]) tb.add(zcyl(0.3, 0.3, 3.4, 8), 0x7b8366, [x, 1.4 + y, -0.3], [0.5, 0, 0]); }
    else { tb.add(box(1.2, 0.7, 1.2), 0x4c5240, [0, 1.0, 0]); const n = era >= 3 && !heavy ? 2 : 1, bl = heavy ? 4 : 2.2, r = heavy ? 0.13 : 0.06;
      for (let i = 0; i < n; i++) tb.add(zcyl(r, r, bl, 6), 0x2a2a2a, [(i - (n - 1) / 2) * 0.35, 1.2, -bl / 2]); }
    const turret = new THREE.Mesh(tb.build(), mat('vc')); g.add(turret);
    g.userData.turret = turret; return g;
  }
  // builds a base group; returns { group, aaSpots: [Vector3 local], radius }
  function base(kind, size, team, era) {
    const b = new Builder(), sc = size === 'small' ? 1 : size === 'medium' ? 1.6 : 2.4, tc = TEAM_COL[team];
    const rnd = mulberry(kind.length * 97 + sc * 13 + team * 7);
    const R = 45 * sc, aa = []; let runway = null;
    const house = (x, z, w, d, h, c) => { b.add(box(w, h, d), c, [x, h / 2, z]); b.add(box(w * 1.05, 0.5, d * 1.05), 0x5a3a2a, [x, h + 0.25, z]); };
    const flag = (x, z) => { b.add(cyl(0.1, 0.1, 9, 5), 0xcccccc, [x, 4.5, z]); b.add(box(0.05, 1.4, 2.2), tc, [x, 8, z + 1.1]); };
    const water = kind === 'ship' || kind === 'carrier';
    if (kind === 'balloon') {
      b.add(box(6, 2, 4), 0x5d5340, [0, 1, 0]); b.add(cyl(0.05, 0.05, 260, 3), 0x333333, [0, 130, 0]);
      b.add(new THREE.SphereGeometry(1, 12, 8), 0xa89a6a, [0, 262, 0], null, [5, 5, 11]); b.add(box(1.5, 1.2, 1.5), 0x4a3a2a, [0, 254, 0]);
      flag(6, 0); aa.push(new V(10, 0, 8));
    } else if (kind === 'ship' || kind === 'carrier') {
      const len = kind === 'carrier' ? 120 * sc / 1.6 : 55 * sc, w = kind === 'carrier' ? 22 : 10 * Math.sqrt(sc);
      b.add(box(w, 8, len), 0x5b636b, [0, 2, 0]); b.add(box(w * 0.7, 6, len * 0.15), 0x5b636b, [0, 0, -len * 0.5]);
      if (kind === 'carrier') { b.add(box(w * 1.2, 1, len * 1.05), 0x6b5d4b, [0, 6.5, 0]); b.add(box(4, 10, 16), 0x5b636b, [w * 0.55, 12, 5]); b.add(box(0.3, 0.05, len), 0xdddddd, [0, 7.05, 0]); }
      else { b.add(box(w * 0.6, 8, len * 0.2), 0x6b737b, [0, 10, -len * 0.05]); b.add(cyl(1.2, 1.4, 6, 8), 0x444444, [0, 15, len * 0.08]);
        for (const z of [-0.3, 0.32]) { b.add(cyl(2.5, 2.5, 2, 10), 0x4b535b, [0, 7, len * z]); b.add(zcyl(0.4, 0.4, 10, 6), 0x333333, [0, 7.5, len * z - 6 * Math.sign(-z)]); } }
      b.add(box(w * 0.3, 0.2, 3), tc, [0, 7.2, len * 0.45]);
      for (let i = 0; i < (size === 'small' ? 2 : size === 'medium' ? 3 : 5); i++) aa.push(new V((i % 2 ? 1 : -1) * w * 0.35, 7, (i / 4 - 0.5) * len * 0.7));
    } else if (kind === 'sam') {
      for (let i = 0; i < 3 * sc; i++) { const a = i / (3 * sc) * Math.PI * 2; b.add(box(4, 2, 7), 0x5b6346, [Math.cos(a) * R * 0.5, 1, Math.sin(a) * R * 0.5]); }
      b.add(box(6, 3, 6), 0x4c5240, [0, 1.5, 0]); b.add(cyl(0.2, 0.2, 8, 5), 0x333333, [0, 7, 0]); b.add(box(5, 3, 0.3), 0x666666, [0, 11, 0]);
      flag(R * 0.3, R * 0.3); for (let i = 0; i < 2 + sc; i++) { const a = i / (2 + sc) * Math.PI * 2 + 0.4; aa.push(new V(Math.cos(a) * R * 0.75, 0, Math.sin(a) * R * 0.75)); }
    } else {
      if (kind === 'airfield') { const rl = RUNWAY[era], grass = era <= 2; runway = { x: -R * 0.6, z: 0, len: rl, w: grass ? 60 : 30 };
        b.add(box(runway.w, 0.16, rl), grass ? 0x6f7d4a : 0x4a4a48, [-R * 0.6, 0.08, 0]); if (!grass) { b.add(box(1, 0.04, rl * 0.9), 0xdddddd, [-R * 0.6, 0.18, 0]); for (const e of [-1, 1]) b.add(box(26, 0.04, 4), 0xdddddd, [-R * 0.6, 0.18, e * (rl / 2 - 12)]); }
        for (let i = 0; i < sc * 1.5; i++) { const hz = (i - sc * 0.6) * 34; b.add(cyl(11, 11, 30, 12, 1), 0x7a7f74, [R * 0.15, 0, hz], [Math.PI / 2, 0, 0], [1, 1, 0.75]); } }
      if (kind === 'factory') { for (let i = 0; i < 2 + sc * 2; i++) { const x = (rnd() - 0.5) * R * 1.4, z = (rnd() - 0.5) * R * 1.4; b.add(box(26, 10, 18), 0x8a6a55, [x, 5, z]); b.add(box(27, 1, 19), 0x555555, [x, 10.5, z]); }
        for (let i = 0; i < 1 + sc; i++) b.add(cyl(1.6, 2.2, 32, 8), 0x7b5040, [(rnd() - 0.5) * R, 16, (rnd() - 0.5) * R]); }
      if (kind === 'city') { for (let i = 0; i < 12 * sc; i++) { const x = (rnd() - 0.5) * R * 2, z = (rnd() - 0.5) * R * 2, h = 6 + rnd() * (era >= 4 ? 30 : 14); b.add(box(8 + rnd() * 8, h, 8 + rnd() * 8), [0x9a8e80, 0x8a7e70], [x, h / 2, z]); } }
      if (kind === 'camp' || kind === 'airfield' || kind === 'city') {
        const n = Math.round(3 * sc);
        for (let i = 0; i < n; i++) { const x = (rnd() - 0.5) * R * 1.2, z = (rnd() - 0.5) * R * 1.2;
          if (era <= 2 || kind === 'camp') b.add(cyl(0.2, 3.5, 3.5, 4), 0x6b6440, [x, 1.75, z], [0, Math.PI / 4, 0]);
          else house(x, z, 9, 14, 4, 0x8a8070); }
        for (let i = 0; i < n; i++) b.add(box(2, 1.2, 1.2), 0x6b5a3a, [(rnd() - 0.5) * R, 0.6, (rnd() - 0.5) * R]); // crates
        if (era >= 3 && kind === 'camp') for (let i = 0; i < sc * 2; i++) { const x = (rnd() - 0.5) * R, z = (rnd() - 0.5) * R; b.add(box(3.4, 1.4, 6), 0x4c5240, [x, 0.9, z]); b.add(box(1.8, 0.8, 2), 0x4c5240, [x, 2, z]); b.add(zcyl(0.1, 0.1, 3.5, 5), 0x333333, [x, 2.1, z - 2.5]); }
      }
      flag(R * 0.2, -R * 0.2);
      const nAA = size === 'small' ? (era >= 2 ? 2 : 1) : size === 'medium' ? 3 : 5;
      for (let i = 0; i < nAA; i++) { const a = i / nAA * Math.PI * 2 + 0.6; aa.push(new V(Math.cos(a) * R * 0.85, 0, Math.sin(a) * R * 0.85)); }
    }
    const g = new THREE.Group(); g.add(new THREE.Mesh(b.build(), mat('vc')));
    return { group: g, aaSpots: aa, radius: R + 15, water, runway, flat: runway ? Math.max(R + 15, runway.len * 0.8) : R + 15 };
  }
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function missile(len, r) { const b = new Builder(); b.add(zcyl(r, r, len, 6), 0xdddddd, [0, 0, 0]); b.add(zcyl(0.01, r, r * 3, 6), 0x999999, [0, 0, -len / 2 - r * 1.5]);
    for (let i = 0; i < 4; i++) b.add(box(r * 4, 0.02, r * 3), 0xbbbbbb, [0, 0, len / 2 - r * 1.5], [0, 0, i * Math.PI / 4 * 2]); return new THREE.Mesh(b.build(), mat('vc')); }
  // a store as it hangs on a pylon (bomb, rocket pod / rails, missile, gun pod); userData.r / len for placement
  function storeMesh(s, id) {
    let m, r, len;
    if (s.kind === 'b') { m = bomb(s.mass); r = 0.12 * Math.cbrt(s.mass / 20) * 0.6; len = r * 9; if (s.guided) { const b2 = new Builder(); b2.add(box(r * 3, 0.02, r * 1.2), 0x555555, [0, 0, -len * 0.45]); m.add(new THREE.Mesh(b2.build(), mat('vc'))); } }
    else if (s.kind === 'm') { len = Math.min(4.2, 1.6 + s.mass / 90); r = 0.06 + s.mass / 2600; m = missile(len, r); }
    else if (s.kind === 'g') { len = 2.4 + s.mass / 600; r = 0.22 + s.mass / 4000; const b2 = new Builder(); b2.add(zcyl(r * 0.6, r, len, 12), 0x5c6268, [0, 0, 0]); b2.add(zcyl(0.03, 0.03, 0.6, 6), 0x222222, [0, -r * 0.3, -len / 2 - 0.3]); m = new THREE.Mesh(b2.build(), mat('vc')); }
    else { // rockets: a pod for many small rockets, rails for a few big ones
      const pod = s.count >= 6 || /pod/i.test(s.name), b2 = new Builder();
      if (pod) { len = 1.8; r = 0.24; b2.add(zcyl(r * 0.8, r, len, 12), 0x55605a, [0, 0, 0]); b2.add(cyl(r * 0.8, r * 0.8, 0.02, 12), 0x222222, [0, 0, -len / 2 - 0.01], [Math.PI / 2, 0, 0]); }
      else { len = 1.6; r = 0.08; b2.add(box(0.06, 0.04, len), 0x444444, [0, r + 0.03, 0]); b2.add(zcyl(r, r, len, 8), 0x7a7a6a, [0, 0, 0]); b2.add(zcyl(0.01, r, 0.25, 8), 0x9a9a8a, [0, 0, -len / 2 - 0.12]); }
      m = new THREE.Mesh(b2.build(), mat('vc'));
    }
    m.userData.r = r; m.userData.len = len; return m;
  }
  function bomb(mass) { const r = 0.12 * Math.cbrt(mass / 20), b = new Builder(); b.add(zcyl(r * 0.6, r * 0.5, r * 5, 8), 0x4a5040, [0, 0, 0]); b.add(new THREE.SphereGeometry(r, 8, 6), 0x4a5040, [0, 0, -r * 2.5]); b.add(box(r * 2, 0.02, r * 1.2), 0x3a4030, [0, 0, r * 2.8]); b.add(box(0.02, r * 2, r * 1.2), 0x3a4030, [0, 0, r * 2.8]); return new THREE.Mesh(b.build(), mat('vc')); }
  return { aircraft: null /* set by aircraft3d.js */, storeMesh, layout, turretPos, paint, insignia, base, aaMount, missile, bomb, debris, mat, Builder, mulberry, TEAM_COL, zcyl, box, cyl, panel };
})();
