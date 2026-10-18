// ============================================================================
// Cockpit view: an interior fixed to the aircraft (in its local frame, nose
// -Z), seen from the pilot's eye. The real nose and wings of the model are
// visible ahead. Styles follow the era and type:
//   ww1    open cockpit, leather coaming, windscreen, gun breeches, ring-and-bead sight, wooden dashboard
//   ww2    framed canopy, black panel with round dials, reflector gunsight
//   jet    early jets: framed canopy, gyro gunsight
//   modern bubble canopy, glass HUD with green symbology, multi-function displays
//   bomber wide panel, heavy framing (also used by multi-crew piston aircraft)
// The instruments are live (airspeed, altitude, rpm / thrust, fuel, G, compass).
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
    return new V(def.crew.includes('copilot') ? -0.45 : 0, lay.fr + (st === 'ww1' ? 0.32 : 0.22), lay.cockZ + (st === 'ww1' ? 0.25 : 0.05));
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
  function build(def) {
    const st = style(def), lay = Models.layout(def), e = eye(def), grp = new THREE.Group(), w = st === 'bomber' ? 1.25 : 0.82;
    grp.position.copy(e);
    // ---- instrument panel with a live canvas texture
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192; const tex = new THREE.CanvasTexture(cv);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), MB(0xffffff, { map: tex }));
    panel.position.set(0, st === 'ww1' ? -0.42 : -0.36, -0.7); panel.rotation.x = -0.3; grp.add(panel);
    // glare shield / coaming over the panel
    const coam = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.025, 0.12), M(st === 'ww1' ? 0x3b2a1c : 0x1c1c1c));
    coam.position.set(0, panel.position.y + w * 0.16, -0.68); grp.add(coam);
    // cockpit side walls / sills
    for (const s of [-1, 1]) { const sill = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 1.0), M(st === 'ww1' ? 0x4a3a28 : 0x2e3134)); sill.position.set(s * (w * 0.55 + 0.08), -0.4, -0.05); grp.add(sill); }
    const frameMat = M(st === 'modern' ? 0x2b2f33 : 0x23272a), glassMat = new THREE.MeshPhongMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.08, shininess: 100, depthWrite: false });
    const bar = (len, x, y, z, rx, rz, t) => { const m = new THREE.Mesh(new THREE.BoxGeometry(t || 0.03, len, t || 0.03), frameMat); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); grp.add(m); return m; };
    let sight = null;
    if (st === 'ww1') {
      // leather-trimmed coaming ring and a small windscreen
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 24, Math.PI), M(0x2a1a10)); ring.rotation.set(Math.PI / 2, 0, Math.PI); ring.position.set(0, -0.3, -0.05); grp.add(ring);
      const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.16), glassMat); ws.position.set(0, -0.12, -0.66); ws.rotation.x = -0.4; grp.add(ws);
      // gun breeches on the cowling in front of the pilot
      const guns = def.guns.filter(g => g[2] === 'sync').reduce((a, g) => a + g[1], 0) || (def.guns.length ? 1 : 0);
      for (let i = 0; i < Math.min(2, guns); i++) { const x = guns > 1 ? (i ? 0.13 : -0.13) : 0; const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.45), M(0x1e1e1e)); b.position.set(x, -0.2, -1.0); grp.add(b);
        const jk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), M(0x2a2a2a)); jk.rotation.x = Math.PI / 2; jk.position.set(x, -0.15, -1.45); grp.add(jk); }
      // ring-and-bead sight on the gun line
      const rs = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.003, 4, 24), MB(0x111111)); rs.position.set(0, -0.03, -0.55); grp.add(rs);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), MB(0x111111)); bead.position.set(0, -0.06, -1.4); grp.add(bead);
      bar(0.3, 0, -0.18, -0.55, 0, 0, 0.012); // sight post
    } else {
      // canopy framing
      const fw = st === 'bomber' ? 0.75 : 0.36, fz = st === 'modern' ? -0.85 : -0.6;
      if (st !== 'modern') { for (const s of [-1, 1]) bar(0.55, s * fw, 0.02, fz, -0.35, s * 0.25, 0.022); bar(fw * 2, 0, 0.27, fz - 0.05, 0, Math.PI / 2, 0.022); }
      for (const s of [-1, 1]) bar(1.4, s * (fw + 0.12), -0.22, -0.05, Math.PI / 2, 0, 0.02); // canopy rails
      if (st === 'ww2' || st === 'bomber') { bar(fw * 2.1, 0, 0.33, -0.05, 0, Math.PI / 2, 0.022); bar(fw * 2.1, 0, 0.3, 0.35, 0, Math.PI / 2, 0.022); }
      if (st === 'bomber') { bar(0.6, 0, 0.02, -0.62, -0.35, 0); for (const s of [-1, 1]) bar(0.5, s * 0.95, 0, -0.2, 0, 0, 0.04); }
      const ws = new THREE.Mesh(new THREE.PlaneGeometry(fw * 1.9, 0.55), glassMat); ws.position.set(0, 0.03, fz); ws.rotation.x = -0.35; grp.add(ws);
      // gunsight: reflector glass with a glowing reticle (WW2 / early jets) or a HUD combiner (modern)
      if (st !== 'bomber') {
        const sc = document.createElement('canvas'); sc.width = sc.height = 256; const g = sc.getContext('2d');
        if (st === 'modern') {
          g.strokeStyle = 'rgba(80,255,120,0.95)'; g.lineWidth = 3; g.fillStyle = 'rgba(80,255,120,0.95)'; g.font = '16px monospace';
          g.beginPath(); g.arc(128, 128, 9, 0, Math.PI * 2); g.moveTo(108, 128); g.lineTo(119, 128); g.moveTo(137, 128); g.lineTo(148, 128); g.moveTo(128, 119); g.lineTo(128, 112); g.stroke();
          for (const yy of [60, 196]) { g.beginPath(); g.moveTo(50, yy); g.lineTo(100, yy); g.moveTo(156, yy); g.lineTo(206, yy); g.stroke(); g.fillText(yy < 128 ? '10' : '-10', 24, yy + 5); }
          g.strokeRect(10, 100, 40, 20); g.strokeRect(206, 100, 40, 20); for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(60 + i * 17, 20); g.lineTo(60 + i * 17, i % 2 ? 26 : 32); g.stroke(); }
        } else {
          g.strokeStyle = 'rgba(255,150,60,0.95)'; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 70, 0, Math.PI * 2); g.stroke();
          g.fillStyle = 'rgba(255,170,80,1)'; g.beginPath(); g.arc(128, 128, 5, 0, Math.PI * 2); g.fill();
          for (const [a, b2] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { g.beginPath(); g.moveTo(128 + a * 80, 128 + b2 * 80); g.lineTo(128 + a * 100, 128 + b2 * 100); g.stroke(); }
          if (st === 'jet') { g.beginPath(); for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2; g.moveTo(128 + Math.cos(t) * 40, 128 + Math.sin(t) * 40); g.arc(128 + Math.cos(t) * 40, 128 + Math.sin(t) * 40, 4, 0, Math.PI * 2); } g.stroke(); }
        }
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        plate.position.set(0, -0.005, st === 'modern' ? -0.62 : -0.5); grp.add(plate); sight = plate;
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.07), M(0x1a1a1a)); mount.position.set(0, -0.135, st === 'modern' ? -0.62 : -0.5); grp.add(mount);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.13), new THREE.MeshPhongMaterial({ color: 0x9fc0b0, transparent: true, opacity: 0.15, depthWrite: false })); glass.position.set(0, -0.04, (st === 'modern' ? -0.62 : -0.5) + 0.01); glass.rotation.x = 0.4; grp.add(glass);
      }
      // a stick between the knees
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 6), M(0x111111)); stick.position.set(0, -0.62, -0.25); stick.rotation.x = 0.2; grp.add(stick);
    }
    grp.visible = false;
    let last = -1;
    // redraw the instruments a few times a second
    function update(p, t) {
      if (t - last < 0.12) return; last = t;
      const g = cv.getContext('2d'), W = cv.width, H = cv.height;
      g.fillStyle = st === 'ww1' ? '#5a3e24' : st === 'modern' ? '#2a2e33' : '#151617'; g.fillRect(0, 0, W, H);
      if (st === 'ww1') { g.strokeStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(0, i * 17); g.bezierCurveTo(W / 3, i * 17 + 6, W * 2 / 3, i * 17 - 6, W, i * 17); g.stroke(); } }
      const spd = (p.speed || 0) * 3.6, alt = p.pos.y, thr = Math.min(1.1, p.ctl.throttle), vmax = p.def.spd;
      const heading = (() => { const f = new V(0, 0, -1).applyQuaternion(p.quat); return (Math.atan2(f.x, -f.z) * 180 / Math.PI + 360) % 360; })();
      if (st === 'modern') {
        // two multi-function displays and a few standby dials
        for (const [x, label] of [[20, 'RADAR'], [W - 180, 'SMS']]) {
          g.fillStyle = '#071108'; g.fillRect(x, 20, 160, 150); g.strokeStyle = '#3a3f44'; g.lineWidth = 6; g.strokeRect(x, 20, 160, 150);
          g.fillStyle = '#5dff7a'; g.font = '14px monospace'; g.fillText(label, x + 10, 40);
          if (label === 'RADAR') { g.strokeStyle = '#2f9a45'; g.lineWidth = 1; for (let r = 30; r <= 120; r += 30) { g.beginPath(); g.arc(x + 80, 165, r, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); }
            const m = p.match; for (const c of m.crafts) { if (!c.alive || c.team === p.team) continue; const rel = c.pos.clone().sub(p.pos).applyQuaternion(p.quat.clone().invert()); const d = Math.hypot(rel.x, rel.z); if (rel.z > 0 || d > 20000) continue; g.fillStyle = '#9dff9a'; g.fillRect(x + 80 + rel.x / 20000 * 120 - 3, 165 + rel.z / 20000 * 120 - 3, 6, 6); } }
          else { g.fillText('GUN ' + (p.totalAmmo().a | 0), x + 10, 70); g.fillText('MSL ' + p.count('m'), x + 10, 92); g.fillText('BMB ' + p.count('b'), x + 10, 114); g.fillText('FLR ' + p.flares, x + 10, 136); g.fillText('FUEL ' + Math.round(p.fuel * 100) + '%', x + 10, 158); }
        }
        dial(g, W / 2 - 50, 60, 36, spd / (vmax * 1.1), 'KT'); dial(g, W / 2 + 50, 60, 36, (alt % 1000) / 1000, 'ALT'); dial(g, W / 2, 140, 34, thr / 1.1, 'RPM', '#9fd');
      } else {
        const r = st === 'ww1' ? 34 : 30, n = st === 'ww1' ? 4 : 7, gap = W / (n + 0.4);
        const vals = [[spd / (vmax * 1.15), 'KM/H'], [(alt % 1000) / 1000, 'ALT'], [thr / 1.1, p.def.kind === 'jet' ? '% RPM' : 'RPM'], [p.fuel, 'FUEL'], [((p.gLoad || 1) + 3) / 12, 'G'], [heading / 360, 'HDG'], [(p.vel.y + 30) / 60, 'CLIMB']];
        for (let i = 0; i < n; i++) dial(g, gap * (i + 0.7), i % 2 ? 128 : 70, r, vals[i][0], vals[i][1], st === 'ww1' ? '#f2e7c8' : undefined);
        g.fillStyle = '#ffd34d'; g.font = '16px monospace'; g.textAlign = 'left'; g.fillText(Math.round(alt) + ' m', 12, H - 12);
      }
      tex.needsUpdate = true;
      if (sight) sight.visible = p.alive && !p.wreck;
    }
    return { group: grp, eye: e, update, style: st };
  }
  return { build, eye, style };
})();
