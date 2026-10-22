// ============================================================================
// Cockpit view: an interior fixed to the aircraft (in its local frame, nose
// -Z), seen from the pilot's eye. The real nose and wings of the model are
// visible ahead. Each era gets the sight it really had, and nothing more:
//   ww1    open cockpit, leather coaming, gun breeches, a ring-and-bead (iron) sight
//   ww2    framed canopy, black panel with round dials, a fixed reflector sight (Revi / GM2 style): the reticle is
//          collimated, so it shows only in its glass, at its real size (100 mil ring), with no lead computing
//   jet    early jets: a gyro (lead-computing) gunsight, K-14 / A-4 / ASP-3 style: the pipper swings to where the
//          guns must point to hit the target, the ring of diamonds shrinks with its range
//   modern a head-up display on the combiner glass: pitch ladder, flight-path marker, heading tape, speed and
//          altitude (knots and feet in Western jets, km/h and metres in Soviet ones), G, Mach, weapon mode, the target
//          designator, gun lead pipper, missile seeker and CCIP bomb pipper; multi-function displays below it
//   bomber wide panel, heavy framing (also used by multi-crew piston aircraft)
// The instruments are live (airspeed, altitude, rpm / thrust, fuel, G, compass). In this view the game's own screen
// aids (crosshair, lead marker, minimap) are switched off (hud.js): the sight is what the pilot really had.
// ============================================================================
const Cockpit = (() => {
  const V = THREE.Vector3;
  function style(def) {
    if (def.role === 'bomber' && def.kind !== 'jet' && def.era >= 2) return 'bomber';
    if (def.era === 1 || (def.era === 2 && (def.shape === 'bi'))) return 'ww1';
    if (def.kind !== 'jet') return 'ww2';
    return def.era >= 6 ? 'modern' : 'jet';
  }
  // eye position in the aircraft frame: head just above the fuselage top line, in the canopy
  function eye(def) {
    const lay = Models.layout(def), st = style(def);
    return new V(def.crew.includes('copilot') ? -0.45 : 0, lay.eyeY, lay.cockZ + (st === 'ww1' ? 0.25 : 0.05));
  }
  const M = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
  const MB = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {}));
  // a dial: face, ticks, needle at angle a (0..1 of the sweep)
  function dial(g, x, y, r, a, label, col) {
    g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a8a7a'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = col || '#e8e4d0'; g.lineWidth = 1.5;
    for (let i = 0; i <= 10; i++) { const t = -Math.PI * 1.25 + i / 10 * Math.PI * 1.5; g.beginPath(); g.moveTo(x + Math.cos(t) * r * 0.78, y + Math.sin(t) * r * 0.78); g.lineTo(x + Math.cos(t) * r * 0.92, y + Math.sin(t) * r * 0.92); g.stroke(); }
    const t = -Math.PI * 1.25 + Math.max(0, Math.min(1, a)) * Math.PI * 1.5;
    g.strokeStyle = '#fff6c8'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * r * 0.8, y + Math.sin(t) * r * 0.8); g.stroke();
    g.fillStyle = '#c8c4b0'; g.font = `${Math.round(r * 0.26)}px sans-serif`; g.textAlign = 'center'; g.fillText(label, x, y + r * 0.55);
  }
  // sight plates: distance D from the eye along the boresight, square of side S metres, drawn on a canvas of N px
  const SIGHT = { ww2: { D: 0.5, S: 0.09, N: 256, y: -0.004 }, jet: { D: 0.52, S: 0.12, N: 256, y: -0.004 }, modern: { D: 0.62, S: 0.22, N: 512, y: -0.02 } };
  const MIL = 0.001;
  function build(def) {
    const st = style(def), e = eye(def), grp = new THREE.Group(), modern = st === 'modern', w = st === 'bomber' ? 1.25 : modern ? 0.92 : 0.82;
    const soviet = def.nation === 'ussr';
    grp.position.copy(e);
    // ---- instrument panel with a live canvas texture
    const cv = document.createElement('canvas'); cv.width = modern ? 1024 : 512; cv.height = modern ? 384 : 192; const tex = new THREE.CanvasTexture(cv);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), MB(0xffffff, { map: tex }));
    panel.position.set(0, st === 'ww1' ? -0.42 : modern ? -0.33 : -0.36, modern ? -0.64 : -0.7); panel.rotation.x = modern ? -0.42 : -0.3; grp.add(panel);
    // glare shield / coaming over the panel
    const coam = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.025, modern ? 0.2 : 0.12), M(st === 'ww1' ? 0x3b2a1c : 0x1c1c1c));
    coam.position.set(0, panel.position.y + w * (modern ? 0.17 : 0.16), modern ? -0.66 : -0.68); grp.add(coam);
    // cockpit side walls / sills (side consoles on jets)
    for (const s of [-1, 1]) { const sill = new THREE.Mesh(new THREE.BoxGeometry(modern ? 0.16 : 0.05, 0.12, 1.0), M(st === 'ww1' ? 0x4a3a28 : modern ? 0x2a2d30 : 0x2e3134)); sill.position.set(s * (w * 0.55 + (modern ? 0.02 : 0.08)), -0.42, -0.05); grp.add(sill); }
    const frameMat = M(modern ? 0x2b2f33 : 0x23272a), glassMat = new THREE.MeshPhongMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.08, shininess: 100, depthWrite: false });
    const bar = (len, x, y, z, rx, rz, t) => { const m = new THREE.Mesh(new THREE.BoxGeometry(t || 0.03, len, t || 0.03), frameMat); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); grp.add(m); return m; };
    let sight = null, sg = null, sc = null, sp = SIGHT[st];
    if (st === 'ww1') {
      // leather-trimmed coaming ring and a small windscreen
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 24, Math.PI), M(0x2a1a10)); ring.rotation.set(Math.PI / 2, 0, Math.PI); ring.position.set(0, -0.3, -0.05); grp.add(ring);
      const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.16), glassMat); ws.position.set(0, -0.12, -0.66); ws.rotation.x = -0.4; grp.add(ws);
      // gun breeches on the cowling in front of the pilot
      const guns = def.guns.filter(g => g[2] === 'sync').reduce((a, g) => a + g[1], 0) || (def.guns.length ? 1 : 0);
      for (let i = 0; i < Math.min(2, guns); i++) { const x = guns > 1 ? (i ? 0.13 : -0.13) : 0; const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.45), M(0x1e1e1e)); b.position.set(x, -0.2, -1.0); grp.add(b);
        const jk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), M(0x2a2a2a)); jk.rotation.x = Math.PI / 2; jk.position.set(x, -0.15, -1.45); grp.add(jk); }
      // ring-and-bead sight on the gun line: line the bead up in the middle of the ring (both on the same sight line)
      const rs = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.003, 4, 24), MB(0x111111)); rs.position.set(0, -0.03, -0.55); grp.add(rs);
      for (const a of [0, Math.PI / 2]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.0025, 0.0025), MB(0x111111)); cr.rotation.z = a; cr.position.copy(rs.position); grp.add(cr); }
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), MB(0x111111)); bead.position.set(0, -0.03 * 1.4 / 0.55, -1.4); grp.add(bead);
      bar(0.3, 0, -0.18, -0.55, 0, 0, 0.012); // sight post
    } else {
      // canopy framing
      // open-cockpit monoplanes (P-26, I-16, TB-3...) only have a small windscreen: no roof, no rails
      const open = Airframe.spec(def).canopy.type === 'open';
      const fw = st === 'bomber' ? 0.75 : open ? 0.26 : 0.36, fz = modern ? -0.85 : -0.6;
      if (open) { for (const s of [-1, 1]) bar(0.22, s * fw, -0.16, fz, -0.4, s * 0.2, 0.014); bar(fw * 2, 0, -0.06, fz - 0.04, 0, Math.PI / 2, 0.014); }
      else if (!modern) { for (const s of [-1, 1]) bar(0.55, s * fw, 0.02, fz, -0.35, s * 0.25, 0.022); bar(fw * 2, 0, 0.27, fz - 0.05, 0, Math.PI / 2, 0.022); }
      if (!open) for (const s of [-1, 1]) bar(1.4, s * (fw + 0.12), -0.22, -0.05, Math.PI / 2, 0, 0.02); // canopy rails
      if ((st === 'ww2' || st === 'bomber') && !open) { bar(fw * 2.1, 0, 0.33, -0.05, 0, Math.PI / 2, 0.022); bar(fw * 2.1, 0, 0.3, 0.35, 0, Math.PI / 2, 0.022); }
      if (st === 'bomber') { bar(0.6, 0, 0.02, -0.62, -0.35, 0); for (const s of [-1, 1]) bar(0.5, s * 0.95, 0, -0.2, 0, 0, 0.04); }
      if (modern) bar(0.9, 0, 0.36, 0.25, 0, Math.PI / 2, 0.035); // the canopy bow behind the head (a frameless bubble ahead)
      const ws = new THREE.Mesh(new THREE.PlaneGeometry(fw * 1.9, open ? 0.22 : 0.55), glassMat); ws.position.set(0, open ? -0.16 : 0.03, fz); ws.rotation.x = -0.35; grp.add(ws);
      // the sight: a plate facing the eye on the boresight, with its own canvas (drawn every frame for the gyro sight
      // and the HUD); additive, so it glows like light reflected in the glass
      if (sp) {
        sc = document.createElement('canvas'); sc.width = sc.height = sp.N; sg = sc.getContext('2d');
        const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }); // (additive light would wash out to white against the sky)
        sight = new THREE.Mesh(new THREE.PlaneGeometry(sp.S, sp.S), mat); sight.position.set(0, sp.y, -sp.D); grp.add(sight);
        const gw = modern ? sp.S * 0.95 : sp.S * 0.9, gh = modern ? sp.S * 0.8 : sp.S * 0.75; // the glass itself and what holds it
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshBasicMaterial({ color: modern ? 0x203a28 : 0x9fc0b0, transparent: true, opacity: modern ? 0.12 : 0.1, depthWrite: false }));
        glass.position.set(0, sp.y - (modern ? 0.0 : 0.005), -sp.D + 0.005); glass.rotation.x = modern ? 0.12 : 0.35; grp.add(glass);
        if (modern) { for (const s of [-1, 1]) bar(gh * 1.05, s * gw * 0.52, sp.y - 0.01, -sp.D - 0.01, 0.12, 0, 0.012); const box = new THREE.Mesh(new THREE.BoxGeometry(gw * 0.8, 0.04, 0.12), M(0x1a1c1e)); box.position.set(0, sp.y - gh / 2 - 0.035, -sp.D + 0.03); grp.add(box); }
        else { const mount = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.09), M(0x1a1a1a)); mount.position.set(0, sp.y - gh / 2 - 0.045, -sp.D + 0.02); grp.add(mount); } // the sight body on the coaming, under its glass
      }
      // a stick between the knees (a side-stick on the right console of fly-by-wire jets)
      const fbw = modern && ['f16c', 'f22a', 'f35a', 'rafalec', 'ef2000g', 'ef2000uk', 'f2a'].includes(def.id);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, fbw ? 0.14 : 0.4, 6), M(0x111111)); stick.position.set(fbw ? 0.44 : 0, fbw ? -0.36 : -0.62, fbw ? -0.15 : -0.25); stick.rotation.x = 0.2; grp.add(stick);
    }
    grp.visible = false;
    // ---- sight drawing helpers: a direction in the aircraft frame -> pixels on the sight canvas (null if behind)
    const toPx = v => { if (v.z > -1e-3) return null; const t = sp.D / -v.z; return { x: (v.x * t / sp.S + 0.5) * sp.N, y: (0.5 - (v.y * t - sp.y) / sp.S) * sp.N }; };
    const angPx = a => a * sp.D / sp.S * sp.N; // an angle (rad) seen from the eye, in pixels on the plate
    function drawReflector() { // Revi C/12D / GM2: 100 mil ring, centre dot, four bars out from the ring
      const N = sp.N, c = N / 2, R = angPx(50 * MIL); sg.clearRect(0, 0, N, N);
      sg.strokeStyle = 'rgba(255,110,30,0.95)'; sg.lineWidth = 2; sg.beginPath(); sg.arc(c, c + angPx(-sp.y / sp.D), R, 0, Math.PI * 2); sg.stroke();
      const cy = c + angPx(-sp.y / sp.D); sg.fillStyle = 'rgba(255,120,40,1)'; sg.beginPath(); sg.arc(c, cy, 2.5, 0, Math.PI * 2); sg.fill();
      for (const [a, b] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { sg.beginPath(); sg.moveTo(c + a * R * 1.15, cy + b * R * 1.15); sg.lineTo(c + a * R * 1.6, cy + b * R * 1.6); sg.stroke(); }
      sight.material.map.needsUpdate = true;
    }
    const _q = new THREE.Quaternion(), _v = new V(), _w = new V();
    const local = (p, worldDir) => _v.copy(worldDir).applyQuaternion(_q.copy(p.quat).invert());
    // gyro gunsight: the pipper sits where the guns must point to hit the target (lead and drop), the ring of six
    // diamonds is sized so that a fighter's wingspan fills it at the target's range (stadiametric ranging)
    function drawGyro(p) {
      const N = sp.N, G = Game, t = G.target; sg.clearRect(0, 0, N, N);
      const bore = toPx(new V(0, 0, -1)); let pip = bore, rng = 600;
      if (t && t.alive) { const d = t.pos.distanceTo(p.pos); if (d < 1400) { rng = d; const lp = p.leadPoint(t).sub(p.pos).normalize(); const q = toPx(local(p, lp).clone()); if (q) pip = { x: Math.max(N * 0.08, Math.min(N * 0.92, q.x)), y: Math.max(N * 0.08, Math.min(N * 0.92, q.y)) }; } }
      const R = Math.max(angPx(12 * MIL), Math.min(angPx(60 * MIL), angPx(11 / rng)));
      sg.strokeStyle = 'rgba(255,120,40,0.95)'; sg.fillStyle = 'rgba(255,120,40,0.95)'; sg.lineWidth = 2;
      sg.beginPath(); sg.moveTo(bore.x - 8, bore.y); sg.lineTo(bore.x + 8, bore.y); sg.moveTo(bore.x, bore.y - 8); sg.lineTo(bore.x, bore.y + 8); sg.stroke(); // fixed cross (boresight)
      sg.beginPath(); sg.arc(pip.x, pip.y, 2.5, 0, Math.PI * 2); sg.fill();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = pip.x + Math.cos(a) * R, y = pip.y + Math.sin(a) * R; sg.beginPath(); sg.moveTo(x, y - 4); sg.lineTo(x + 4, y); sg.lineTo(x, y + 4); sg.lineTo(x - 4, y); sg.closePath(); sg.stroke(); }
      sight.material.map.needsUpdate = true;
    }
    // ---- the head-up display
    function drawHUD(p) {
      const N = sp.N, G = Game, m = p.match, c = N / 2, col = 'rgba(40,235,90,0.95)';
      sg.clearRect(0, 0, N, N); sg.strokeStyle = col; sg.fillStyle = col; sg.lineWidth = 3; sg.font = '700 24px monospace'; sg.textAlign = 'center';
      const line = (a, b) => { if (!a || !b) return; sg.beginPath(); sg.moveTo(a.x, a.y); sg.lineTo(b.x, b.y); sg.stroke(); };
      const up = new V(0, 1, 0), fw = new V(0, 0, -1).applyQuaternion(p.quat), hd = new V(fw.x, 0, fw.z); if (hd.lengthSq() < 1e-6) hd.set(0, 0, -1); hd.normalize();
      const right = new V().crossVectors(hd, up).normalize();
      const dirAt = (pitchDeg, side) => { const a = pitchDeg * Math.PI / 180; return local(p, hd.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a)).addScaledVector(right, side)).clone(); };
      // flight-path marker: where the aircraft is actually going
      const vl = local(p, p.vel.clone().normalize()).clone(), fpm = toPx(vl);
      // pitch ladder, centred on the flight path's heading, every 5 degrees
      sg.save(); sg.beginPath(); sg.rect(N * 0.12, N * 0.1, N * 0.76, N * 0.8); sg.clip();
      const pitch = Math.asin(Math.max(-1, Math.min(1, fw.y))) * 180 / Math.PI;
      for (let a = Math.ceil((pitch - 20) / 5) * 5; a <= pitch + 20; a += 5) {
        if (a < -90 || a > 90) continue;
        const w0 = a === 0 ? 0.03 : 0.012, w1 = a === 0 ? 0.25 : 0.07;
        for (const s of [-1, 1]) { const p0 = toPx(dirAt(a, s * w0)), p1 = toPx(dirAt(a, s * w1)); if (!p0 || !p1) continue;
          if (a < 0) { sg.setLineDash([6, 5]); } line(p0, p1); sg.setLineDash([]);
          if (a !== 0) { const tick = toPx(dirAt(a + (a > 0 ? -1 : 1), s * w1)); line(p1, tick); sg.fillText(String(Math.abs(a)), p1.x + s * 18, p1.y + 6); } }
      }
      sg.restore();
      if (fpm) { sg.beginPath(); sg.arc(fpm.x, fpm.y, 8, 0, Math.PI * 2); sg.moveTo(fpm.x - 20, fpm.y); sg.lineTo(fpm.x - 8, fpm.y); sg.moveTo(fpm.x + 8, fpm.y); sg.lineTo(fpm.x + 20, fpm.y); sg.moveTo(fpm.x, fpm.y - 8); sg.lineTo(fpm.x, fpm.y - 16); sg.stroke(); }
      // heading tape (top)
      const hdg = (Math.atan2(fw.x, -fw.z) * 180 / Math.PI + 360) % 360;
      for (let k = -15; k <= 15; k++) { const h = Math.round(hdg) + k; if (h % 5) continue; const x = c + (h - hdg) * 9; sg.beginPath(); sg.moveTo(x, 40); sg.lineTo(x, h % 10 ? 47 : 53); sg.stroke(); if (!(h % 10)) sg.fillText(String(((h % 360) + 360) % 360 / 10 | 0).padStart(2, '0'), x, 34); }
      sg.beginPath(); sg.moveTo(c, 58); sg.lineTo(c - 6, 66); sg.lineTo(c + 6, 66); sg.closePath(); sg.stroke();
      // speed (left box) and altitude (right box): knots and feet in Western jets, km/h and metres in Soviet ones
      const spd = soviet ? Math.round(p.speed * 3.6) : Math.round(p.speed * 1.944), alt = soviet ? Math.round(p.pos.y) : Math.round(p.pos.y * 3.281);
      sg.lineWidth = 3; sg.strokeRect(18, c - 22, 100, 40); sg.strokeRect(N - 128, c - 22, 110, 40); sg.font = '700 28px monospace';
      sg.fillText(String(spd), 68, c + 9); sg.fillText(String(alt), N - 73, c + 9);
      sg.font = '700 22px monospace'; sg.textAlign = 'left';
      sg.fillText('M ' + (p.speed / 340).toFixed(2), 18, c + 56); sg.fillText('G ' + (p.gLoad || 1).toFixed(1), 18, c + 84);
      sg.fillText(soviet ? 'KM/H' : 'KT', 18, c - 32); sg.textAlign = 'right'; sg.fillText(soviet ? 'M' : 'FT', N - 18, c - 32);
      // weapon mode (bottom left): the armed missile type and how many, or the gun and its rounds
      sg.textAlign = 'left'; const armed = G.armed && p.countOf(G.armed) ? G.armed : null;
      const mode = armed ? (STORES[armed].seek === 'ir' ? 'SRM ' : 'MRM ') + p.countOf(armed) : 'GUN ' + (p.totalAmmo().a | 0);
      sg.fillText(mode, 18, N - 46); if (p.count('b')) sg.fillText('CCIP', 18, N - 18);
      // the target: designator box, missile seeker circle and LOCK, gun lead pipper inside gun range
      const tgt = G.target;
      if (tgt && tgt.alive) {
        const q = toPx(local(p, tgt.pos.clone().sub(p.pos).normalize()).clone());
        if (q && q.x > 0 && q.x < N && q.y > 0 && q.y < N) { sg.strokeRect(q.x - 12, q.y - 12, 24, 24); const d = tgt.pos.distanceTo(p.pos); sg.textAlign = 'right'; sg.fillText((soviet ? (d / 1000).toFixed(1) + ' KM' : (d / 1852).toFixed(1) + ' NM'), N - 22, N - 40); }
        const d = tgt.pos.distanceTo(p.pos);
        if (d < 1500 && !armed) { const lp = toPx(local(p, p.leadPoint(tgt).sub(p.pos).normalize()).clone()); if (lp) { sg.beginPath(); sg.arc(lp.x, lp.y, 14, 0, Math.PI * 2); sg.stroke(); sg.beginPath(); sg.arc(lp.x, lp.y, 2.5, 0, Math.PI * 2); sg.fill(); } }
      }
      if (G.seeker && armed) { const q = toPx(local(p, G.seeker.pos.clone().sub(p.pos).normalize()).clone()); if (q) { sg.beginPath(); sg.arc(q.x, q.y, 22, 0, Math.PI * 2); sg.stroke(); if (G.locked) { sg.textAlign = 'center'; sg.fillText('LOCK', q.x, q.y - 28); } } }
      // gun cross on the boresight when the gun is selected
      if (!armed) { const b = toPx(new V(0, -0.035, -1).normalize()); line({ x: b.x - 10, y: b.y }, { x: b.x + 10, y: b.y }); line({ x: b.x, y: b.y - 10 }, { x: b.x, y: b.y + 10 }); }
      // CCIP: the bomb-fall line from the flight-path marker down to the pipper where the bombs would hit now
      if (p.count('b')) { const ip = p.bombImpact(); if (ip && fpm) { const q = toPx(local(p, ip.clone().sub(p.pos).normalize()).clone()); if (q) { const qx = Math.max(10, Math.min(N - 10, q.x)), qy = Math.max(10, Math.min(N - 10, q.y)); line(fpm, { x: qx, y: qy }); sg.beginPath(); sg.arc(qx, qy, 8, 0, Math.PI * 2); sg.stroke(); sg.beginPath(); sg.arc(qx, qy, 2, 0, Math.PI * 2); sg.fill(); } } }
      sight.material.map.needsUpdate = true;
    }
    if (st === 'ww2' && sight) drawReflector(); // fixed: drawn once
    let last = -1, lastSight = -1;
    function update(p, t) {
      if (sight) { sight.visible = p.alive && !p.wreck; if (t - lastSight > 1 / 40) { lastSight = t; if (st === 'jet') drawGyro(p); else if (modern) drawHUD(p); } }
      // redraw the instruments a few times a second
      if (t - last < 0.12) return; last = t;
      const g = cv.getContext('2d'), W = cv.width, H = cv.height;
      g.fillStyle = st === 'ww1' ? '#5a3e24' : modern ? '#2a2e33' : '#151617'; g.fillRect(0, 0, W, H);
      if (st === 'ww1') { g.strokeStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(0, i * 17); g.bezierCurveTo(W / 3, i * 17 + 6, W * 2 / 3, i * 17 - 6, W, i * 17); g.stroke(); } }
      const spd = (p.speed || 0) * 3.6, alt = p.pos.y, thr = Math.min(1.1, p.ctl.throttle), vmax = p.def.spd;
      const heading = (() => { const f = new V(0, 0, -1).applyQuaternion(p.quat); return (Math.atan2(f.x, -f.z) * 180 / Math.PI + 360) % 360; })();
      if (modern) drawMFDs(g, W, H, p, heading, thr);
      else {
        const r = st === 'ww1' ? 34 : 30, n = st === 'ww1' ? 4 : 7, gap = W / (n + 0.4);
        const vals = [[spd / (vmax * 1.15), 'KM/H'], [(alt % 1000) / 1000, 'ALT'], [thr / 1.1, p.def.kind === 'jet' ? '% RPM' : 'RPM'], [p.fuel, 'FUEL'], [((p.gLoad || 1) + 3) / 12, 'G'], [heading / 360, 'HDG'], [(p.vel.y + 30) / 60, 'CLIMB']];
        for (let i = 0; i < n; i++) dial(g, gap * (i + 0.7), i % 2 ? 128 : 70, r, vals[i][0], vals[i][1], st === 'ww1' ? '#f2e7c8' : undefined);
      }
      tex.needsUpdate = true;
    }
    // two multi-function displays (radar, stores) either side of the up-front controls, standby instruments between
    function drawMFDs(g, W, H, p, heading, thr) {
      const G = Game, m = p.match, mfd = (x, y, s, title) => { g.fillStyle = '#16191c'; g.fillRect(x - 14, y - 14, s + 28, s + 28); g.fillStyle = '#050a06'; g.fillRect(x, y, s, s);
        g.fillStyle = '#3c4146'; for (let i = 0; i < 5; i++) for (const [bx, by] of [[x + 20 + i * (s - 40) / 4, y - 12], [x + 20 + i * (s - 40) / 4, y + s + 4]]) g.fillRect(bx - 8, by, 16, 8); // bezel buttons
        g.fillStyle = '#5dff7a'; g.font = '600 18px monospace'; g.textAlign = 'left'; g.fillText(title, x + 10, y + 24); };
      const S = 300, y0 = 40;
      // left: radar (B-scope: azimuth across, range up), the target and the radar lock
      mfd(40, y0, S, 'RDR  ' + (p.def.radar ? 'RWS' : 'OFF'));
      g.strokeStyle = '#2f9a45'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(40, y0 + S - i * S / 4); g.lineTo(40 + S, y0 + S - i * S / 4); g.stroke(); g.beginPath(); g.moveTo(40 + i * S / 4, y0 + 30); g.lineTo(40 + i * S / 4, y0 + S); g.stroke(); }
      const R = 40000; g.fillStyle = '#5dff7a'; g.font = '14px monospace'; g.fillText((R / 1852 | 0) + ' NM', 48, y0 + 46);
      if (p.def.radar) for (const c of m.crafts) { if (!c.alive || c.team === p.team || c.wreck) continue;
        const rel = local(p, c.pos.clone().sub(p.pos)).clone(), d = rel.length(), az = Math.atan2(rel.x, -rel.z); if (rel.z > 0 || d > R || Math.abs(az) > 1.05) continue;
        const x = 40 + S / 2 + az / 1.05 * S / 2, y = y0 + S - d / R * (S - 30); g.fillStyle = c === G.target ? '#ffffff' : '#9dff9a'; g.fillRect(x - 5, y - 4, 10, 8);
        if (c === G.seeker && G.locked) { g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(x - 9, y - 8, 18, 16); } }
      // right: stores, each weapon with the key that fires it, the armed one highlighted
      const xs = W - 40 - S; mfd(xs, y0, S, 'SMS');
      let yy = y0 + 56; g.font = '600 18px monospace';
      p.weaponSlots().forEach((id, i) => { if (!id) return; const on = id === G.armed; g.fillStyle = on ? '#ffffff' : '#5dff7a'; g.fillText(`${Input.label(Input.bind('weapon' + (i + 1)))}  ${STORES[id].name.replace(/ \(.*\)$/, '').slice(0, 16)}`, xs + 12, yy); g.textAlign = 'right'; g.fillText(String(p.countOf(id)), xs + S - 12, yy); g.textAlign = 'left'; yy += 26; });
      g.fillStyle = '#5dff7a'; g.fillText('GUN  ' + (p.totalAmmo().a | 0), xs + 12, yy + 8); g.fillText((p.def.chaff ? 'CHF/FLR ' : 'FLR ') + p.flares, xs + 12, yy + 34);
      // centre: up-front control panel and standby instruments
      const cx = W / 2; g.fillStyle = '#0d0f11'; g.fillRect(cx - 120, 30, 240, 90); g.fillStyle = '#ffb347'; g.font = '600 20px monospace'; g.textAlign = 'center';
      g.fillText('FUEL ' + Math.round(p.fuel * 100) + '%', cx, 66); g.fillText('HDG ' + String(Math.round(heading)).padStart(3, '0'), cx, 98);
      dial(g, cx - 62, 220, 52, p.speed * 3.6 / (p.def.spd * 1.1), 'IAS'); dial(g, cx + 62, 220, 52, (p.pos.y % 1000) / 1000, 'ALT'); dial(g, cx, 320, 46, thr / 1.1, 'RPM', '#9fd');
    }
    return { group: grp, eye: e, update, style: st };
  }
  return { build, eye, style };
})();
