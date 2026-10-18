// ============================================================================
// Ground targets at a realistic scale (replaces the small bases in models.js).
// Returns { group, aaSpots (local, y = gun height for ships), radius (target
// area), water, runway, flat (radius of the levelled ground) }.
// ============================================================================
(() => {
  const { Builder, box, cyl, zcyl, mat, mulberry, TEAM_COL } = Models;
  const V = THREE.Vector3;
  const RUNWAY = [0, 450, 650, 1000, 1500, 1700, 1800, 1800];
  const SIZE_R = { small: 160, medium: 300, big: 480 };
  Models.BASE_R = SIZE_R;
  Models.base = function (kind, size, team, era) {
    const b = new Builder(), tc = TEAM_COL[team], rnd = mulberry(kind.length * 97 + (size === 'big' ? 7 : size === 'medium' ? 3 : 1) * 13 + team * 7 + era);
    const k = size === 'small' ? 1 : size === 'medium' ? 2 : 3, aa = [];
    let R = SIZE_R[size], runway = null;
    const water = kind === 'ship' || kind === 'carrier';
    const RX = () => (rnd() - 0.5) * 2;
    // ---- building blocks
    const house = (x, z, w, d, h, col, rot) => { b.add(box(w, h, d), col || [0x8a8070, 0x7a7060], [x, h / 2, z], [0, rot || 0, 0]); b.add(box(w * 1.04, 0.6, d * 1.04), 0x5a3a2a, [x, h + 0.3, z], [0, rot || 0, 0]); };
    const shed = (x, z, w, d, h, rot) => { b.add(box(w, h, d), [0x7c6a58, 0x6c5a48], [x, h / 2, z], [0, rot || 0, 0]); const n = Math.max(2, Math.round(d / 10)); for (let i = 0; i < n; i++) { const r = new THREE.CylinderGeometry(0.01, w * 0.5, 4, 4); r.rotateY(Math.PI / 4); b.add(r, 0x5a5a5a, [x, h + 2, z - d / 2 + (i + 0.5) * d / n], [0, rot || 0, 0], [1, 1, 0.25]); } };
    const tent = (x, z, s) => b.add(cyl(0.2, 3.5 * s, 3.2 * s, 4), [0x6b6440, 0x5b5430], [x, 1.6 * s, z], [0, Math.PI / 4 + rnd(), 0]);
    const truck = (x, z, rot) => { b.add(box(2.4, 2.2, 6.5), 0x4c5240, [x, 1.5, z], [0, rot, 0]); b.add(box(2.3, 1.6, 2), 0x3f4436, [x - Math.sin(rot) * 2.8, 1.2, z - Math.cos(rot) * 2.8], [0, rot, 0]); };
    const tankV = (x, z, rot) => { b.add(box(3.2, 1.3, 6.5), 0x4f5638, [x, 1, z], [0, rot, 0]); b.add(box(2.2, 1, 2.6), 0x4f5638, [x, 2.1, z], [0, rot, 0]); };
    const fuel = (x, z, r) => { b.add(cyl(r, r, r * 1.1, 14), 0xb8b8b0, [x, r * 0.55, z]); b.add(cyl(r * 1.02, r, 0.4, 14), 0x8a8a84, [x, r * 1.1, z]); };
    const road = (x1, z1, x2, z2, w) => { const L = Math.hypot(x2 - x1, z2 - z1); b.add(box(w, 0.1, L), 0x55534c, [(x1 + x2) / 2, 0.05, (z1 + z2) / 2], [0, Math.atan2(x2 - x1, z2 - z1), 0]); };
    const fence = r => { const n = Math.round(r / 8); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2; b.add(box(0.15, 2.2, 0.15), 0x5a5a52, [Math.cos(a) * r, 1.1, Math.sin(a) * r]);
      const mx = (Math.cos(a) + Math.cos(a2)) / 2 * r, mz = (Math.sin(a) + Math.sin(a2)) / 2 * r; b.add(box(0.04, 1.6, 2 * Math.PI * r / n), 0x6a6a62, [mx, 1.2, mz], [0, -(a + a2) / 2, 0]); } };
    const sandbags = (x, z, r) => { const t = new THREE.TorusGeometry(r, 0.6, 4, 12); t.rotateX(Math.PI / 2); b.add(t, 0x8a7a5a, [x, 0.5, z]); };
    const flag = (x, z) => { b.add(cyl(0.12, 0.12, 12, 5), 0xcccccc, [x, 6, z]); b.add(box(0.05, 2, 3.2), tc, [x, 10.8, z + 1.6]); };
    const parked = (x, z, rot, s) => { b.add(box(1.2 * s, 1.2 * s, 9 * s), 0x55604a, [x, 1.2, z], [0, rot, 0]); b.add(box(11 * s, 0.3, 2 * s), 0x55604a, [x, 1.3, z], [0, rot, 0]); b.add(box(4 * s, 0.25, 1.2 * s), 0x55604a, [x - Math.sin(rot) * 4 * s, 1.4, z - Math.cos(rot) * 4 * s], [0, rot, 0]); };
    const revet = (x, z, rot) => { for (const [dx, dz, w, d] of [[-9, 0, 2.5, 18], [9, 0, 2.5, 18], [0, 9, 20, 2.5]]) { const c = Math.cos(rot), s = Math.sin(rot); b.add(box(w, 3, d), 0x6e6046, [x + dx * c + dz * s, 1.5, z - dx * s + dz * c], [0, rot, 0]); } };
    const ringAA = (n, r) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + 0.6; const p = new V(Math.cos(a) * r, 0, Math.sin(a) * r); aa.push(p); sandbags(p.x, p.z, 3.2); } };
    if (kind === 'balloon') {
      R = 40;
      b.add(box(6, 2, 4), 0x5d5340, [0, 1, 0]); b.add(cyl(0.05, 0.05, 260, 3), 0x333333, [0, 130, 0]);
      b.add(new THREE.SphereGeometry(1, 14, 10), 0xa89a6a, [0, 262, 0], null, [5, 5, 11]); b.add(box(1.5, 1.2, 1.5), 0x4a3a2a, [0, 254, 0]);
      for (let i = 0; i < 4; i++) tent(RX() * 25, RX() * 25, 1); truck(12, 6, 0.4); flag(-10, 4); aa.push(new V(15, 0, 12)); sandbags(15, 12, 3);
    } else if (water) {
      // ships at their real size: destroyer / cruiser / battleship; escort or fleet carrier
      const carrier = kind === 'carrier';
      const len = carrier ? (size === 'big' ? 260 : 150) : [0, 110, 180, 250][k], w = carrier ? (size === 'big' ? 34 : 22) : [0, 11, 18, 32][k], fb = carrier ? (size === 'big' ? 17 : 12) : [0, 6, 8, 10][k];
      R = len / 2;
      const hull = 0x5b636b;
      b.add(box(w, fb + 4, len * 0.86), [hull, 0x3e2a26], [0, (fb - 4) / 2, len * 0.04]);
      const bow = new THREE.CylinderGeometry(0.01, w / 2, len * 0.16, 4, 1); bow.rotateX(-Math.PI / 2); bow.rotateZ(Math.PI / 4);
      b.add(bow, hull, [0, (fb - 4) / 2, -len * 0.47], null, [1, 1, (fb + 4) / w * 1.4]);
      b.add(box(w * 0.9, 0.3, len * 0.84), carrier ? 0x6b5d4b : 0x7a7466, [0, fb + 0.15, len * 0.04]); // deck
      if (carrier) {
        b.add(box(w * 1.1, 0.4, len * 0.98), 0x585a54, [0, fb + 0.5, 0]);
        b.add(box(0.5, 0.05, len * 0.95), 0xdddddd, [0, fb + 0.75, 0]);
        b.add(box(6, 14, 30), hull, [w * 0.48, fb + 7, len * 0.05]); b.add(box(4, 8, 8), 0x4b535b, [w * 0.48, fb + 18, len * 0.05]); b.add(cyl(0.3, 0.3, 10, 5), 0x333333, [w * 0.48, fb + 25, len * 0.05]);
        for (let i = 0; i < (size === 'big' ? 14 : 8); i++) parked((i % 2 ? 1 : -1) * w * 0.22, fb + 0.6, len * 0.42 - i * 9, Math.PI, 1);
      } else {
        const tur = k === 3 ? 4 : k === 2 ? 3 : 2, tr = [0, 2.2, 3.5, 6][k];
        for (let i = 0; i < tur; i++) { const z = (i < tur / 2 ? -len * 0.32 + i * tr * 2.6 : len * 0.32 - (tur - 1 - i) * tr * 2.6), fwd = z < 0 ? -1 : 1;
          b.add(cyl(tr, tr * 1.1, tr * 0.8, 14), 0x4b535b, [0, fb + tr * 0.4, z]); for (let g = 0; g < (k >= 2 ? 3 : 2); g++) b.add(zcyl(0.25 * k, 0.3 * k, tr * 3, 6), 0x333333, [(g - (k >= 2 ? 1 : 0.5)) * tr * 0.35, fb + tr * 0.5, z + fwd * tr * 1.8]); }
        b.add(box(w * 0.5, fb * 1.2, len * 0.18), 0x6b737b, [0, fb + fb * 0.6, -len * 0.06]); b.add(box(w * 0.3, fb * 0.8, len * 0.08), 0x6b737b, [0, fb * 2.4, -len * 0.08]);
        for (let i = 0; i < (k === 3 ? 2 : 1); i++) b.add(cyl(w * 0.07, w * 0.09, fb * 1.3, 10), 0x444444, [0, fb + fb * 1.4, len * 0.05 + i * w * 0.4]);
        b.add(cyl(0.3, 0.3, fb * 3, 5), 0x333333, [0, fb * 3, -len * 0.12]);
      }
      b.add(box(w * 0.3, 0.2, 5), tc, [0, fb + 0.5, len * 0.44]);
      const n = carrier ? 8 : [0, 3, 5, 8][k];
      for (let i = 0; i < n; i++) aa.push(new V((i % 2 ? 1 : -1) * w * 0.4, fb + 1, (i / (n - 1 || 1) - 0.5) * len * 0.75));
    } else if (kind === 'sam') {
      R = size === 'small' ? 120 : size === 'medium' ? 200 : 300;
      fence(R * 0.95); road(-R, 0, R, 0, 6);
      const nl = 2 + k * 2;
      for (let i = 0; i < nl; i++) { const a = i / nl * Math.PI * 2; const x = Math.cos(a) * R * 0.55, z = Math.sin(a) * R * 0.55;
        b.add(box(4, 1.5, 9), 0x5b6346, [x, 0.8, z], [0, -a, 0]); b.add(zcyl(0.45, 0.45, 9, 8), 0xd8d8d0, [x, 2.8, z], [0.5, -a, 0]); sandbags(x, z, 7); }
      b.add(box(9, 4, 6), 0x4c5240, [0, 2, 0]); b.add(cyl(0.3, 0.3, 10, 5), 0x333333, [0, 9, 0]); b.add(box(8, 4, 0.4), 0x777777, [0, 14, 0], [0.3, 0, 0]);
      for (let i = 0; i < 4; i++) truck(RX() * R * 0.3 + 15, RX() * R * 0.3, rnd() * 6);
      flag(R * 0.3, R * 0.3); ringAA(1 + k, R * 0.8);
    } else {
      if (kind === 'airfield') {
        const rl = RUNWAY[era], grass = era <= 2; R = Math.max(R, rl * 0.5 + 40);
        runway = { x: -R * 0.35, z: 0, len: rl, w: grass ? 60 : 30 };
        b.add(box(runway.w, 0.16, rl), grass ? 0x6f7d4a : 0x4a4a48, [runway.x, 0.08, 0]);
        if (!grass) { b.add(box(1, 0.04, rl * 0.9), 0xdddddd, [runway.x, 0.18, 0]); for (const e of [-1, 1]) for (let s = -3; s <= 3; s++) b.add(box(1.6, 0.04, 22), 0xdddddd, [runway.x + s * 3.6, 0.18, e * (rl / 2 - 20)]);
          b.add(box(15, 0.14, rl * 0.85), 0x55534c, [runway.x + 70, 0.07, 0]); for (const e of [-1, 0, 1]) b.add(box(70, 0.13, 15), 0x55534c, [runway.x + 35, 0.065, e * rl * 0.38]); }
        // apron, hangars, tower
        const ax = runway.x + (grass ? 90 : 160), nh = [0, 1, 3, 6][k];
        if (!grass) b.add(box(110, 0.12, 60 + nh * 50), 0x5a5852, [ax + 20, 0.06, 0]);
        for (let i = 0; i < nh; i++) { const hz = (i - (nh - 1) / 2) * 55;
          if (grass) { b.add(cyl(0.2, 13, 12, 4), [0xb8b09a, 0x9a927c], [ax + 40, 6, hz], [0, Math.PI / 4, 0], [1, 1, 1.4]); }
          else { const hg = new THREE.CylinderGeometry(14, 14, 40, 16, 1, false, -Math.PI / 2, Math.PI); hg.rotateX(Math.PI / 2); hg.rotateZ(Math.PI / 2); b.add(hg, [0x7a7f74, 0x6a6f64], [ax + 60, 0, hz]); b.add(box(0.5, 13, 28), 0x55594f, [ax + 40, 6.5, hz]); } }
        if (era >= 3) { house(ax + 20, -40 - nh * 25, 10, 10, 9, 0xb0a890); b.add(box(8, 3, 8), 0x9fb6c8, [ax + 20, 10.5, -40 - nh * 25]); }
        for (let i = 0; i < 4 + k * 4; i++) { const z = -rl * 0.3 + i * (rl * 0.6 / (4 + k * 4)), x = runway.x + (grass ? 45 : 100); if (era >= 3) revet(x, z, -Math.PI / 2); parked(x, z, -Math.PI / 2, era >= 4 ? 1.2 : 0.9); }
        for (let i = 0; i < k * 2; i++) fuel(ax + 90 + (i % 2) * 18, 60 + Math.floor(i / 2) * 18, 7);
        b.add(cyl(0.08, 0.08, 6, 4), 0xcccccc, [runway.x - 40, 3, rl * 0.4]); b.add(zcyl(0.6, 0.2, 3, 6), 0xff7a1a, [runway.x - 40, 6, rl * 0.4 + 1.5]); // windsock
        for (let i = 0; i < k * 3; i++) house(ax + 110 + RX() * 40, RX() * R * 0.5, 30, 10, 5, [0x8a8070, 0x7a7060], 0);
      }
      if (kind === 'factory') {
        const n = [0, 3, 6, 10][k];
        for (let i = 0; i < n; i++) shed(RX() * R * 0.6, RX() * R * 0.6, 60, 30 + rnd() * 30, 12 + rnd() * 6, rnd() < 0.5 ? 0 : Math.PI / 2);
        for (let i = 0; i < k + 1; i++) { const x = RX() * R * 0.5, z = RX() * R * 0.5; b.add(cyl(2, 3, 40, 10), 0x7b5040, [x, 20, z]); b.add(cyl(2.2, 2.2, 2, 10), 0x5a3020, [x, 39, z]); }
        for (const o of [-3, 3]) b.add(box(0.3, 0.3, R * 1.8), 0x3a3a3a, [-R * 0.8 + o, 0.15, 0]);
        for (let i = 0; i < k * 3; i++) b.add(new THREE.ConeGeometry(8, 6, 8), 0x2a2a2a, [RX() * R * 0.7, 3, RX() * R * 0.7]);
        for (let i = 0; i < k; i++) { const x = RX() * R * 0.5, z = RX() * R * 0.5; b.add(box(1, 30, 1), 0xa08a30, [x, 15, z]); b.add(box(1, 1, 24), 0xa08a30, [x, 30, z + 10]); }
        for (let i = 0; i < k * 3; i++) house(RX() * R * 0.75, RX() * R * 0.75, 25, 15, 8);
        fence(R * 0.92); road(-R, R * 0.2, R, R * 0.2, 8);
      }
      if (kind === 'city') {
        // a street grid with blocks of buildings
        const step = 60, nb = Math.floor(R / step);
        for (let i = -nb; i <= nb; i++) { road(i * step, -R, i * step, R, 9); road(-R, i * step, R, i * step, 9); }
        const hMax = era <= 2 ? 14 : era === 3 ? 22 : 55;
        for (let i = -nb; i < nb; i++) for (let j = -nb; j < nb; j++) {
          const cx = (i + 0.5) * step, cz = (j + 0.5) * step; if (Math.hypot(cx, cz) > R * 0.95) continue;
          if (rnd() < 0.08) { b.add(box(step - 14, 0.1, step - 14), 0x5a7a40, [cx, 0.06, cz]); continue; } // park
          for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) { const h = 6 + rnd() * hMax * (1 - Math.hypot(cx, cz) / R * 0.6); b.add(box(18 + rnd() * 4, h, 18 + rnd() * 4), [rnd() < 0.5 ? 0x9a8e80 : 0xa89c8c, 0x7a6e60], [cx + dx, h / 2, cz + dz]); }
        }
        if (era <= 3) { b.add(box(12, 22, 26), 0xa89c8c, [step * 0.5, 11, step * 0.5]); b.add(cyl(0.01, 5, 18, 4), 0x5a4a3a, [step * 0.5, 31, step * 0.5 - 10], [0, Math.PI / 4, 0]); } // church
      }
      if (kind === 'camp') {
        fence(R * 0.95); road(-R, 0, R, 0, 7); road(0, -R, 0, R, 7);
        const nt = [0, 10, 18, 28][k];
        for (let i = 0; i < nt; i++) { const x = RX() * R * 0.75, z = RX() * R * 0.75; if (Math.abs(x) < 8 || Math.abs(z) < 8) continue; if (era <= 2 || rnd() < 0.5) tent(x, z, 1.4); else house(x, z, 30, 10, 5, [0x7a7458, 0x6a6448], rnd() < 0.5 ? 0 : Math.PI / 2); }
        house(R * 0.15, R * 0.15, 20, 14, 7, 0xa0947c);
        for (let i = 0; i < k * 4; i++) truck(RX() * R * 0.5, -R * 0.4 + RX() * 20, Math.PI / 2);
        if (era >= 2) for (let i = 0; i < k * 3; i++) tankV(R * 0.4 + RX() * 20, RX() * R * 0.4, Math.PI / 2);
        for (let i = 0; i < k * 2; i++) fuel(-R * 0.5 + i * 14, R * 0.45, 5);
        for (let i = 0; i < k * 8; i++) b.add(box(2, 1.2, 1.2), 0x6b5a3a, [-R * 0.45 + RX() * 20, 0.6, -R * 0.45 + RX() * 20]); // ammo dump
      }
      flag(R * 0.1, -R * 0.1);
      ringAA([0, era >= 2 ? 3 : 2, 5, 8][k], R * 0.85);
    }
    const g = new THREE.Group(); g.add(new THREE.Mesh(b.build(), mat('vc')));
    return { group: g, aaSpots: aa, radius: R + 15, water, runway, flat: runway ? Math.max(R + 15, runway.len * 0.8) : R + 15 };
  };
})();
