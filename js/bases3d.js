// ============================================================================
// Ground targets at a realistic scale (replaces the small bases in models.js), built from the props in props.js.
// Returns { group, aaSpots (local, y = gun height for ships), radius (target area), water, runway, flat (radius of
// the levelled ground) }.
// ============================================================================
(() => {
  const { Builder, box, cyl, mat, mulberry, TEAM_COL } = Models;
  const V = THREE.Vector3, P = Props;
  const RUNWAY = [0, 450, 650, 1000, 1500, 1700, 1800, 1800];
  const SIZE_R = { small: 160, medium: 300, big: 480 };
  Models.BASE_R = SIZE_R;
  Models.base = function (kind, size, team, era) {
    const b = new Builder(), tc = TEAM_COL[team], rnd = mulberry(kind.length * 97 + (size === 'big' ? 7 : size === 'medium' ? 3 : 1) * 13 + team * 7 + era);
    const k = size === 'small' ? 1 : size === 'medium' ? 2 : 3, aa = [];
    let R = SIZE_R[size], runway = null;
    const water = kind === 'ship' || kind === 'carrier';
    const RX = () => (rnd() - 0.5) * 2, RA = () => rnd() < 0.5 ? 0 : Math.PI / 2;
    const road = (x1, z1, x2, z2, w) => { const L = Math.hypot(x2 - x1, z2 - z1); b.add(box(w, 0.1, L), 0x55534c, [(x1 + x2) / 2, 0.05, (z1 + z2) / 2], [0, Math.atan2(x2 - x1, z2 - z1), 0]); };
    const rails = (x1, z1, x2, z2) => { const L = Math.hypot(x2 - x1, z2 - z1), r = Math.atan2(x2 - x1, z2 - z1), a = P.at(b, (x1 + x2) / 2, (z1 + z2) / 2, r); a(box(3.4, 0.25, L), 0x6a645a, [0, 0.12, 0]); for (const s of [-0.72, 0.72]) a(box(0.08, 0.14, L), 0x3a3a3a, [s, 0.32, 0]); };
    const fence = r => { const n = Math.round(r / 8); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2; b.add(box(0.15, 2.2, 0.15), 0x5a5a52, [Math.cos(a) * r, 1.1, Math.sin(a) * r]);
      const mx = (Math.cos(a) + Math.cos(a2)) / 2 * r, mz = (Math.sin(a) + Math.sin(a2)) / 2 * r; b.add(box(0.04, 1.6, 2 * Math.PI * r / n), 0x6a6a62, [mx, 1.2, mz], [0, -(a + a2) / 2, 0]); } };
    const sandbags = (x, z, r) => { const t = new THREE.TorusGeometry(r, 0.6, 4, 12); t.rotateX(Math.PI / 2); b.add(t, 0x8a7a5a, [x, 0.5, z]); };
    const flag = (x, z) => { b.add(cyl(0.12, 0.12, 12, 5), 0xcccccc, [x, 6, z]); b.add(box(0.05, 2, 3.2), tc, [x, 10.8, z + 1.6]); };
    const revet = (x, z, rot) => { const a = P.at(b, x, z, rot); for (const [dx, dz, w, d] of [[-9, 0, 2.5, 18], [9, 0, 2.5, 18], [0, 9, 20, 2.5]]) a(P.prof([[-d / 2, 0], [-d / 2 + 1, 3], [d / 2 - 1, 3], [d / 2, 0]], w), 0x6e6046, [dx, 0, dz]); };
    const ringAA = (n, r) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + 0.6; const p = new V(Math.cos(a) * r, 0, Math.sin(a) * r); aa.push(p); sandbags(p.x, p.z, 3.2); } };
    if (kind === 'balloon') {
      // a kite balloon (Caquot type) on its winch lorry, the crew's tents round it
      R = 40;
      const a = P.at(b, 0, 0, 0); P.truck(b, 0, 0, 0, Math.max(2, era)); a(cyl(0.05, 0.05, 260, 3), 0x333333, [0, 130, 0]);
      a(new THREE.SphereGeometry(1, 16, 10), 0xa89a6a, [0, 262, 0], null, [5.5, 5.5, 14]);
      for (let i = 0; i < 3; i++) { const t = i / 3 * Math.PI * 2 + Math.PI / 2; a(new THREE.SphereGeometry(1, 10, 6), 0x9a8c5e, [Math.cos(t) * 4, 262 + Math.sin(t) * 4, 11], null, [1.6, 1.6, 4]); }
      a(box(1.5, 1.2, 1.5), 0x4a3a2a, [0, 253, 0]);
      for (let i = 0; i < 4; i++) P.tent(b, RX() * 25, RX() * 25, rnd() * 3, 1); flag(-10, 4); aa.push(new V(15, 0, 12)); sandbags(15, 12, 3);
    } else if (water) {
      // ships at their real size and of their era: destroyer / cruiser / battleship (frigate / destroyer from the Cold
      // War on); escort or fleet carrier (an angled deck on jet-age carriers)
      const s = P.warship(b, kind, kind === 'carrier' ? (size === 'big' ? 3 : 2) : k, era, tc);
      R = s.L / 2;
      const n = kind === 'carrier' ? 8 : [0, 3, 5, 8][k];
      for (let i = 0; i < n; i++) aa.push(new V((i % 2 ? 1 : -1) * s.B * 0.4, s.F + 1, (i / (n - 1 || 1) - 0.5) * s.L * 0.75));
    } else if (kind === 'sam') {
      R = size === 'small' ? 120 : size === 'medium' ? 200 : 300;
      fence(R * 0.95);
      if (era <= 5) { // SA-2 site: six launchers on a ring, roads to each from the radar in the middle (the "star")
        for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2, x = Math.cos(t) * R * 0.55, z = Math.sin(t) * R * 0.55; road(0, 0, x, z, 5); P.sa2(b, x, z, -t + Math.PI / 2); }
        P.radarVan(b, 0, 0, 0, era); P.radarVan(b, 8, 10, 1.2, era);
      } else { // 2K12 Kub battery: tracked launchers round the fire-control radar vehicle
        road(-R, 0, R, 0, 6); const nl = 2 + k * 2;
        for (let i = 0; i < nl; i++) { const t = i / nl * Math.PI * 2, x = Math.cos(t) * R * 0.55, z = Math.sin(t) * R * 0.55; P.kub(b, x, z, -t - Math.PI / 2, era, tc); sandbags(x, z, 7); }
        P.radarVan(b, 0, 0, 0.3, era);
      }
      for (let i = 0; i < 4; i++) P.truck(b, RX() * R * 0.3 + 15, RX() * R * 0.3, rnd() * 6, era);
      flag(R * 0.3, R * 0.3); ringAA(1 + k, R * 0.8);
    } else {
      if (kind === 'airfield') {
        const rl = RUNWAY[era], grass = era <= 2; R = Math.max(R, rl * 0.5 + 40);
        runway = { x: -R * 0.35, z: 0, len: rl, w: grass ? 60 : 30 };
        b.add(box(runway.w, 0.16, rl), grass ? 0x6f7d4a : 0x4a4a48, [runway.x, 0.08, 0]);
        if (!grass) { b.add(box(1, 0.04, rl * 0.9), 0xdddddd, [runway.x, 0.18, 0]); for (const e of [-1, 1]) for (let s = -3; s <= 3; s++) b.add(box(1.6, 0.04, 22), 0xdddddd, [runway.x + s * 3.6, 0.18, e * (rl / 2 - 20)]);
          for (const e of [-1, 1]) for (const s of [-1, 1]) b.add(box(4, 0.04, 30), 0xdddddd, [runway.x + s * 7, 0.18, e * (rl / 2 - 160)]); // touchdown zone
          b.add(box(15, 0.14, rl * 0.85), 0x55534c, [runway.x + 70, 0.07, 0]); b.add(box(0.3, 0.16, rl * 0.85), 0xd8c040, [runway.x + 70, 0.1, 0]);
          for (const e of [-1, 0, 1]) b.add(box(70, 0.13, 15), 0x55534c, [runway.x + 35, 0.065, e * rl * 0.38]); }
        // apron, hangars (canvas in WW1, arched steel later, hardened shelters for jets), tower
        const ax = runway.x + (grass ? 90 : 160), nh = [0, 1, 3, 6][k];
        if (!grass) b.add(box(110, 0.12, 60 + nh * 50), 0x5a5852, [ax + 20, 0.06, 0]);
        for (let i = 0; i < nh; i++) { const hz = (i - (nh - 1) / 2) * 55;
          if (grass) { const a = P.at(b, ax + 40, hz, 0); a(P.gable(22, 10, 26), [0xb8b09a, 0x9a927c]); a(box(22, 0.2, 26), 0x8a826c, [0, 0.1, 0]); }
          else { P.at(b, ax + 60, hz, Math.PI / 2)(P.arch(14, 40, 18), 0x7a7f74); b.add(box(0.5, 13, 28), 0x55594f, [ax + 40, 6.5, hz]); } }
        if (era >= 3) P.tower(b, ax + 20, -40 - nh * 25, 0, era);
        for (let i = 0; i < 4 + k * 4; i++) { const z = -rl * 0.3 + i * (rl * 0.6 / (4 + k * 4)), x = runway.x + (grass ? 45 : 100);
          if (era >= 5) P.shelter(b, x + 10, z, Math.PI / 2); else { if (era >= 3) revet(x, z, -Math.PI / 2); P.parkedPlane(b, x, z, -Math.PI / 2, era, era >= 4 ? 1.2 : 0.9); } }
        for (let i = 0; i < k * 2; i++) P.storage(b, ax + 90 + (i % 2) * 18, 60 + Math.floor(i / 2) * 18, 7);
        b.add(cyl(0.08, 0.08, 6, 4), 0xcccccc, [runway.x - 40, 3, rl * 0.4]); b.add(Models.zcyl(0.6, 0.2, 3, 6), 0xff7a1a, [runway.x - 40, 6, rl * 0.4 + 1.5]); // windsock
        for (let i = 0; i < k * 3; i++) P.house(b, ax + 110 + RX() * 40, RX() * R * 0.5, 0, 10, 30, 5, { wall: 0x8a8070 });
        for (let i = 0; i < k * 2; i++) P.truck(b, ax + 70 + RX() * 20, RX() * 80, rnd() * 6, era);
      }
      if (kind === 'factory') {
        const n = [0, 3, 6, 10][k];
        for (let i = 0; i < n; i++) P.hall(b, RX() * R * 0.6, RX() * R * 0.6, RA(), 50 + rnd() * 20, 40 + rnd() * 30, 10 + rnd() * 5);
        for (let i = 0; i < k + 1; i++) P.chimney(b, RX() * R * 0.5, RX() * R * 0.5, 34 + rnd() * 16);
        P.waterTower(b, R * 0.55, -R * 0.5); if (k >= 2) P.gasholder(b, -R * 0.55, R * 0.55, 16);
        rails(-R * 0.9, -R * 0.75, R * 0.9, -R * 0.75); rails(-R * 0.9, -R * 0.75 + 6, R * 0.6, -R * 0.75 + 6);
        for (let i = 0; i < k * 3; i++) b.add(new THREE.ConeGeometry(8, 6, 8), 0x2a2a2a, [RX() * R * 0.7, 3, -R * 0.6 + RX() * 15]); // coal
        for (let i = 0; i < k; i++) { const a = P.at(b, RX() * R * 0.4, -R * 0.68, 0); for (const s of [-1, 1]) a(box(0.8, 16, 0.8), 0xa08a30, [s * 9, 8, 0]); a(box(20, 1.2, 1.2), 0xa08a30, [0, 16, 0]); } // gantry cranes
        for (let i = 0; i < k * 3; i++) P.house(b, RX() * R * 0.75, RX() * R * 0.75, RA(), 14, 22, 8);
        fence(R * 0.92); road(-R, R * 0.2, R, R * 0.2, 8);
      }
      if (kind === 'city') {
        // a street grid with blocks of buildings: pitched roofs on low ones, flat roofs on tall ones
        const step = 60, nb = Math.floor(R / step);
        for (let i = -nb; i <= nb; i++) { road(i * step, -R, i * step, R, 9); road(-R, i * step, R, i * step, 9); }
        const hMax = era <= 2 ? 14 : era === 3 ? 22 : 55;
        for (let i = -nb; i < nb; i++) for (let j = -nb; j < nb; j++) {
          const cx = (i + 0.5) * step, cz = (j + 0.5) * step; if (Math.hypot(cx, cz) > R * 0.95) continue;
          if (rnd() < 0.08) { b.add(box(step - 14, 0.1, step - 14), 0x5a7a40, [cx, 0.06, cz]); continue; } // park
          for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) { const h = 6 + rnd() * hMax * (1 - Math.hypot(cx, cz) / R * 0.6);
            P.house(b, cx + dx, cz + dz, 0, 18 + rnd() * 4, 18 + rnd() * 4, h, { wall: rnd() < 0.5 ? 0x9a8e80 : 0xa89c8c, flat: h > 16, chimney: false }); }
        }
        if (era <= 3) { const a = P.at(b, step * 0.5, step * 0.5, 0); a(box(12, 22, 26), 0xa89c8c, [0, 11, 0]); a(P.gable(13, 7, 27), 0x5a4a3a, [0, 22, 0]); a(box(7, 30, 7), 0xa89c8c, [0, 15, -14]); a(new THREE.ConeGeometry(5, 16, 4), 0x5a4a3a, [0, 38, -14], [0, Math.PI / 4, 0]); } // church
      }
      if (kind === 'camp') {
        fence(R * 0.95); road(-R, 0, R, 0, 7); road(0, -R, 0, R, 7);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.watchtower(b, sx * R * 0.66, sz * R * 0.66);
        const nt = [0, 10, 18, 28][k];
        for (let i = 0; i < nt; i++) { const x = RX() * R * 0.75, z = RX() * R * 0.75; if (Math.abs(x) < 12 || Math.abs(z) < 12) continue; if (era <= 1 || (era === 2 && rnd() < 0.6)) P.tent(b, x, z, rnd() * 3, 1.4); else P.hut(b, x, z, RA(), era); }
        P.house(b, R * 0.15, R * 0.15, 0, 14, 20, 7, { wall: 0xa0947c }); // headquarters
        for (let i = 0; i < k * 4; i++) P.truck(b, RX() * R * 0.5, -R * 0.4 + RX() * 20, Math.PI / 2, era);
        if (era >= 2) for (let i = 0; i < k * 3; i++) P.tankAt(b, R * 0.4 + RX() * 20, RX() * R * 0.4, Math.PI / 2, era, tc);
        for (let i = 0; i < k * 2; i++) P.storage(b, -R * 0.5 + i * 14, R * 0.45, 5);
        for (let i = 0; i < k * 8; i++) b.add(box(2, 1.2, 1.2), 0x6b5a3a, [-R * 0.45 + RX() * 20, 0.6, -R * 0.45 + RX() * 20]); // ammo dump
      }
      flag(R * 0.1, -R * 0.1);
      ringAA([0, era >= 2 ? 3 : 2, 5, 8][k], R * 0.85);
    }
    const g = new THREE.Group(); g.add(new THREE.Mesh(b.build(), mat('vc')));
    return { group: g, aaSpots: aa, radius: R + 15, water, runway, flat: runway ? Math.max(R + 15, runway.len * 0.8) : R + 15 };
  };
})();
