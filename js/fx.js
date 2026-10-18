// ============================================================================
// Effects: GPU point particles (smoke in one pass, glowing fire/flash in an
// additive pass) and tracer lines. Everything is pooled.
// ============================================================================
const FX = (() => {
  let scene = null, smoke = null, glow = null, tracers = null;
  const MAXP = 9000, MAXG = 5000, MAXT = 6000;
  function tex() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  }
  function system(n, additive, t) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: t }, scale: { value: 600 } },
      vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vc; varying float va; uniform float scale; void main(){ vc = color; va = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(512.0, size * scale / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv;
#include <logdepthbuf_vertex>
}`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>
uniform sampler2D map; varying vec3 vc; varying float va; void main(){
#include <logdepthbuf_fragment>
vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vc, t.a * va); if (gl_FragColor.a < 0.01) discard; }` });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false;
    const P = []; for (let i = 0; i < n; i++) P.push({ life: 0 });
    return { pts, g, P, n, next: 0, alive: 0 };
  }
  function init(sc) {
    scene = sc; const t = tex();
    smoke = system(MAXP, false, t); glow = system(MAXG, true, t); scene.add(smoke.pts); scene.add(glow.pts);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXT * 6), 3)); tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXT * 6), 3));
    tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    tracers.frustumCulled = false; scene.add(tracers);
  }
  function dispose() { if (!scene) return; scene.remove(smoke.pts, glow.pts, tracers); smoke = glow = tracers = null; scene = null; }
  function spawn(sys, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, rise) {
    if (!sys) return; const p = sys.P[sys.next]; sys.next = (sys.next + 1) % sys.n;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s0 = s0; p.s1 = s1; p.r = r; p.g = g; p.b = b; p.a = a; p.drag = drag || 0.5; p.rise = rise || 0;
  }
  const R = () => Math.random() - 0.5;
  // ---- emitters
  function puff(kind, pos, vel, k) {
    k = k || 1; const vx = vel ? vel.x * 0.3 : 0, vy = vel ? vel.y * 0.3 : 0, vz = vel ? vel.z * 0.3 : 0;
    switch (kind) {
      case 'smoke': spawn(smoke, pos.x, pos.y, pos.z, vx + R() * 2, vy + R() * 2, vz + R() * 2, 4 * k, 3, 14 * k, 0.32, 0.32, 0.33, 0.55, 0.8, 1.5); break;
      case 'oil': spawn(smoke, pos.x, pos.y, pos.z, vx + R() * 2, vy + R() * 2, vz + R() * 2, 5, 3, 16, 0.08, 0.08, 0.08, 0.7, 0.8, 1); break;
      case 'leak': spawn(smoke, pos.x, pos.y, pos.z, vx, vy, vz, 1.8, 1, 6, 0.9, 0.92, 0.95, 0.35, 1.5, 0); break;
      case 'contrail': spawn(smoke, pos.x, pos.y, pos.z, 0, 0, 0, 2.5 * k, 0.6, 3, 1, 1, 1, 0.35, 0.2, 0); break;
      case 'fire':
        spawn(glow, pos.x, pos.y, pos.z, vx + R() * 3, vy + R() * 3, vz + R() * 3, 0.5, 3, 1.5, 1, 0.55 + Math.random() * 0.2, 0.15, 0.9, 1, 2);
        spawn(smoke, pos.x, pos.y, pos.z, vx, vy, vz, 5, 3, 18, 0.12, 0.11, 0.1, 0.6, 0.8, 2); break;
      case 'ab': spawn(glow, pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, 0.08, 2.2 * k, 1, 1, 0.6, 0.3, 0.8, 0, 0); break;
      case 'spark': for (let i = 0; i < 4; i++) spawn(glow, pos.x, pos.y, pos.z, vx + R() * 30, vy + R() * 30, vz + R() * 30, 0.25, 1.2, 0.3, 1, 0.85, 0.5, 1, 2, 0); break;
      case 'hehit': spawn(glow, pos.x, pos.y, pos.z, vx, vy, vz, 0.2, 5 * k, 2, 1, 0.7, 0.3, 1, 1, 0); spawn(smoke, pos.x, pos.y, pos.z, vx, vy, vz, 1.5, 2, 6 * k, 0.2, 0.2, 0.2, 0.6, 2, 0); break;
      case 'dust': spawn(smoke, pos.x, pos.y + 1, pos.z, R() * 4, 6 + Math.random() * 5, R() * 4, 1.8, 2, 7 * k, 0.45, 0.38, 0.28, 0.6, 1.2, 0); break;
      case 'splash': for (let i = 0; i < 3; i++) spawn(smoke, pos.x, pos.y + 1, pos.z, R() * 5, 10 + Math.random() * 10, R() * 5, 1.2, 1.5, 5 * k, 0.9, 0.95, 1, 0.7, 1, -8); break;
      case 'flak': spawn(glow, pos.x, pos.y, pos.z, 0, 0, 0, 0.15, 14, 6, 1, 0.7, 0.3, 1, 0, 0); for (let i = 0; i < 4; i++) spawn(smoke, pos.x + R() * 4, pos.y + R() * 4, pos.z + R() * 4, R() * 2, R() * 2, R() * 2, 7, 8, 20, 0.08, 0.08, 0.08, 0.8, 1, 0); break;
      case 'flare': spawn(glow, pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, 0.12, 6, 4, 1, 0.95, 0.75, 1, 0, 0); spawn(smoke, pos.x, pos.y, pos.z, 0, 0, 0, 2, 1.5, 5, 0.85, 0.85, 0.85, 0.5, 0.5, 0); break;
      case 'missile': spawn(glow, pos.x, pos.y, pos.z, 0, 0, 0, 0.08, 2.2, 1, 1, 0.8, 0.5, 1, 0, 0); spawn(smoke, pos.x, pos.y, pos.z, R(), R(), R(), 3, 1, 6, 0.85, 0.85, 0.85, 0.55, 0.5, 0.5); break;
      case 'rocket': spawn(glow, pos.x, pos.y, pos.z, 0, 0, 0, 0.06, 1.6, 1, 1, 0.7, 0.4, 1, 0, 0); spawn(smoke, pos.x, pos.y, pos.z, R(), R(), R(), 1.6, 0.8, 4, 0.75, 0.75, 0.75, 0.5, 0.5, 0.3); break;
    }
  }
  function explosion(pos, size, ground) {
    size = size || 1;
    for (let i = 0; i < 14 * Math.min(3, size); i++) spawn(glow, pos.x, pos.y, pos.z, R() * 40 * size, R() * 40 * size + (ground ? 15 : 0), R() * 40 * size, 0.6 + Math.random() * 0.5, 6 * size, 14 * size, 1, 0.5 + Math.random() * 0.3, 0.12, 1, 3, 0);
    for (let i = 0; i < 12 * Math.min(3, size); i++) spawn(smoke, pos.x, pos.y, pos.z, R() * 20 * size, R() * 20 * size + (ground ? 12 : 0), R() * 20 * size, 5 + Math.random() * 5, 8 * size, 30 * size, 0.15, 0.14, 0.13, 0.75, 1.5, 3);
    for (let i = 0; i < 10; i++) spawn(glow, pos.x, pos.y, pos.z, R() * 140, R() * 140 + 30, R() * 140, 1.2, 1.4, 0.4, 1, 0.8, 0.4, 1, 0.3, -9.8);
  }
  function stepSys(s, dt, cam) {
    const pa = s.g.attributes.position.array, ca = s.g.attributes.color.array, sa = s.g.attributes.size.array, aa = s.g.attributes.alpha.array;
    for (let i = 0; i < s.n; i++) {
      const p = s.P[i];
      if (p.life <= 0) { if (aa[i] !== 0) { aa[i] = 0; sa[i] = 0; } continue; }
      p.life -= dt; const t = 1 - p.life / p.max, d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.rise * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      pa[i * 3] = p.x; pa[i * 3 + 1] = p.y; pa[i * 3 + 2] = p.z;
      ca[i * 3] = p.r; ca[i * 3 + 1] = p.g; ca[i * 3 + 2] = p.b;
      sa[i] = p.s0 + (p.s1 - p.s0) * t; aa[i] = p.life <= 0 ? 0 : p.a * (1 - t) * Math.min(1, t * 8 + 0.3);
    }
    s.g.attributes.position.needsUpdate = s.g.attributes.color.needsUpdate = s.g.attributes.size.needsUpdate = s.g.attributes.alpha.needsUpdate = true;
  }
  // tracer drawing: list of { p, v, col } -> short streaks
  function drawTracers(list) {
    const pa = tracers.geometry.attributes.position.array, ca = tracers.geometry.attributes.color.array;
    let n = 0;
    for (const b of list) { if (n >= MAXT) break; if (!b.tracer) continue;
      const k = 0.022, o = n * 6;
      pa[o] = b.p.x; pa[o + 1] = b.p.y; pa[o + 2] = b.p.z; pa[o + 3] = b.p.x - b.v.x * k; pa[o + 4] = b.p.y - b.v.y * k; pa[o + 5] = b.p.z - b.v.z * k;
      const c = b.col; ca[o] = c[0]; ca[o + 1] = c[1]; ca[o + 2] = c[2]; ca[o + 3] = c[0] * 0.3; ca[o + 4] = c[1] * 0.3; ca[o + 5] = c[2] * 0.3; n++; }
    tracers.geometry.setDrawRange(0, n * 2); tracers.geometry.attributes.position.needsUpdate = true; tracers.geometry.attributes.color.needsUpdate = true;
  }
  function update(dt, camera, h) { if (!smoke) return; const sc = h / (2 * Math.tan(camera.fov * Math.PI / 360)); smoke.pts.material.uniforms.scale.value = sc; glow.pts.material.uniforms.scale.value = sc; stepSys(smoke, dt); stepSys(glow, dt); }
  return { init, dispose, puff, explosion, update, drawTracers };
})();

