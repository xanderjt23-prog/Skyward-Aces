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
  function create(scene, opt) {
    const map = MAPS[opt.map] || MAPS.land, half = opt.half, seed = opt.seed || 1, sites = opt.sites || [];
    const N = 256, cell = (half * 2.6) / N, origin = -half * 1.3; // terrain covers 1.3x the play area
    const H = new Float32Array((N + 1) * (N + 1));
    const raw = (x, z) => {
      const nx = x / 4200, nz = z / 4200;
      let h = fbm(nx, nz, seed, 5);
      let base;
      if (opt.map === 'islands') base = (h - 0.56) * 900 + fbm(nx * 3, nz * 3, seed + 5, 3) * 120;
      else if (opt.map === 'coast') { const coast = (x / half) * 1.2 + (fbm(nx * 0.5, nz * 0.5, seed + 9, 3) - 0.5) * 1.4; base = 40 + (h - 0.35) * 700 - Math.max(0, coast) * 380; }
      else if (opt.map === 'desert') base = 30 + h * 260 + Math.abs(Math.sin(x / 260 + fbm(nx * 4, nz * 4, seed, 2) * 6)) * 18;
      else base = 30 + Math.pow(h, 2.2) * 1100;
      // mountains towards the map edges frame the battlefield
      const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
      if (edge > 0.95 && opt.map !== 'islands') base += (edge - 0.95) * 1800 * h;
      return base;
    };
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = origin + i * cell, z = origin + j * cell; let h = raw(x, z);
      for (const s of sites) { // flatten land bases, deepen water bases
        const d = Math.hypot(x - s.x, z - s.z), r0 = s.radius * 1.2, r1 = s.radius * 2.6;
        if (d < r1) { const t = d < r0 ? 1 : 1 - (d - r0) / (r1 - r0), k = t * t * (3 - 2 * t), target = s.water ? -25 : Math.max(18, Math.min(h, 160)); h = h * (1 - k) + target * k; }
      }
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
    // ---- terrain mesh
    const geo = new THREE.PlaneGeometry(half * 2.6, half * 2.6, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color(), cs = { low: new THREE.Color(map.low), mid: new THREE.Color(map.mid), high: new THREE.Color(map.high), peak: new THREE.Color(map.peak), sand: new THREE.Color(map.sand) };
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k), i = Math.round((x - origin) / cell), j = Math.round((z - origin) / cell), h = H[j * (N + 1) + i];
      pos.setY(k, h);
      const n = hash(i, j, 3) * 0.08;
      if (h < 8) c.copy(cs.sand); else if (h < 200) c.copy(cs.low).lerp(cs.mid, h / 200); else if (h < 600) c.copy(cs.mid).lerp(cs.high, (h - 200) / 400); else c.copy(cs.high).lerp(cs.peak, Math.min(1, (h - 600) / 300));
      c.offsetHSL(0, 0, n - 0.04); cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    const group = new THREE.Group(); group.add(terrain);
    // ---- sea
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(half * 12, half * 12), new THREE.MeshPhongMaterial({ color: opt.map === 'islands' ? 0x1f6f95 : 0x2a5a78, shininess: 80, specular: 0x557788 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0; group.add(sea);
    // ---- sky dome
    const skyGeo = new THREE.SphereGeometry(half * 5, 24, 12);
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(map.sky[0]) }, hor: { value: new THREE.Color(map.sky[1]) } },
      vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vp; void main(){ float t = clamp(vp.y*1.6,0.0,1.0); gl_FragColor = vec4(mix(hor, top, pow(t,0.7)),1.0); }' });
    const sky = new THREE.Mesh(skyGeo, skyMat); sky.renderOrder = -1; group.add(sky);
    // ---- clouds (big soft sprites)
    const cc = document.createElement('canvas'); cc.width = cc.height = 128; const cx = cc.getContext('2d');
    const gr = cx.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(250,250,252,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    const ctex = new THREE.CanvasTexture(cc);
    const cloudN = 70, cp = [], rnd = Models.mulberry(seed * 31 + 7);
    for (let i = 0; i < cloudN; i++) { const x = (rnd() - 0.5) * half * 2.4, z = (rnd() - 0.5) * half * 2.4, y = 900 + rnd() * 1600; const n = 5 + Math.floor(rnd() * 6);
      for (let k = 0; k < n; k++) cp.push(x + (rnd() - 0.5) * 500, y + (rnd() - 0.5) * 90, z + (rnd() - 0.5) * 500); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    const clouds = new THREE.Points(cg, new THREE.PointsMaterial({ map: ctex, size: 520, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: 0.8, fog: true }));
    group.add(clouds);
    // ---- trees (instanced cones)
    if (map.trees) {
      const tg = new THREE.ConeGeometry(4, 14, 5); tg.translate(0, 7, 0);
      const tm = new THREE.MeshLambertMaterial({ color: map.trees }), count = 3500;
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
    scene.add(group);
    scene.fog = new THREE.Fog(map.sky[1], half * 0.35, half * 2.2);
    W = { group, heightAt, groundAt, half, map, mapId: opt.map, sky, clouds, dispose() { scene.remove(group); group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } };
    return W;
  }
  // can a base go here? water bases need sea, land bases need land (checked against raw noise before flattening)
  return { create, MAPS, fbm, get current() { return W; } };
})();
