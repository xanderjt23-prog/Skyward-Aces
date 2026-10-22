// ============================================================================
// World: heightmap terrain (flattened under bases), sea, sky dome, clouds, trees.
// Team 0 holds the south half (+Z), team 1 the north half (-Z).
// ============================================================================
const World = (() => {
  const MAPS = {
    land:    { name: 'Countryside', sea: 0.0, low: 0x5f7a3a, mid: 0x6f7f45, high: 0x7d7768, peak: 0xe8eef0, sand: 0xb8a878, sky: [0x7fa8d8, 0xcfe0ee], trees: 0x2f4a24 },
    coast:   { name: 'Coastline', sea: 0.4, low: 0x62803d, mid: 0x6c7a43, high: 0x7d7768, peak: 0xe8eef0, sand: 0xcdbb88, sky: [0x7aa6dc, 0xd2e2ef], trees: 0x2f4a24 },
    islands: { name: 'Pacific Islands', sea: 0.8, low: 0x4f8a3a, mid: 0x5c7e3c, high: 0x6f6a58, peak: 0x8a8370, sand: 0xe0d09a, sky: [0x5d9be0, 0xd9ecf7], trees: 0x2b5a26 },
    desert:  { name: 'Desert', sea: 0.0, low: 0xc9a86a, mid: 0xbf9a5c, high: 0xa88660, peak: 0x9a7a5a, sand: 0xd8bc84, sky: [0x86aee0, 0xeee2c8], trees: 0 },
    snow:    { name: 'Winter', sea: 0.15, low: 0xdfe6ea, mid: 0xc9d2d6, high: 0x8f9396, peak: 0xf4f7f9, sand: 0xb7b9b0, sky: [0x8eaacb, 0xdde6ee], trees: 0x2a3b2c },
    alps:    { name: 'Alpine Valleys', sea: 0, snowLine: 1700, low: 0x58763a, mid: 0x5d6b45, high: 0x7a756c, peak: 0xf2f5f8, sand: 0x8a8a70, sky: [0x6f9fd8, 0xd6e4f0], trees: 0x26402a },
    canyon:  { name: 'Canyonlands', sea: 0, snowLine: 1400, low: 0xb8754a, mid: 0xa45f3c, high: 0xc9905e, peak: 0xd8b088, sand: 0xc9a070, sky: [0x7fa9de, 0xf0dcc0], trees: 0 },
    farmland:{ name: 'Farmland', sea: 0, low: 0x7d9a45, mid: 0x8f9a50, high: 0x7d7768, peak: 0xcfd6d0, sand: 0xb0a070, sky: [0x80aade, 0xd8e6f0], trees: 0x34502a, fields: true },
    jungle:  { name: 'Jungle Rivers', sea: 0.2, low: 0x2f6b2a, mid: 0x3a6a2c, high: 0x52603e, peak: 0x6b6a52, sand: 0xa89a6a, sky: [0x6aa2d8, 0xdfeee8], trees: 0x1e4a1c },
    arctic:  { name: 'Arctic Sea', sea: 0.85, low: 0xe8eff3, mid: 0xd6e2ea, high: 0xb8c4cc, peak: 0xf8fbfc, sand: 0xc8d4da, sky: [0x8fb0d0, 0xe4ecf2], trees: 0, seaCol: 0x2f4f66 },
  };
  // map sizes: multiplier on the era's battle area
  const SIZES = { small: { name: 'Small', mul: 0.7 }, medium: { name: 'Medium', mul: 1 }, large: { name: 'Large', mul: 1.5 }, massive: { name: 'Massive (4x)', mul: 4 } };
  // weather: cloud cover, visibility (fog as a fraction of the map), light, precipitation, turbulence
  const WEATHER = {
    clear:     { name: 'Clear', clouds: 20, cloudOp: 0.7, cloudCol: 0xffffff, fog: [0.5, 2.6], light: 1, skyMul: 1, precip: null, turb: 0 },
    scattered: { name: 'Scattered clouds', clouds: 70, cloudOp: 0.8, cloudCol: 0xffffff, fog: [0.35, 2.2], light: 1, skyMul: 1, precip: null, turb: 0.15 },
    overcast:  { name: 'Overcast', clouds: 170, cloudOp: 0.95, cloudCol: 0xb8bec6, fog: [0.25, 1.5], light: 0.62, skyMul: 0.72, gray: 0.7, precip: null, turb: 0.3, low: true },
    rain:      { name: 'Rain', clouds: 190, cloudOp: 0.95, cloudCol: 0x8e959e, fog: [0.08, 0.75], light: 0.5, skyMul: 0.6, gray: 0.85, precip: 'rain', turb: 0.6, low: true },
    storm:     { name: 'Thunderstorm', clouds: 220, cloudOp: 1, cloudCol: 0x5f6670, fog: [0.05, 0.55], light: 0.33, skyMul: 0.4, gray: 0.95, precip: 'storm', turb: 1.5, low: true, lightning: true },
    snow:      { name: 'Snowfall', clouds: 180, cloudOp: 0.95, cloudCol: 0xc8ced6, fog: [0.06, 0.6], light: 0.6, skyMul: 0.75, gray: 0.8, precip: 'snow', turb: 0.4, low: true },
    fog:       { name: 'Fog', clouds: 40, cloudOp: 0.6, cloudCol: 0xdde3e8, fog: [0.01, 0.25], light: 0.75, skyMul: 0.9, gray: 0.9, precip: null, turb: 0.1 },
  };
  // ---- value noise
  function hash(x, z, s) { let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, z, s) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z, s, oct) { let t = 0, amp = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { t += vnoise(x * f, z * f, s + i * 17) * amp; n += amp; amp *= 0.5; f *= 2.03; } return t / n; }

  let W = null; // current world
  const CH = 64; // terrain chunk size in cells
  // the terrain height before bases are levelled into it (also used by the battle planner to place bases)
  function rawHeight(opt, x, z) {
    const half = opt.half, seed = opt.seed || 1;
      const nx = x / 4200, nz = z / 4200;
      let h = fbm(nx, nz, seed, 5);
      let base;
      if (opt.map === 'islands') base = (h - 0.56) * 900 + fbm(nx * 3, nz * 3, seed + 5, 3) * 120;
      else if (opt.map === 'coast') { const coast = (x / half) * 1.2 + (fbm(nx * 0.5, nz * 0.5, seed + 9, 3) - 0.5) * 1.4; base = 40 + (h - 0.35) * 700 - Math.max(0, coast) * 380; }
      else if (opt.map === 'desert') base = 30 + h * 260 + Math.abs(Math.sin(x / 260 + fbm(nx * 4, nz * 4, seed, 2) * 6)) * 18;
      else if (opt.map === 'alps') { const r = 1 - Math.abs(fbm(nx * 0.9, nz * 0.9, seed + 3, 5) * 2 - 1); base = 120 + Math.pow(r, 2.4) * 2400 + h * 300; } // ridged mountains, deep valleys
      else if (opt.map === 'canyon') { const t = 40 + h * 900, step = 110; base = Math.floor(t / step) * step + Math.pow((t % step) / step, 6) * step; const cut = Math.abs(fbm(nx * 1.6, nz * 1.6, seed + 11, 3) - 0.5); if (cut < 0.04) base -= (0.04 - cut) * 6000; base = Math.max(25, base); } // mesas and gorges
      else if (opt.map === 'farmland') base = 20 + h * 140 + Math.pow(Math.max(0, fbm(nx * 0.5, nz * 0.5, seed + 2, 3) - 0.6), 2) * 3000;
      else if (opt.map === 'jungle') { const river = Math.abs(fbm(nx * 0.7, nz * 0.7, seed + 21, 4) - 0.5); base = 25 + h * 420 - (river < 0.03 ? (0.03 - river) * 2600 : 0); }
      else if (opt.map === 'arctic') base = (h - 0.6) * 500 + fbm(nx * 4, nz * 4, seed + 5, 2) * 40;
      else base = 30 + Math.pow(h, 2.2) * 1100;
      // mountains towards the map edges frame the battlefield
      const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
      if (edge > 0.95 && opt.map !== 'islands' && opt.map !== 'arctic') base += (edge - 0.95) * 1800 * h;
      return base;
  }
  function create(scene, opt) {
    const map = MAPS[opt.map] || MAPS.land, half = opt.half, seed = opt.seed || 1, sites = opt.sites || [];
    // terrain covers 1.3x the play area, at least 256 cells across and no coarser than ~140 m a cell (big maps get more)
    const N = Math.max(256, Math.ceil(half * 2.6 / 140 / CH) * CH), cell = (half * 2.6) / N, origin = -half * 1.3;
    const H = new Float32Array((N + 1) * (N + 1));
    const raw = (x, z) => rawHeight(opt, x, z);
    // each base sits on one level pad: its height is fixed from the terrain at its centre
    for (const st of sites) st.level = st.water ? -25 : Math.max(18, Math.min(raw(st.x, st.z), 160));
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = origin + i * cell, z = origin + j * cell; let h = raw(x, z);
      // flatten land bases, deepen water bases: each point follows the one base that matters most there (so one base's
      // blend never tilts another's level pad; where two pads overlap, the closer base wins). The pad reaches at least 1.5
      // terrain cells past the base, so the grid points either side of its edge are both level.
      let bs = 0, bk = 0, bt = 0;
      for (const s of sites) { const d = Math.hypot(x - s.x, z - s.z), r0 = Math.max(s.radius * 1.2, s.radius + cell * 1.5), r1 = r0 + Math.max(s.radius * 1.4, cell * 2);
        if (d < r1) { const u = (r1 - d) / (r1 - r0); if (u > bs) { const t = Math.min(1, u); bs = u; bk = t * t * (3 - 2 * t); bt = s.level; } } }
      if (bk > 0) h = h * (1 - bk) + bt * bk;
      H[j * (N + 1) + i] = h;
    }
    function heightAt(x, z) {
      const fx = (x - origin) / cell, fz = (z - origin) / cell;
      if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -30;
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, r = N + 1;
      const a = H[j * r + i], b = H[j * r + i + 1], c = H[(j + 1) * r + i], d = H[(j + 1) * r + i + 1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    const groundAt = (x, z) => Math.max(0, heightAt(x, z)); // the sea surface is solid ground for aircraft
    // ---- terrain mesh: chunks of 64 x 64 cells, each with three levels of detail (every cell near the camera, every 4th
    // and 16th further out); a skirt hangs from every chunk's edge so the joins between levels never show a gap.
    // Normals come from the heightfield itself, so the shading runs on smoothly across chunks.
    const cs = { low: new THREE.Color(map.low), mid: new THREE.Color(map.mid), high: new THREE.Color(map.high), peak: new THREE.Color(map.peak), sand: new THREE.Color(map.sand) }, c = new THREE.Color();
    const Hc = (i, j) => H[Math.max(0, Math.min(N, j)) * (N + 1) + Math.max(0, Math.min(N, i))];
    const colour = (i, j, out, k) => {
      const h = Hc(i, j), x = origin + i * cell, z = origin + j * cell, n = hash(i, j, 3) * 0.08, hs = h * 600 / (map.snowLine || 600);
      if (h < 8) c.copy(cs.sand); else if (hs < 200) c.copy(cs.low).lerp(cs.mid, hs / 200); else if (hs < 600) c.copy(cs.mid).lerp(cs.high, (hs - 200) / 400); else c.copy(cs.high).lerp(cs.peak, Math.min(1, (hs - 600) / 300));
      if (map.fields && h > 8 && h < 300) { const fx = Math.floor(x / 380 + fbm(x / 3000, z / 3000, seed, 1)), fz = Math.floor(z / 260); const fh = hash(fx, fz, 7); c.offsetHSL((fh - 0.5) * 0.06, (fh - 0.5) * 0.25, (hash(fx, fz, 9) - 0.5) * 0.12); }
      c.offsetHSL(0, 0, n - 0.04); out[k] = c.r; out[k + 1] = c.g; out[k + 2] = c.b;
    };
    const tmat = new THREE.MeshLambertMaterial({ vertexColors: true });
    function chunk(ci, cj, step) {
      const n = CH / step + 1, i0 = ci * CH, j0 = cj * CH, cnt = n * n + 4 * n;
      const P = new Float32Array(cnt * 3), Nn = new Float32Array(cnt * 3), C = new Float32Array(cnt * 3), idx = [];
      const put = (k, i, j, drop) => { P[k * 3] = origin + i * cell; P[k * 3 + 1] = Hc(i, j) - drop; P[k * 3 + 2] = origin + j * cell;
        const dx = (Hc(i + step, j) - Hc(i - step, j)) / (2 * step * cell), dz = (Hc(i, j + step) - Hc(i, j - step)) / (2 * step * cell), l = Math.hypot(dx, 1, dz);
        Nn[k * 3] = -dx / l; Nn[k * 3 + 1] = 1 / l; Nn[k * 3 + 2] = -dz / l; colour(i, j, C, k * 3); };
      for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) put(b * n + a, i0 + a * step, j0 + b * step, 0);
      for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) { const q = b * n + a; idx.push(q, q + n, q + 1, q + 1, q + n, q + n + 1); }
      // skirts: along the four edges, a strip 60 m (plus the level's coarseness) down
      const drop = 60 + step * cell * 0.15, edges = [[a => a, () => 0], [a => a, () => n - 1], [() => 0, b => b], [() => n - 1, b => b]];
      edges.forEach(([fa, fb], e) => { const base = n * n + e * n;
        for (let t = 0; t < n; t++) { const a = fa(t), b = fb(t); put(base + t, i0 + a * step, j0 + b * step, drop); }
        for (let t = 0; t < n - 1; t++) { const top0 = fb(t) * n + fa(t), top1 = fb(t + 1) * n + fa(t + 1), s0 = base + t, s1 = base + t + 1; idx.push(top0, s0, top1, top1, s0, s1, top0, top1, s0, top1, s1, s0); } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
      g.setIndex(idx); g.computeBoundingSphere(); return new THREE.Mesh(g, tmat);
    }
    const terrain = new THREE.Group(), span = CH * cell;
    for (let cj = 0; cj < N / CH; cj++) for (let ci = 0; ci < N / CH; ci++) {
      const lod = new THREE.LOD(); lod.position.set(0, 0, 0);
      lod.addLevel(chunk(ci, cj, 1), 0); lod.addLevel(chunk(ci, cj, 4), span * 1.6); lod.addLevel(chunk(ci, cj, 16), span * 5);
      // LOD distances are measured to the LOD object's position: put it at the chunk centre (geometry stays in world space)
      const cx0 = origin + (ci + 0.5) * span, cz0 = origin + (cj + 0.5) * span; lod.position.set(cx0, 0, cz0); for (const l of lod.levels) l.object.position.set(-cx0, 0, -cz0);
      terrain.add(lod);
    }
    const group = new THREE.Group(); group.add(terrain);
    // ---- sea
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(half * 12, half * 12), new THREE.MeshPhongMaterial({ color: map.seaCol || (opt.map === 'islands' ? 0x1f6f95 : opt.map === 'jungle' ? 0x3d5a3a : 0x2a5a78), shininess: 80, specular: 0x557788 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0; group.add(sea);
    // ---- sky dome
    const wx = WEATHER[opt.weather] || WEATHER.scattered, night = !!opt.night;
    const skyTop = new THREE.Color(map.sky[0]), skyHor = new THREE.Color(map.sky[1]), grey = new THREE.Color(0x9aa2ab);
    if (wx.gray) { skyTop.lerp(grey, wx.gray); skyHor.lerp(grey.clone().offsetHSL(0, 0, 0.08), wx.gray * 0.8); }
    skyTop.multiplyScalar(wx.skyMul); skyHor.multiplyScalar(Math.min(1, wx.skyMul + 0.15));
    if (night) { skyTop.setHex(0x050a18).multiplyScalar(wx.gray ? 0.6 : 1); skyHor.setHex(0x101a2e).multiplyScalar(wx.gray ? 0.7 : 1); }
    const skyGeo = new THREE.SphereGeometry(Math.min(half * 5, 100000), 24, 12); // inside the camera's far plane
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { top: { value: skyTop }, hor: { value: skyHor } },
      vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vp; void main(){ float t = clamp(vp.y*1.6,0.0,1.0); gl_FragColor = vec4(mix(hor, top, pow(t,0.7)),1.0); }' });
    const sky = new THREE.Mesh(skyGeo, skyMat); sky.renderOrder = -1; group.add(sky);
    // ---- clouds (big soft sprites)
    const cc = document.createElement('canvas'); cc.width = cc.height = 128; const cx = cc.getContext('2d');
    const gr = cx.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(250,250,252,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    const ctex = new THREE.CanvasTexture(cc);
    const cloudN = Math.round(wx.clouds * Math.max(0.6, half / 6000) * Math.min(4, Math.max(1, half / 14000))), cp = [], rnd = Models.mulberry(seed * 31 + 7);
    for (let i = 0; i < cloudN; i++) { const x = (rnd() - 0.5) * half * 2.4, z = (rnd() - 0.5) * half * 2.4, y = (wx.low ? 550 : 900) + rnd() * (wx.low ? 900 : 1600); const n = 5 + Math.floor(rnd() * 6);
      for (let k = 0; k < n; k++) cp.push(x + (rnd() - 0.5) * 500, y + (rnd() - 0.5) * 90, z + (rnd() - 0.5) * 500); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    const cloudCol = new THREE.Color(wx.cloudCol); if (night) cloudCol.multiplyScalar(0.18);
    const clouds = new THREE.Points(cg, new THREE.PointsMaterial({ map: ctex, size: wx.low ? 650 : 520, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: wx.cloudOp, fog: true, color: cloudCol }));
    group.add(clouds);
    // ---- trees (instanced cones)
    if (map.trees) {
      const tg = new THREE.ConeGeometry(4, 14, 5); tg.translate(0, 7, 0);
      const tm = new THREE.MeshLambertMaterial({ color: map.trees }), count = Math.round(Math.min(30000, 3500 * Math.max(1, (half / 14000) ** 2)));
      const inst = new THREE.InstancedMesh(tg, tm, count); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      let n = 0;
      for (let t = 0; t < count * 4 && n < count; t++) {
        const cxp = (rnd() - 0.5) * half * 2, czp = (rnd() - 0.5) * half * 2;
        if (fbm(cxp / 900, czp / 900, seed + 40, 2) < 0.52) continue;
        const h = heightAt(cxp, czp); if (h < 12 || h > 650) continue;
        if (sites.some(st => Math.hypot(st.x - cxp, st.z - czp) < st.radius * 1.4)) continue;
        const k = 0.7 + rnd() * 0.8; s.set(k, k, k); m.compose(new THREE.Vector3(cxp, h - 1, czp), q, s); inst.setMatrixAt(n++, m);
      }
      inst.count = n; group.add(inst);
    }
    // stars on clear-ish nights
    if (night && !wx.precip && wx.clouds < 100) {
      const sp = []; for (let i = 0; i < 1800; i++) { const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.min(half * 4.5, 90000), y = Math.abs(u); const k = Math.sqrt(1 - y * y); sp.push(Math.cos(th) * k * r, y * r * 0.9 + 200, Math.sin(th) * k * r); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, depthTest: false, transparent: true, opacity: 0.85 })));
    }
    // falling rain / snow in a box around the camera
    let precip = null;
    if (wx.precip) {
      const snow = wx.precip === 'snow', n = wx.precip === 'storm' ? 7000 : 5000, per = snow ? 1 : 2, ppos = new Float32Array(n * 3 * per), streak = wx.precip === 'storm' ? 2.2 : 1.5;
      for (let i = 0; i < n; i++) { const x = (rnd() - 0.5) * 320, y = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 320; ppos.set(snow ? [x, y, z] : [x, y, z, x + 0.15, y - streak, z], i * 3 * per); }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
      let pts;
      if (snow) { const fc = document.createElement('canvas'); fc.width = fc.height = 32; const fx = fc.getContext('2d'), fg = fx.createRadialGradient(16, 16, 0, 16, 16, 16); fg.addColorStop(0, 'rgba(255,255,255,1)'); fg.addColorStop(1, 'rgba(255,255,255,0)'); fx.fillStyle = fg; fx.fillRect(0, 0, 32, 32);
        pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(fc), color: 0xffffff, size: 0.45, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false })); }
      else pts = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: night ? 0x56606c : 0x9aa6b4, transparent: true, opacity: 0.45, depthWrite: false }));
      pts.frustumCulled = false; group.add(pts);
      precip = { pts, fall: snow ? 3 : wx.precip === 'storm' ? 18 : 12, drift: snow ? 2 : 1, per };
    }
    // lights: daylight, overcast gloom or moonlight
    const L = opt.lights;
    if (L) {
      const k = wx.light * (night ? 0.42 : 1);
      L.hemi.intensity = 0.75 * k; L.sun.intensity = 0.95 * k * (wx.gray ? 0.6 : 1);
      L.hemi.color.setHex(night ? 0x8090c0 : 0xdfeeff); L.sun.color.setHex(night ? 0xa8b8e8 : wx.gray ? 0xe0e4ea : 0xfff4e0);
    }
    scene.add(group);
    const vis = Math.min(half, 16000); // what the fog scales with: the battle area, but never beyond ~40 km of clear-day visibility
    scene.fog = new THREE.Fog(skyHor.clone(), vis * wx.fog[0], vis * wx.fog[1] * (night ? 0.8 : 1));
    let t = 0, nextFlash = 6 + Math.random() * 10, flash = 0, gustT = 0;
    const gust = new THREE.Vector3();
    W = { group, heightAt, groundAt, half, map, mapId: opt.map, sky, clouds, weather: wx, night, turb: wx.turb, gust,
      // per frame: precipitation follows the camera, lightning flashes, turbulence gusts change
      update(dt, cam) {
        t += dt;
        if (precip && cam) {
          const a = precip.pts.geometry.attributes.position, arr = a.array;
          const st = 3 * precip.per;
          for (let i = 0; i < arr.length; i += st) { const dy = precip.fall * dt, dx = Math.sin(i + t) * precip.drift * dt * 0.3; let wrap = arr[i + 1] - dy < -110 ? 220 : 0;
            for (let k = 0; k < st; k += 3) { arr[i + k + 1] += wrap - dy; arr[i + k] += dx; } }
          a.needsUpdate = true; precip.pts.position.copy(cam);
        }
        if (wx.lightning && L) {
          nextFlash -= dt;
          if (nextFlash <= 0) { nextFlash = 5 + Math.random() * 14; flash = 0.25; if (cam) Sound.boom(2.5, cam.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6000, 1500, (Math.random() - 0.5) * 6000))); }
          if (flash > 0) flash -= dt;
          L.hemi.intensity = 0.75 * wx.light * (night ? 0.42 : 1) + (flash > 0 ? 1.6 * Math.random() : 0);
        }
        gustT -= dt; if (gustT <= 0) { gustT = 0.4 + Math.random() * 1.2; gust.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2).multiplyScalar(wx.turb * 4); }
      },
      dispose() { scene.remove(group); group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); if (L) { L.hemi.intensity = 0.75; L.sun.intensity = 0.95; L.hemi.color.setHex(0xdfeeff); L.sun.color.setHex(0xfff4e0); } } };
    return W;
  }
  // can a base go here? water bases need sea, land bases need land (checked against raw noise before flattening)
  return { create, rawHeight, MAPS, SIZES, WEATHER, fbm, get current() { return W; } };
})();
