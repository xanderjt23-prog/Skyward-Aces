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
    // skin: optional { top, bot } paint of an aircraft. Each vertex then also gets an aSkin tag for the skin shader:
    // 2 = top-side paint (or a shade of it: camouflage + panel lines), 1 = underside paint (panel lines), 3 = bare metal
    // (part.skin = 3: heat streaks), 0 = everything else (glass, dark interiors, tyres) - left untouched;
    // plus 10 x the part's structure (part.kind: 1 'surf' = wing / tail surface, 2 'fus' = fuselage-like body), with
    // part.uv(x, y, z) -> [a, b, c] giving its panel coordinates (aUV): surf = [span m, chord fraction, chord m],
    // fus = [station m along the axis, arc m round the section from the top, 0]
    build(skin) {
      let n = 0; for (const p of this.parts) n += p.g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), tag = skin ? new Float32Array(n) : null, uvs = skin ? new Float32Array(n * 3) : null;
      let o = 0; const c = new THREE.Color(), c2 = new THREE.Color();
      const tops = skin ? new THREE.Color(skin.top) : null, bots = skin ? new THREE.Color(skin.bot) : null;
      const tint = (cc, ref) => { const k = (cc.r + cc.g + cc.b) / Math.max(1e-4, ref.r + ref.g + ref.b); // a uniformly scaled copy of ref (k 0.45..1.2)?
        return k > 0.45 && k < 1.2 && Math.abs(cc.r - ref.r * k) < 0.02 && Math.abs(cc.g - ref.g * k) < 0.02 && Math.abs(cc.b - ref.b * k) < 0.02; };
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
          if (tag) { const t0 = p.skin !== undefined ? p.skin : tint(cc, tops) ? 2 : tint(cc, bots) ? 1 : 0; tag[o] = t0 + (t0 ? 10 * ({ surf: 1, fus: 2 }[p.kind] || 0) : 0);
            if (p.uv) { const u = p.uv(pa.getX(i), pa.getY(i), pa.getZ(i)); uvs[o * 3] = u[0]; uvs[o * 3 + 1] = u[1]; uvs[o * 3 + 2] = u[2]; } }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (tag) { g.setAttribute('aSkin', new THREE.BufferAttribute(tag, 1)); g.setAttribute('aUV', new THREE.BufferAttribute(uvs, 3)); }
      g.computeBoundingSphere(); return g;
    }
  }

  // ---- aircraft skin: procedural panel lines, rivets, panel-to-panel tone and camouflage, computed per pixel in the
  // aircraft's own coordinates (so the pattern is fixed to the airframe and continuous across the body and wings)
  const SKIN_GLSL = `
    uniform vec3 uTop, uC0, uC1, uC2; uniform float uPattern, uPanel, uBlot, uVar, uLines, uSeed;
    uniform float uFabric, uFrame; varying float vSkin; varying vec3 vOP; varying vec3 vON; varying vec3 vUV; float gSkinH;
    float sHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float sHash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float sNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(sHash3(i), sHash3(i + vec3(1,0,0)), f.x), mix(sHash3(i + vec3(0,1,0)), sHash3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(sHash3(i + vec3(0,0,1)), sHash3(i + vec3(1,0,1)), f.x), mix(sHash3(i + vec3(0,1,1)), sHash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float sFbm(vec3 p) { return 0.5 * sNoise(p) + 0.27 * sNoise(p * 2.03 + 11.7) + 0.15 * sNoise(p * 4.01 + 23.1) + 0.08 * sNoise(p * 8.1 + 5.3); }
    float sLum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
    // distance (m) from x to the nearest of a row of seams spaced S apart, each jittered so the spacing is irregular; id = the panel x lies in
    float sSeams(float x, float S, float seed, out float id) { float i = floor(x / S), best = 1e5; id = i;
      for (int k = -1; k <= 1; k++) { float j = i + float(k), p = (j + 0.5 + (sHash(vec2(j, seed)) - 0.5) * 0.7) * S, d = abs(x - p); if (d < best) { best = d; id = x > p ? j : j - 1.0; } }
      return best; }
    // pixel coverage of a seam w m wide at distance d, for a pixel footprint fw m: thin seams fade out with distance instead of aliasing
    float sCover(float d, float fw, float w) { return (1.0 - smoothstep(w, w + fw, d)) * min(1.0, 2.0 * w / max(fw, 1e-5)); }
    vec3 sCamo(vec3 p) {
      vec3 q = p * uBlot;
      if (uPattern < 1.5) { return mix(uC0, uC1, smoothstep(0.49, 0.53, sFbm(q))); }                               // 1: two-tone disruptive
      if (uPattern < 2.5) { float a = sFbm(q), b = sFbm(q * 1.3 + 41.0);                                             // 2: three-tone (SEA, Soviet)
        return mix(mix(uC0, uC1, smoothstep(0.48, 0.52, a)), uC2, smoothstep(0.57, 0.61, b)); }
      if (uPattern < 3.5) { float s = 0.0;                                                                           // 3: splinter (angular)
        for (int i = 0; i < 6; i++) { float fi = float(i); vec3 d = normalize(vec3(sin(fi * 2.4 + uSeed), 0.35 * cos(fi * 1.7), cos(fi * 2.4 + uSeed)));
          s += step(0.0, dot(p, d) / max(0.5, 1.0 / uBlot) - (sHash(vec2(fi, uSeed)) - 0.5) * 2.0) * pow(2.0, fi); }
        float h = sHash(vec2(s, uSeed + 3.0)); return h < 0.45 ? uC0 : h < 0.85 ? uC1 : uC2; }
      if (uPattern < 4.5) { float m = sFbm(q * 3.0);                                                                 // 4: mottle
        return mix(mix(uC0, uC1, smoothstep(0.6, 0.66, m)), uC2, smoothstep(0.66, 0.7, sFbm(q * 2.2 + 17.0))); }
      if (uPattern < 5.5) { return mix(uC0, uC1, step(0.5, sFbm(q * 0.8))); }                                        // 5: stealth greys (hard edges)
      vec3 g = p * 2.6; vec3 cell = floor(g); float best = 9.0; vec3 id = cell;                                       // 6: lozenge (printed fabric)
      for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) { vec3 c = cell + vec3(x, y, z), o = c + vec3(sHash3(c), sHash3(c + 7.1), sHash3(c + 3.3)); float d = length(g - o); if (d < best) { best = d; id = c; } }
      float h = sHash3(id + uSeed); return h < 0.33 ? uC0 : h < 0.66 ? uC1 : uC2;
    }`;
  const SKIN_FRAG = `
    #include <color_fragment>
    gSkinH = 0.5;
    float sKind = floor(vSkin / 10.0 + 0.01), sTag = vSkin - sKind * 10.0;
    if (sTag > 0.5) {
      vec3 col = diffuseColor.rgb; float seam = 0.0, rivet = 0.0, fwm = 1.0; vec2 pid = vec2(0.0);
      // real stressed skin is laid in long, stretched strips: continuous seams run fore-and-aft on the fuselage and spanwise on
      // the wings (darkest), while the short butt joints across a strip are sparse, staggered from strip to strip and faint
      float tone = 0.0;
      if (sKind > 1.5) {                                                           // fuselage: long strips round the section
        float fz = max(fwidth(vUV.x), 1e-5), fa = max(fwidth(vUV.y), 1e-5), ia, ib, ir; fwm = max(fz, fa);
        float da = sSeams(vUV.y + 50.0, 0.48, uSeed + 7.0, ia);                     // longitudinal strip seams
        float db = sSeams(vUV.x + sHash(vec2(ia, uSeed)) * 9.0, uFrame * 2.2, uSeed + ia * 3.1, ib); // butt joints, own spacing per strip
        float dr = sSeams(vUV.x, uFrame * 0.55, uSeed + 1.0, ir);                  // frame rivet rows (rivets only)
        seam = max(sCover(da, fa, 0.003) * 0.75, sCover(db, fz, 0.0025) * 0.4); pid = vec2(ib, ia);
        rivet = max(sCover(length(vec2(dr, (fract(vUV.y / 0.06) - 0.5) * 0.06)), fwm, 0.0022), sCover(length(vec2(da - 0.018, (fract(vUV.x / 0.06) - 0.5) * 0.06)), fwm, 0.0022));
        tone = sHash(vec2(ia, uSeed + 2.0)) - 0.5;                                  // whole strips differ slightly, never block by block
      } else if (sKind > 0.5) {                                                    // wing / tail surface: spanwise seams on the spars and hinge line
        float span = vUV.x, cm = vUV.y * vUV.z, fs = max(fwidth(span), 1e-5), fc = max(fwidth(cm), 1e-5), ir, ij; fwm = max(fs, fc);
        float d1 = abs(vUV.y - 0.14) * vUV.z, d2 = abs(vUV.y - 0.42) * vUV.z, d3 = abs(vUV.y - 0.66) * vUV.z, dh = abs(vUV.y - 0.745) * vUV.z;
        float strip = vUV.y < 0.14 ? 0.0 : vUV.y < 0.42 ? 1.0 : vUV.y < 0.66 ? 2.0 : 3.0;
        float dj = sSeams(span + strip * 0.83, 1.9, uSeed + strip * 5.0, ij), dr = sSeams(span, 0.5, uSeed + 3.0, ir);
        if (uFabric > 0.5) {                                                       // doped fabric: rib tapes and a faint sag between the ribs, no metal seams
          float ip, dp = sSeams(span, 0.3, 1.0, ip); col *= 1.0 + 0.05 * sCover(dp, fs, 0.012) - 0.03 * smoothstep(0.03, 0.15, dp);
        } else seam = max(max(sCover(min(d1, d3), fc, 0.003) * 0.75, sCover(d2, fc, 0.0025) * 0.4), max(sCover(dh, fc, 0.005), sCover(dj, fs, 0.0025) * 0.4));
        pid = vec2(ij, strip);
        rivet = max(sCover(length(vec2(min(d1, d3) - 0.016, (fract(span / 0.06) - 0.5) * 0.06)), fwm, 0.0022), sCover(length(vec2(dr, (fract(cm / 0.06) - 0.5) * 0.06)), fwm, 0.0022));
        tone = sHash(vec2(strip, uSeed + 4.0)) - 0.5;
      } else { fwm = max(length(fwidth(vOP)), 1e-5); pid = floor(vOP.xz / 1.4); } // other skinned parts: tone only
      gSkinH = sHash(pid + uSeed);
      float wear = sFbm(vOP * 0.7) - 0.5;                                          // broad, soft weathering instead of hard panel blocks
      if (sTag > 1.5 && sTag < 2.5 && uPattern > 0.5) col = sCamo(vOP) * (sLum(col) / max(0.02, sLum(uTop)));
      if (sTag > 2.5) col *= 0.9 + 0.18 * sNoise(vec3(vOP.x * 11.0, vOP.y * 11.0, vOP.z * 0.6));                // heat-streaked metal
      else col *= 1.0 + tone * uVar * 0.5 + wear * 0.07;                                                     // strips differ slightly; soft weathering
      float near = 1.0 - smoothstep(0.012, 0.035, fwm), close = 1.0 - smoothstep(0.002, 0.006, fwm);
      col *= 1.0 - uLines * (seam * 0.2 * near + rivet * 0.08 * close);
      diffuseColor.rgb = col;
    }`;
  const skinCache = {};
  function skinMat(pl, pt) {
    const key = pl.id + (pl.livery ? '|' + pl.livery : ''); if (skinCache[key]) return skinCache[key];
    const cs = camo(pl, pt), L = pl.len, m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: cs.metal ? 45 : cs.pattern === 5 ? 8 : 22, specular: cs.metal ? 0x3c4044 : cs.pattern === 5 ? 0x101214 : 0x1c1c1c }); // bare aluminium shines
    const v3 = h => new THREE.Color(h);
    m.userData.u = { uTop: { value: v3(pt.top) }, uC0: { value: v3(cs.c[0]) }, uC1: { value: v3(cs.c[1]) }, uC2: { value: v3(cs.c[2]) }, uPattern: { value: cs.pattern },
      uPanel: { value: Math.max(0.55, Math.min(1.3, L / 20)) }, uBlot: { value: 1 / Math.max(1.6, Math.min(5, L * 0.14)) }, uVar: { value: cs.pattern === 5 ? 0.1 : 0.035 },
      uLines: { value: cs.lines ? 1 : 0 }, uFabric: { value: cs.lines ? 0 : 1 }, uFrame: { value: Math.max(0.75, Math.min(1.4, L / 13)) }, uSeed: { value: (pl.id.length * 7.3 + pl.id.charCodeAt(0) * 0.37) % 10 } };
    m.extensions = { derivatives: true };
    m.onBeforeCompile = function (sh) {
      Object.assign(sh.uniforms, this.userData.u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSkin; attribute vec3 aUV; varying float vSkin; varying vec3 vOP; varying vec3 vON; varying vec3 vUV;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = aSkin; vOP = position; vON = normal; vUV = aUV;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SKIN_GLSL).replace('#include <color_fragment>', SKIN_FRAG)
        .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= 0.8 + 0.4 * gSkinH;'); // panels catch the light differently
    };
    m.customProgramCacheKey = () => 'aircraft-skin-3';
    return (skinCache[key] = m);
  }
  // camouflage schemes from each air arm's real practice (nation, era, role); colours are the period paint standards
  // (RAF Dark Green / Dark Earth / Ocean Grey, RLM 70/71 and 74/75, USAF T.O. 1-1-4 SEA FS 30219/34102/34079,
  // FS 36375/36320 air-superiority greys, FS 36170/36375 F-22 greys, Soviet AII/AMT enamels)
  const CAMO_ID = {
    f4e: [2, 0xa58b64, 0x4f5b3a, 0x3a4232], f105: [2, 0xa58b64, 0x4f5b3a, 0x3a4232], f111f: [2, 0xa58b64, 0x4f5b3a, 0x3a4232], f100d: [2, 0xa58b64, 0x4f5b3a, 0x3a4232],
    a10a: [2, 0x3c4a3c, 0x4f5b3a, 0x3d4245], f15c: [1, 0x9aa3ac, 0x7d858d, 0x7d858d], f15j: [1, 0x9aa3ac, 0x7d858d, 0x7d858d], f15e: [0, 0x5d6266, 0x5d6266, 0x5d6266],
    f16c: [1, 0x8b939b, 0x6d757c, 0x6d757c], fa18e: [1, 0x8b939b, 0x6d757c, 0x6d757c], f2a: [1, 0x3c5d8a, 0x6b8bb5, 0x6b8bb5], f4ej: [1, 0x8f979d, 0x6f777d, 0x6f777d],
    f22a: [5, 0x6f7579, 0x8e959b, 0x8e959b], su57: [3, 0x7d8a99, 0x5d6a78, 0x9eacba],
    su27: [2, 0x9fb7c9, 0x7f98ab, 0x5e7487], su35s: [2, 0x9fb7c9, 0x7f98ab, 0x5e7487], su34: [1, 0x8fa2ad, 0x6c808c, 0x6c808c], mig29: [1, 0x9aa4a8, 0x7d8f84, 0x7d8f84],
    mig29g: [1, 0x8a9296, 0x6c7478, 0x6c7478], mig23: [2, 0xb09a6a, 0x5b6b3a, 0x5c4a36], su24: [2, 0xb09a6a, 0x5b6b3a, 0x5c4a36], su7b: [2, 0xb09a6a, 0x5b6b3a, 0x5c4a36],
    tornadoids: [3, 0x434c3b, 0x56595a, 0x2c2f2c], tornadogr1: [1, 0x3f4a33, 0x5f6669, 0x5f6669], jaguar: [1, 0x3f4a33, 0x5f6669, 0x5f6669], hunter6: [1, 0x3f4a33, 0x5f6669, 0x5f6669],
    f104g: [3, 0x48503a, 0x5f6466, 0x5f6466], m2000c: [1, 0x8f9ca8, 0x6b7a88, 0x6b7a88], m2000d: [1, 0x5e6a5a, 0x7a6e58, 0x7a6e58],
    f14a: [1, 0xa6aaae, 0x9a9ea3, 0x9a9ea3], f35a: [5, 0x5f6467, 0x767b7f, 0x767b7f], mig25pd: [1, 0xa8b0b6, 0x98a1a8, 0x98a1a8], mirageF1c: [1, 0x8d99a6, 0x7b8896, 0x7b8896], // US Navy gull grey; F-35 greys; MiG-25 grey; F1C air-superiority blue-grey
    ju87: [3, 0x37402d, 0x4a5337, 0x37402d], a4: [1, 0xa3a7aa, 0xa3a7aa, 0xa3a7aa],                       // Stuka RLM 70/71 splinter; Navy Light Gull Gray
    fd7: [6, 0x5d5a4a, 0x6b5a6e, 0x3f4a3a], hannover: [6, 0x5d5a4a, 0x6b5a6e, 0x3f4a3a], su25: [2, 0xb09a6a, 0x5b6b3a, 0x5c4a36], gotha: [6, 0x3f4256, 0x5a4a5e, 0x2f3a46], albd3: [1, 0x5a6a3a, 0x6b5266, 0],  // printed lozenge; Albatros green / mauve
  };
  function camo(pl, pt) {
    if (pl.livery && LIVERY[pl.livery]) { const L = LIVERY[pl.livery]; return { pattern: L.pattern, c: L.c, lines: true, metal: !!L.metal }; }
    const n = pl.nation, e = pl.era, metalSkin = !(e <= 2 && (pl.shape === 'bi' || pl.shape === 'tri' || e === 1)); // WW1 / biplanes: doped fabric, no panel lines
    const out = (pattern, c0, c1, c2) => ({ pattern, c: [c0, c1, c2], lines: metalSkin });
    if (CAMO_ID[pl.id]) return out(...CAMO_ID[pl.id]);
    if (e === 3) {
      const big = pl.shape.startsWith('bomber');
      if (n === 'uk') return big ? out(1, 0x3f4a31, 0x6b5737, 0) : out(1, 0x3f4a33, 0x7a7f80, 0);         // Dark Green / Dark Earth, or Ocean Grey on fighters
      if (n === 'ger') return big ? out(3, 0x37402d, 0x4a5337, 0x37402d) : out(4, 0x5b6068, 0x4a5048, 0x6b6a72); // RLM 70/71 splinter; RLM 74/75 with mottle
      if (n === 'ussr') return pl.year >= 1943 ? out(1, 0x7a8a96, 0x4f5a62, 0) : out(1, 0x5c6a3a, 0x2b2b26, 0);
      if (n === 'fra') return out(2, 0x6b6a52, 0x7a5c3a, 0x5a6a72);
    }
    if (e === 5 && n === 'uk' && pl.id !== 'lightning') return out(1, 0x3f4a33, 0x5f6669, 0);
    if (e === 5 && n === 'fra') return out(1, 0x6b5a3e, 0x4c5640, 0);
    return out(0, pt.top, pt.top, pt.top);                                                                  // a single colour (natural metal, navy blue, silver, ...)
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
    if (pl.livery && LIVERY[pl.livery]) { const L = LIVERY[pl.livery], base = paint(Object.getPrototypeOf(pl)); return { top: L.top, bot: L.bot, acc: L.acc || base.acc }; }
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
    const flat = (g, c, s, off) => { const p = pos.slice(); off *= 2; if (normalAxis === 'x') p[0] += off * Math.sign(pos[0] || 1); else p[1] += off; b.add(g, c, p, rot, [s, 1, s]); }; // layers 1-9 cm apart: no z-fighting at range
    const disc = cyl(1, 1, 0.002, 24);
    if (nation === 'ddr') { // East German NVA: the black-red-gold flag with the state emblem
      const bar = (c, dy) => { const p = pos.slice(); if (normalAxis === 'x') { p[0] += 0.025 * Math.sign(pos[0] || 1); p[1] += dy * size; } else { p[1] += 0.025; p[2] += dy * size; } b.add(normalAxis === 'x' ? box(0.18, 0.002, 0.75) : box(0.75, 0.002, 0.18), c, p, rot, [size, 1, size]); };
      bar(0x111111, 0.18); bar(0xdd0000, 0); bar(0xffce00, -0.18); flat(disc, 0xdd0000, size * 0.17, 0.008); flat(disc, 0xffce00, size * 0.12, 0.01); return; }
    if (nation === 'ger') { flat(box(1, 0.002, 0.3), 0xffffff, size, 0.01); flat(box(0.3, 0.002, 1), 0xffffff, size, 0.01); flat(box(0.8, 0.002, 0.18), 0x111111, size, 0.02); flat(box(0.18, 0.002, 0.8), 0x111111, size, 0.02); return; }
    if (nation === 'jpn') { if (era >= 3 && normalAxis === 'x') flat(disc, 0xffffff, size * 0.56, 0.005); flat(disc, 0xc8102e, size * 0.5, 0.01); return; } // white-outlined hinomaru on dark-green fuselages
    if (nation === 'ussr') { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.2 : 0.5; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
      const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); flat(g, 0xcc1111, size, 0.02); return; }
    if (nation === 'usa' && era === 1) { flat(disc, 0xb22234, size * 0.5, 0.01); flat(disc, 0x1c2f6e, size * 0.34, 0.02); flat(disc, 0xffffff, size * 0.16, 0.03); return; }
    if (nation === 'usa' && era >= 3) { // star and bar (1943 on), with the red stripe from 1947
      const bar = (l, h) => normalAxis === 'x' ? box(h, 0.002, l) : box(l, 0.002, h);
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
    if (s.kind === 'b') { m = bomb(s); r = s.dia / 2; len = s.len; if (s.guided) { const b2 = new Builder(); b2.add(box(r * 3, 0.02, r * 1.2), 0x555555, [0, 0, -len * 0.45]); m.add(new THREE.Mesh(b2.build(), mat('vc'))); } }
    else if (s.kind === 'm') { len = s.len; r = s.dia / 2; m = missile(len, r); }
    else if (s.kind === 'g') { len = 2.4 + s.mass / 600; r = 0.22 + s.mass / 4000; const b2 = new Builder(); b2.add(zcyl(r * 0.6, r, len, 12), 0x5c6268, [0, 0, 0]); b2.add(zcyl(0.03, 0.03, 0.6, 6), 0x222222, [0, -r * 0.3, -len / 2 - 0.3]); m = new THREE.Mesh(b2.build(), mat('vc')); }
    else { // rockets: a pod for many small rockets, rails for a few big ones
      const pod = s.count >= 6 || /pod/i.test(s.name), b2 = new Builder();
      if (pod) { len = 1.8; r = 0.24; b2.add(zcyl(r * 0.8, r, len, 12), 0x55605a, [0, 0, 0]); b2.add(cyl(r * 0.8, r * 0.8, 0.02, 12), 0x222222, [0, 0, -len / 2 - 0.01], [Math.PI / 2, 0, 0]); }
      else { len = 1.6; r = 0.08; b2.add(box(0.06, 0.04, len), 0x444444, [0, r + 0.03, 0]); b2.add(zcyl(r, r, len, 8), 0x7a7a6a, [0, 0, 0]); b2.add(zcyl(0.01, r, 0.25, 8), 0x9a9a8a, [0, 0, -len / 2 - 0.12]); }
      m = new THREE.Mesh(b2.build(), mat('vc'));
    }
    m.userData.r = r; m.userData.len = len; return m;
  }
  function bomb(s) {
    const r = s.dia / 2, L = s.len, b = new Builder(), col = s.type === 'lgb' || s.type === 'gps' ? 0x6b6f5a : 0x4a5040;
    if (s.type === 'hc') { b.add(zcyl(r, r, L, 12), col, [0, 0, 0]); return new THREE.Mesh(b.build(), mat('vc')); } // the Cookie: a thin-walled drum
    const nose = Math.min(L * 0.3, r * 2.4), tail = L * 0.3, body = L - nose - tail;
    b.add(zcyl(r, r, body, 10), col, [0, 0, -L / 2 + nose + body / 2]);
    const ns = new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); ns.rotateX(-Math.PI / 2); ns.scale(1, 1, nose / r); b.add(ns, col, [0, 0, -L / 2 + nose]);
    b.add(zcyl(r, r * 0.35, tail, 10), col, [0, 0, L / 2 - tail / 2]);
    const fw = r * (s.ret ? 1.6 : 1.1); b.add(box(fw * 2 + r * 0.7, 0.012, tail * 0.7), 0x3a4030, [0, 0, L / 2 - tail * 0.35]); b.add(box(0.012, fw * 2 + r * 0.7, tail * 0.7), 0x3a4030, [0, 0, L / 2 - tail * 0.35]);
    return new THREE.Mesh(b.build(), mat('vc'));
  }
  return { aircraft: null /* set by aircraft3d.js */, skinMat, storeMesh, layout, turretPos, paint, insignia, base, aaMount, missile, bomb, debris, mat, Builder, mulberry, TEAM_COL, zcyl, box, cyl, panel };
})();
