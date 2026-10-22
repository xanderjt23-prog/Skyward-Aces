// ============================================================================
// HUD: a full-screen 2D canvas over the 3D view (reticles, markers, radar,
// gauges, damage schematic) plus a few DOM panels (kill feed, messages).
// ============================================================================
const HUD = (() => {
  let cv, g, W = 0, H = 0, dpr = 1;
  const _v = new THREE.Vector3();
  const LEAD_RANGE = [0, 350, 500, 800, 1100, 1400, 1800, 2200]; // m, by era
  function init() { cv = document.getElementById('hud'); g = cv.getContext('2d'); resize(); window.addEventListener('resize', resize); }
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  function proj(p, cam) { _v.copy(p).project(cam); if (_v.z > 1) return null; return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, behind: _v.z > 1 }; }
  function clear() { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); }
  const COL = { me: '#7fd6ff', ally: '#5aa8ff', enemy: '#ff5a4f', white: 'rgba(255,255,255,0.9)', dim: 'rgba(255,255,255,0.55)' };
  function text(t, x, y, c, size, align, bold) { g.font = `${bold ? '600 ' : ''}${size || 12}px "Segoe UI", system-ui, sans-serif`; g.textAlign = align || 'left'; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(t, x + 1, y + 1); g.fillStyle = c || COL.white; g.fillText(t, x, y); }
  function ring(x, y, r, c, w) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.strokeStyle = c; g.lineWidth = w || 1.5; g.stroke(); }

  // ---- main draw
  function draw(game) {
    clear();
    const m = game.match, p = m.player, cam = game.camera; if (!m) return;
    const fwd = p && p.alive ? new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat) : null;
    // markers for aircraft
    const maxD = m.half * 0.9;
    for (const c of m.crafts) {
      if (c === p || !c.alive) continue;
      const d = cam.position.distanceTo(c.pos); if (d > maxD) continue;
      const s = proj(c.pos, cam); if (!s) continue;
      const enemy = !p || c.team !== p.team, col = c.wreck ? 'rgba(200,200,200,0.5)' : enemy ? COL.enemy : COL.ally;
      g.fillStyle = col; g.beginPath(); g.moveTo(s.x - 5, s.y - 14); g.lineTo(s.x + 5, s.y - 14); g.lineTo(s.x, s.y - 8); g.fill();
      if (d < 3500 || c === game.target) { text(`${c.def.short}${c.human ? ' · ' + c.name : ''}`, s.x, s.y - 18, col, 11, 'center');
        text(d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km', s.x, s.y + 16, col, 10, 'center'); }
      if (c === game.target) { g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(s.x - 12, s.y - 12, 24, 24); }
    }
    // bases + health bars when close
    for (const b of m.bases) {
      if (b.dead) continue;
      const s = proj(b.pos, cam); if (!s) continue;
      const d = cam.position.distanceTo(b.pos), enemy = !p || b.team !== p.team, col = enemy ? COL.enemy : COL.ally;
      const sz = { small: 'S', medium: 'M', big: 'L' }[b.size];
      g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(s.x - 7, s.y - 7, 14, 14); text(sz, s.x, s.y + 4, col, 10, 'center', true);
      if (b.objective) text('★', s.x + 12, s.y + 4, '#ffd34d', 12, 'left');
      if (b.home) text(b.team === (p ? p.team : 0) ? 'HOME AIRFIELD' : 'ENEMY AIRFIELD', s.x, s.y + 20, col, 10, 'center', true);
      const near = Math.max(1800, m.half * 0.22);
      if (d < near) { const w = 70, f = Math.max(0, b.hp / b.max);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(s.x - w / 2, s.y - 22, w, 6); g.fillStyle = f > 0.5 ? '#6ad36a' : f > 0.25 ? '#ffc04d' : '#ff5a4f'; g.fillRect(s.x - w / 2, s.y - 22, w * f, 6);
        text(`${b.kind} · ${Math.ceil(b.hp)}`, s.x, s.y - 26, col, 10, 'center'); }
      for (const a of b.aa) if (a.hp > 0 && d < 3000 && enemy) { const sa = proj(a.pos, cam); if (sa) { g.fillStyle = 'rgba(255,90,79,0.8)'; g.fillRect(sa.x - 2, sa.y - 2, 4, 4); } }
    }
    // tanks: a small marker, health bar up close
    for (const v of m.vehicles.list) {
      if (v.dead) continue; const d = cam.position.distanceTo(v.pos); if (d > 4500) continue;
      const s = proj(v.pos.clone().add(new THREE.Vector3(0, 3, 0)), cam); if (!s) continue;
      const col = !p || v.team !== p.team ? COL.enemy : COL.ally;
      g.fillStyle = col; g.beginPath(); g.moveTo(s.x, s.y - 5); g.lineTo(s.x + 5, s.y); g.lineTo(s.x, s.y + 5); g.lineTo(s.x - 5, s.y); g.fill();
      if (d < 1500) { const f = v.hp / v.max; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(s.x - 15, s.y - 12, 30, 4); g.fillStyle = col; g.fillRect(s.x - 15, s.y - 12, 30 * f, 4); text(v.name, s.x, s.y + 16, col, 9, 'center'); }
    }
    if (p && p.alive && !p.wreck) {
      // nose reticle (where the guns converge) and mouse-aim circle
      const conv = CONV[p.def.era];
      const ns = proj(p.pos.clone().addScaledVector(fwd, conv), cam), cc = Profile.get().settings.cross || '#ffffff';
      // drawn twice: a dark outline first so the reticle shows on snow, cloud and sea alike
      if (ns) for (const [col, w] of [['rgba(0,0,0,0.65)', 4], [cc, 2]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(ns.x - 14, ns.y); g.lineTo(ns.x - 5, ns.y); g.moveTo(ns.x + 5, ns.y); g.lineTo(ns.x + 14, ns.y); g.moveTo(ns.x, ns.y + 5); g.lineTo(ns.x, ns.y + 12); g.stroke(); ring(ns.x, ns.y, 2, col, w); }
      if (game.mouseAim) { const as = proj(cam.position.clone().addScaledVector(game.aimDir, 2000), cam); if (as) { ring(as.x, as.y, 9, 'rgba(0,0,0,0.55)', 3.5); ring(as.x, as.y, 9, cc, 1.5); } }
      // gun lead indicator: shown from a range that depends on the aircraft's gunsight (fixed sights in WW1, radar-ranging gunsights on jets)
      const t = game.target;
      if (t && t.alive) {
        const gun = p.guns[0], ms = gun ? gun.g.ms : 800, d = t.pos.distanceTo(p.pos);
        // bullets inherit our velocity, so lead by the relative velocity and lift for the drop
        if (d < LEAD_RANGE[p.def.era]) { const lp = p.leadPoint(t), ls = proj(lp, cam);
          const onNose = Math.acos(Math.max(-1, Math.min(1, lp.clone().sub(p.pos).normalize().dot(fwd)))) < Math.max(0.012, 8 / d), inRange = d < (p.def.era <= 2 ? 400 : p.def.era <= 4 ? 700 : 1000);
          if (ls) { const c = onNose && inRange ? '#ffffff' : COL.enemy; ring(ls.x, ls.y, onNose && inRange ? 9 : 6, c, 2); if (onNose && inRange) { g.fillStyle = 'rgba(255,90,79,0.55)'; g.beginPath(); g.arc(ls.x, ls.y, 9, 0, Math.PI * 2); g.fill(); text('FIRE', ls.x, ls.y - 14, '#ffffff', 10, 'center', true); }
            g.beginPath(); g.moveTo(ls.x - 9, ls.y); g.lineTo(ls.x + 9, ls.y); g.moveTo(ls.x, ls.y - 9); g.lineTo(ls.x, ls.y + 9); g.strokeStyle = c; g.lineWidth = 1; g.stroke();
            if (game.assisting) text('ASSIST', ls.x, ls.y + 22, 'rgba(255,255,255,0.7)', 9, 'center'); } }
      }
      // bomb sight: where bombs released now would hit. Realistic mode shows it only on aircraft with a computing bomb
      // sight in the HUD (CCIP on 4th-generation jets); level bombers use their bombsight view instead
      const ccip = !m.cfg.realistic || (p.def.kind === 'jet' && p.def.era >= 6);
      if (game.camMode !== 'sight' && ccip && p.count('b') > 0 && p.pos.y - m.world.groundAt(p.pos.x, p.pos.z) > 30) bombSight(game, p, cam);
      if (game.camMode === 'sight' && p.def.bombsight) sightView(game, p);
      // missile seeker
      if (game.seeker) { const ss = proj(game.seeker.pos, cam); if (ss) { g.strokeStyle = game.locked ? '#ff3b30' : '#ffd34d'; g.lineWidth = 2; g.beginPath(); g.arc(ss.x, ss.y, 18, 0, Math.PI * 2); g.stroke(); if (game.locked) text('LOCK', ss.x, ss.y - 24, '#ff3b30', 11, 'center', true); } }
      if (m.hitMarker && m.time - m.hitMarker < 0.12 && ns) { g.strokeStyle = '#ffd34d'; g.lineWidth = 2; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(ns.x + a * 8, ns.y + b * 8); g.lineTo(ns.x + a * 15, ns.y + b * 15); g.stroke(); } }
      offscreen(game, p, cam); gauges(game, p); damageView(p); radar(game, p); warnings(game, p);
    }
    topBar(game);
    if (p && p.alive && document.pointerLockElement !== document.getElementById('view') && !game.paused && !m.over) text('Click to take control (mouse aim)', W / 2, H * 0.62, '#ffd34d', 18, 'center', true);
  }
  // ---- bomb sight: continuously computed impact point (CCIP). The pipper shows where bombs released now will hit,
  // joined to the flight-path marker by the bomb-fall line; the ring is the blast radius on the ground.
  function bombSight(game, p, cam) {
    const m = game.match, ip = p.bombImpact(); if (!ip) return;
    const st = p.stationsOf('b').sort((a, b) => b.s.mass - a.s.mass)[0], rad = st ? st.s.rad : 30;
    const jet = p.def.era >= 4, col = jet ? '#7dff8a' : '#ffb347';
    // is the pipper on a target?
    let onTarget = false;
    for (const b of m.bases) if (!b.dead && b.team !== p.team && Math.hypot(b.pos.x - ip.x, b.pos.z - ip.z) < b.radius * 0.8 + rad * 0.3) onTarget = true;
    for (const v of m.vehicles.list) if (!v.dead && v.team !== p.team && Math.hypot(v.pos.x - ip.x, v.pos.z - ip.z) < rad * 0.6) onTarget = true;
    const c2 = onTarget ? '#ff5a4f' : col;
    // blast ring on the ground
    g.beginPath(); let first = true;
    for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, q = proj(new THREE.Vector3(ip.x + Math.cos(a) * rad, ip.y + 0.5, ip.z + Math.sin(a) * rad), cam); if (!q) { first = true; continue; } if (first) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y); first = false; }
    g.strokeStyle = c2; g.lineWidth = 1.2; g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]);
    const bs = proj(ip, cam), fpm = proj(p.pos.clone().addScaledVector(p.vel.clone().normalize(), 1500), cam);
    if (fpm) { // flight-path marker
      for (const [cc, w] of [['rgba(0,0,0,0.6)', 3.5], [col, 1.6]]) { g.strokeStyle = cc; g.lineWidth = w; g.beginPath(); g.arc(fpm.x, fpm.y, 6, 0, Math.PI * 2); g.moveTo(fpm.x - 14, fpm.y); g.lineTo(fpm.x - 6, fpm.y); g.moveTo(fpm.x + 6, fpm.y); g.lineTo(fpm.x + 14, fpm.y); g.moveTo(fpm.x, fpm.y - 6); g.lineTo(fpm.x, fpm.y - 11); g.stroke(); } }
    if (!bs) return;
    if (fpm) { g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); g.moveTo(fpm.x, fpm.y + 6); g.lineTo(bs.x, bs.y); g.stroke(); } // bomb-fall line
    for (const [cc, w] of [['rgba(0,0,0,0.6)', 4], [c2, 2]]) { g.strokeStyle = cc; g.lineWidth = w; g.beginPath(); g.arc(bs.x, bs.y, 9, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = c2; g.beginPath(); g.arc(bs.x, bs.y, 2, 0, Math.PI * 2); g.fill();
    text(`${onTarget ? 'RELEASE' : 'BOMB'} · ${ip.tti.toFixed(1)} s`, bs.x + 14, bs.y + 4, c2, 11, 'left', true);
  }
  // ---- looking through a level bomber's bombsight: the round field of the telescope, the sight's own graticule and the
  // settings the bomb aimer works with (no target cue: lining up is up to you)
  function sightView(game, p) {
    const m = game.match, s = p.def.bombsight, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44, ip = game.sightImpact;
    g.save(); g.fillStyle = 'rgba(0,0,0,0.92)'; g.beginPath(); g.rect(0, 0, W, H); g.arc(cx, cy, R, 0, Math.PI * 2, true); g.fill('evenodd');
    g.strokeStyle = 'rgba(30,30,30,0.9)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke(); g.restore();
    const ink = s.kind === 'drift' ? 'rgba(20,20,20,0.85)' : 'rgba(255,60,40,0.9)'; g.strokeStyle = ink; g.lineWidth = 1.2;
    const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    if (s.kind === 'vector') { // Mark XIV / T2: the "sword" - a long drift line with the cross bar at the release point
      line(cx, cy - R * 0.9, cx, cy + R * 0.35); line(cx - R * 0.16, cy, cx + R * 0.16, cy); line(cx - R * 0.05, cy + R * 0.35, cx + R * 0.05, cy + R * 0.35); }
    else if (s.kind === 'drift') { // course-setting / drift sights: parallel drift wires and the foresight bead on the cross wire
      for (const k of [-2, -1, 0, 1, 2]) line(cx + k * R * 0.2, cy - R * 0.95, cx + k * R * 0.2, cy + R * 0.95); line(cx - R * 0.95, cy, cx + R * 0.95, cy);
      g.fillStyle = ink; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill(); }
    else { // tachometric (Norden, Lotfe 7): fine cross hairs, the course hair along the track
      line(cx, cy - R, cx, cy + R); line(cx - R, cy, cx + R, cy); for (let k = -4; k <= 4; k++) if (k) line(cx - 4, cy + k * R * 0.2, cx + 4, cy + k * R * 0.2); }
    // settings and readings, as the bomb aimer has them: true air speed, ground speed, height, drift and time of fall
    const agl = p.pos.y - m.world.groundAt(p.pos.x, p.pos.z), gs = Math.hypot(p.vel.x, p.vel.z), f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
    const drift = Math.atan2(f.x * p.vel.z - f.z * p.vel.x, f.x * p.vel.x + f.z * p.vel.z) * 180 / Math.PI;
    const rows = [[s.name, ''], ['Height', Math.round(agl) + ' m'], ['Air speed', Math.round(p.speed * 3.6) + ' km/h'], ['Ground speed', Math.round(gs * 3.6) + ' km/h'], ['Drift', (drift >= 0 ? 'R ' : 'L ') + Math.abs(drift).toFixed(1) + '°'],
      ['Time of fall', ip ? ip.tti.toFixed(1) + ' s' : '—'], ['Dropping angle', ip ? (Math.atan2(Math.hypot(ip.x - p.pos.x, ip.z - p.pos.z), agl) * 180 / Math.PI).toFixed(1) + '°' : '—'], ['Bombs', String(p.count('b'))]];
    rows.forEach(([a, b], i) => { text(a, 24, 40 + i * 20, i ? '#cfd8e0' : '#ffd34d', i ? 13 : 15, 'left', !i); if (b) text(b, 190, 40 + i * 20, '#ffffff', 13, 'left', true); });
    text(`${s.gyro ? 'Gyro-stabilised' : 'Fixed (not stabilised): keep the wings level'} · release: ${(() => { const i = p.weaponSlots().findIndex(id => STORES[id].kind === 'b'); return i < 0 ? '-' : Input.label(Input.bind('weapon' + (i + 1))); })()} · zoom: ${Input.label(Input.bind('zoom'))} · leave: ${Input.label(Input.bind('bombsight'))}`, W / 2, 76, '#cfd8e0', 12, 'center', true);
  }
  // ---- arrows at the screen edge for enemies that are off screen
  function offscreen(game, p, cam) {
    const m = game.match, list = m.crafts.filter(c => c.alive && !c.wreck && c.team !== p.team && c.pos.distanceTo(p.pos) < 5000).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos)).slice(0, 4);
    const camInv = cam.quaternion.clone().invert();
    for (const c of list) {
      const s = proj(c.pos, cam); if (s && s.x > 30 && s.x < W - 30 && s.y > 60 && s.y < H - 60) continue;
      const rel = c.pos.clone().sub(cam.position).applyQuaternion(camInv); const ang = Math.atan2(-rel.y, rel.x);
      const r = Math.min(W, H) * 0.38, x = W / 2 + Math.cos(ang) * r, y = H / 2 + Math.sin(ang) * r;
      g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = c === game.target ? '#ffd34d' : COL.enemy; g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -8); g.lineTo(-6, 8); g.closePath(); g.fill(); g.restore();
      const d = c.pos.distanceTo(p.pos); text(d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km', x, y + 20, COL.enemy, 10, 'center');
    }
  }
  // ---- bottom-centre flight data and weapons
  function gauges(game, p) {
    const cx = W / 2, y = H - 64, pit = game.camMode === 'nose' || game.camMode === 'sight'; // in the cockpit its own instruments show the flight data
    if (!pit) { g.fillStyle = 'rgba(8,14,22,0.55)'; round(cx - 250, y - 22, 500, 76, 10); g.fill(); }
    const spd = Math.round(p.speed * 3.6), alt = Math.round(p.pos.y), thr = p.ctl.throttle;
    const thrTxt = thr > 1.01 ? (p.def.ab ? 'AB' : 'WEP') : Math.round(thr * 100) + '%';
    if (!pit) {
    text('SPD', cx - 230, y - 4, COL.dim, 10); text(spd + ' km/h', cx - 230, y + 14, COL.white, 16, 'left', true);
    text('ALT', cx - 120, y - 4, COL.dim, 10); text(alt + ' m', cx - 120, y + 14, COL.white, 16, 'left', true);
    text('THR', cx - 20, y - 4, COL.dim, 10); text(thrTxt, cx - 20, y + 14, thr > 1.01 ? '#ffb347' : COL.white, 16, 'left', true);
    text('G', cx + 60, y - 4, COL.dim, 10); text((p.gLoad || 1).toFixed(1), cx + 60, y + 14, COL.white, 16, 'left', true);
    text('FUEL', cx + 120, y - 4, COL.dim, 10); text(Math.round(p.fuel * 100) + '%', cx + 120, y + 14, p.dm.fx.leak > 0.001 ? '#ffc04d' : COL.white, 16, 'left', true);
    if (p.def.kind === 'jet') { text('M', cx + 185, y - 4, COL.dim, 10); text((p.speed / 340).toFixed(2), cx + 185, y + 14, COL.white, 16, 'left', true); }
    }
    // weapons line
    const parts = [];
    if (p.gunGroups()) { const mg = p.guns.filter(g => !g.pod && g.g.cal < 20).reduce((a, g) => a + g.ammo, 0), cn = p.guns.filter(g => !g.pod && g.g.cal >= 20).reduce((a, g) => a + g.ammo, 0);
      parts.push(`${['ALL GUNS', 'MG ONLY', 'CANNON ONLY'][p.gunMode]} [${Input.label(Input.bind('guns'))}]  MG ${mg | 0} · CAN ${cn | 0}`); }
    else { const ga = p.totalAmmo(); parts.push(`GUNS ${ga.a | 0}`); }
    if (p.flaps) parts.push('FLAPS ' + Craft.FLAP_NAMES[p.flaps].toUpperCase()); else if (p.flapsBroken) parts.push('FLAPS DAMAGED');
    if (p.airbrakeOut) parts.push('AIRBRAKE');
    for (const g2 of p.guns) if (g2.pod) parts.push(`POD ${Math.max(0, g2.pod.gunAmmo | 0)}`);
    p.weaponSlots().forEach((id, i) => { const n = p.countOf(id), s = STORES[id], short = s.name.replace(/ \(.*\)$/, '').replace(/ (pod|rockets).*$/, '').slice(0, 18);
      parts.push(`[${Input.label(Input.bind('weapon' + (i + 1)))}] ${short} ×${n}${s.kind === 'm' && id === game.armed && game.locked ? ' LOCK' : ''}`); });
    if (p.def.flares) parts.push(`FLARES ${p.flares} [${Input.label(Input.bind('flares'))}]`);
    if (game.match.cfg.realistic) parts.push(Models.layout(p.def).fixed ? 'GEAR FIXED' : p.gearDown ? 'GEAR ▼ DOWN' : 'GEAR ▲ UP');
    if (pit) { const t2 = parts.join('   '); g.font = '12px sans-serif'; const w2 = g.measureText(t2).width + 24; g.fillStyle = 'rgba(8,14,22,0.5)'; round(cx - w2 / 2, 62, w2, 22, 8); g.fill(); text(t2, cx, 77, COL.white, 12, 'center'); }
    else text(parts.join('   '), cx, y + 40, COL.white, 12, 'center');
  }
  function round(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // ---- damage schematic: the aircraft's own plan view (fuselage outline, wing planform, tailplane, fins, nacelles from
  // its airframe spec), each part coloured by the condition of the component it belongs to; engines, fuel tanks,
  // ammunition and crew are marked where they really are
  const planCache = {};
  function planOf(def) {
    if (planCache[def.id]) return planCache[def.id];
    const sp = Airframe.spec(def), L = sp.L, z0 = -L / 2, poly = [], N = 40;
    // fuselage: the widest part of the cross-section (core, intake trunks, engine tunnels, the deck) at each station
    const half = z => { if (sp.arch === 'CHINED_STEALTH') return Math.max(sp.at(z).w, sp.chineW ? sp.chineW(z) : 0); let w = sp.at(z).w; if (sp.section) for (const q of sp.section(z).prims) w = Math.max(w, Math.abs(q.x) + q.w); return w; };
    const fl = [], fr = []; for (let i = 0; i <= N; i++) { const z = z0 + L * i / N, w = Math.max(0.05, half(z)); fl.push([-w, z]); fr.unshift([w, z]); }
    poly.push({ part: 'fuselage', pts: fl.concat(fr) });
    // wings (every wing of a biplane), left and right, from the real planform
    for (const g of sp.wings) for (const sd of [-1, 1]) { const le = [], te = [];
      for (let i = 0; i <= 16; i++) { const a = sp.wingAt(i / 16, g); le.push([sd * a.x, a.le]); te.unshift([sd * a.x, a.le + a.c]); }
      le.unshift([sd * g.x0 * 0.5, le[0][1]]); te.push([sd * g.x0 * 0.5, te[te.length - 1][1]]); poly.push({ part: sd < 0 ? 'wingL' : 'wingR', pts: le.concat(te) }); }
    if (sp.stab) { const st = sp.stab; for (const sd of [-1, 1]) { const at = f => { const x = st.x0 + (st.b - st.x0) * f; return [x, st.zLE + st.sw * (x - st.x0), st.rc * (1 - f) + st.tc * f]; };
      const a = at(0), b = at(1); poly.push({ part: 'tailH', pts: [[sd * Math.max(0.05, a[0] * 0.5), a[1]], [sd * b[0], b[1]], [sd * b[0], b[1] + b[2]], [sd * Math.max(0.05, a[0] * 0.5), a[1] + a[2]]] }); } }
    for (const fn of sp.fins) { const w = Math.max(0.12, fn.rc * 0.06) + Math.abs(Math.sin(fn.cant)) * fn.h * 0.5, tipZ = fn.zLE + fn.sw * fn.h;
      poly.push({ part: 'tailV', pts: [[fn.x - w / 2, fn.zLE], [fn.x + w / 2, fn.zLE], [fn.x + w / 2, Math.max(fn.zLE + fn.rc, tipZ + fn.tc)], [fn.x - w / 2, Math.max(fn.zLE + fn.rc, tipZ + fn.tc)]] }); }
    if (sp.extra.canards) { const cd = sp.extra.canards, zc = sp.canopy.z + cd.offset, x0 = sp.at(zc).w * 0.85, c = cd.length * 0.9;
      for (const sd of [-1, 1]) poly.push({ part: 'fuselage', pts: [[sd * x0, zc - c * 0.5], [sd * (x0 + cd.length), zc - c * 0.5 + Math.tan(cd.sweep) * cd.length], [sd * (x0 + cd.length), zc - c * 0.5 + Math.tan(cd.sweep) * cd.length + c * 0.3], [sd * x0, zc + c * 0.5]] }); }
    // engine nacelles / pods outside the fuselage, each tied to its engine component
    sp.engines.forEach((e, i) => { if (e.kind === 'fus' || e.kind === 'tunnel' || e.kind === 'prop') return; const r = e.r, z1 = e.z - e.len / 2, z2 = e.z + e.len / 2;
      poly.push({ part: 'engine' + i, pts: [[e.x - r * 0.6, z1], [e.x + r * 0.6, z1], [e.x + r, z1 + e.len * 0.2], [e.x + r * 0.8, z2], [e.x - r * 0.8, z2], [e.x - r, z1 + e.len * 0.2]] });
      if (e.boom) { const zb = sp.fins.length ? sp.fins[0].zLE + sp.fins[0].rc : L * 0.45; poly.push({ part: 'fuselage', pts: [[e.x - r * 0.7, e.z], [e.x + r * 0.7, e.z], [e.x + r * 0.4, zb], [e.x - r * 0.4, zb]] }); } // P-38: tail booms
    });
    // drawn from the bottom up: wings and tailplanes, then nacelles, the fuselage and the fins on top
    const order = q => q.part.startsWith('wing') ? 0 : q.part === 'tailH' ? 1 : q.part.startsWith('engine') ? 2 : q.part === 'fuselage' ? 3 : 4;
    poly.sort((a, b) => order(a) - order(b));
    let mx = 0, mz0 = Infinity, mz1 = -Infinity; for (const q of poly) for (const [x, z] of q.pts) { mx = Math.max(mx, Math.abs(x)); mz0 = Math.min(mz0, z); mz1 = Math.max(mz1, z); }
    return (planCache[def.id] = { poly, mx, mz0, mz1 });
  }
  function damageView(p) {
    const dm = p.dm, bx = 18, by = H - 230, bw = 190, bh = 200, plan = planOf(p.def);
    g.fillStyle = 'rgba(8,14,22,0.55)'; round(bx, by, bw, bh, 10); g.fill();
    text('AIRCRAFT CONDITION', bx + 10, by + 16, COL.dim, 10, 'left', true);
    const aw = bw - 24, ah = bh - 74, sc = Math.min(aw / (plan.mx * 2), ah / (plan.mz1 - plan.mz0)), cx = bx + bw / 2, cy = by + 24 + ah / 2 - (plan.mz0 + plan.mz1) / 2 * sc + 4;
    const comp = id => dm.comps.find(c => c.id === id);
    const state = c => { if (!c) return 'rgba(90,200,110,0.5)'; const f = c.dead ? 0 : c.hp / c.max; return c.dead ? 'rgba(40,40,40,0.9)' : f > 0.75 ? 'rgba(90,200,110,0.55)' : f > 0.4 ? 'rgba(255,200,70,0.85)' : 'rgba(255,80,60,0.92)'; };
    const draw = (pts, fill, line) => { g.beginPath(); pts.forEach(([x, z], i) => { const X = cx + x * sc, Y = cy + z * sc; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = line || 'rgba(0,0,0,0.55)'; g.lineWidth = 1; g.stroke(); };
    for (const q of plan.poly) { const c = comp(q.part);
      if ((q.part === 'wingL' && dm.wingOff[0]) || (q.part === 'wingR' && dm.wingOff[1]) || (q.part === 'tailH' && c && c.dead && dm.tailOff)) { draw(q.pts, null, 'rgba(255,90,79,0.5)'); continue; } // shot off: only the outline
      draw(q.pts, state(c)); }
    // internal components: engines in the fuselage, fuel tanks, ammunition, crew
    for (const c of dm.comps) {
      if (c.type === 'wing' || c.type === 'tailH' || c.type === 'tailV' || c.type === 'fuselage') continue;
      if (c.type === 'engine' && plan.poly.some(q => q.part === c.id)) { if (c.fire > 0) text('🔥', cx + c.c.x * sc, cy + c.c.z * sc + 4, '#fff', 12, 'center'); continue; }
      const X = cx + c.c.x * sc, Y = cy + c.c.z * sc, f = c.dead ? 0 : c.hp / c.max;
      if (c.type === 'engine') { const w = Math.max(4, (c.hi.x - c.lo.x) * sc * 0.8), h = Math.max(6, (c.hi.z - c.lo.z) * sc); g.fillStyle = state(c); g.fillRect(X - w / 2, Y - h / 2, w, h); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeRect(X - w / 2, Y - h / 2, w, h); }
      else { const r = c.type === 'crew' ? 3.2 : 2.6; g.fillStyle = c.type === 'crew' ? (c.dead ? 'rgba(40,40,40,0.95)' : f > 0.99 ? 'rgba(120,200,255,0.95)' : 'rgba(255,80,60,0.95)') : c.type === 'fuel' ? (c.dead || c.leak > 0 ? 'rgba(255,160,40,0.95)' : 'rgba(230,220,120,0.9)') : (c.dead ? 'rgba(40,40,40,0.9)' : 'rgba(200,200,200,0.85)');
        g.beginPath(); if (c.type === 'ammo') g.rect(X - r, Y - r, r * 2, r * 2); else g.arc(X, Y, r, 0, Math.PI * 2); g.fill(); }
      if (c.fire > 0) text('🔥', X, Y + 4, '#fff', 12, 'center');
    }
    // status lines
    const st = [], fx = dm.fx;
    if (dm.wingOff[0] || dm.wingOff[1]) st.push(['WING LOST', '#ff5a4f']);
    if (dm.comps.some(c => c.type === 'engine' && c.dead)) st.push(['ENGINE DEAD', '#ff5a4f']); else if (dm.comps.some(c => c.type === 'engine' && c.hp / c.max < 0.5)) st.push(['ENGINE DAMAGED', '#ffc04d']);
    if (Damage.burning(dm)) st.push(['FIRE', '#ff7a3a']);
    if (fx.leak > 0.001) st.push(['FUEL LEAK', '#ffc04d']);
    if (fx.elev < 0.5) st.push(['ELEVATOR', '#ffc04d']); if (fx.rud < 0.5) st.push(['RUDDER', '#ffc04d']);
    const crew = dm.comps.filter(c => c.type === 'crew'), dead = crew.filter(c => c.dead).length;
    if (dead) st.push([`${dead}/${crew.length} CREW DOWN`, '#ff5a4f']); else if (crew.some(c => c.hp < c.max)) st.push(['CREW WOUNDED', '#ffc04d']);
    st.slice(0, 4).forEach(([t, c], i) => text(t, bx + 10 + (i % 2) * 90, by + bh - 26 + Math.floor(i / 2) * 14, c, 10, 'left', true));
  }
  // ---- radar (heading up)
  function radar(game, p) {
    const m = game.match, R = 80, cx = W - R - 22, cy = H - R - 22, range = Math.max(4000, m.half * 0.6);
    g.fillStyle = 'rgba(8,14,22,0.55)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); ring(cx, cy, R, 'rgba(255,255,255,0.25)', 1); ring(cx, cy, R / 2, 'rgba(255,255,255,0.12)', 1);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat), hd = Math.atan2(f.x, -f.z);
    const pt = (pos) => { const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z, c = Math.cos(-hd), s = Math.sin(-hd); const x = dx * c - dz * s, z = dx * s + dz * c, d = Math.hypot(x, z) / range * R; const a = Math.atan2(x, z); const r = Math.min(R - 3, d); return [cx + Math.sin(a) * r, cy + Math.cos(a) * r, d > R]; };
    // map edge
    for (const b of m.bases) { if (b.dead) continue; const [x, y] = pt(b.pos); g.fillStyle = b.team === p.team ? COL.ally : COL.enemy; g.fillRect(x - 3, y - 3, 6, 6); }
    for (const v of m.vehicles.list) { if (v.dead) continue; const [x, y, out] = pt(v.pos); if (out) continue; g.fillStyle = v.team === p.team ? 'rgba(90,168,255,0.7)' : 'rgba(255,90,79,0.7)'; g.fillRect(x - 1.5, y - 1.5, 3, 3); }
    for (const c of m.crafts) { if (!c.alive || c === p || c.wreck) continue; const [x, y, out] = pt(c.pos); if (out) continue; g.fillStyle = c.team === p.team ? COL.ally : COL.enemy; g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = COL.me; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx - 4, cy + 4); g.lineTo(cx + 4, cy + 4); g.fill();
    text('N', ...(() => { const [x, y] = pt(p.pos.clone().add(new THREE.Vector3(0, 0, -range * 0.9))); return [x, y + 4]; })(), COL.dim, 10, 'center', true);
  }
  // ---- warnings. Arcade: banners on screen. Realistic: only what the aircraft itself has - the voice warning system of
  // jets that carry one, and radar-warning / ground-proximity tones on Cold War and later jets; no instructional text
  // (the tutorials teach take-off and landing)
  function warnings(game, p) {
    const m = game.match, w = [], real = m.cfg.realistic, cues = [];
    if (p.missileWarn > 0.3) { w.push(['MISSILE', '#ff3b30', true]); cues.push('missile'); }
    const ahead = p.pos.clone().addScaledVector(p.vel, 4), agl = p.pos.y - m.world.groundAt(p.pos.x, p.pos.z);
    if (ahead.y < m.world.groundAt(ahead.x, ahead.z) + 20 && p.vel.y < -5) { w.push(['PULL UP', '#ff3b30', true]); cues.push('pullup'); }
    if (p.stalled) { w.push(['STALL', '#ffc04d']); cues.push('stall'); }
    if (Damage.burning(p.dm) && p.dm.comps.some(c => c.type === 'engine' && c.fire > 0)) cues.push('fire');
    if (p.fuel < 0.12 && !p.onGround) cues.push('fuel');
    if (real && !p.onGround && !p.gearDown && !Models.layout(p.def).fixed && agl < 120 && p.speed < p.perf.vs * 1.6 && p.ctl.throttle < 0.4) cues.push('gear');
    if (p.glocT > 0) w.push(['G-LOC — UNCONSCIOUS', '#ff3b30', true]); else if (!real && (p.gVision || 0) > 0.45) w.push(['HIGH G — EASE OFF', '#ffc04d']); else if (!real && (p.gVision || 0) < -0.4) w.push(['NEGATIVE G', '#ff3b30']);
    if (Math.abs(p.pos.x) > m.half || Math.abs(p.pos.z) > m.half) w.push([`OUT OF BOUNDS ${Math.max(0, Math.ceil(20 - game.oobT))}`, '#ffc04d', true]);
    if (p.dm.fx.ctrl === 0) w.push(['PILOT KNOCKED OUT', '#ff3b30']);
    const shown = real ? w.filter(x => /G-LOC|OUT OF BOUNDS|KNOCKED/.test(x[0])) : w;
    shown.forEach(([t, c, blink], i) => { if (blink && Math.floor(m.time * 4) % 2) return; text(t, W / 2, H * 0.3 + i * 26, c, 20, 'center', true); });
    if (p.def.voice) for (const k of cues) Sound.voice(p.def.voice, k, m.time);                    // the aircraft's voice warning system
    if ((cues.includes('missile') || cues.includes('pullup')) && (p.def.rwr || !real)) Sound.warn(m.time); // RWR / GPWS tones
  }
  // ---- match status (top centre)
  function topBar(game) {
    const m = game.match, cx = W / 2;
    if (m.mode === 'tutorial') return Tutorial.draw(g, W, H, m, game.camera, text, proj);
    const tl = m.cfg.time ? Math.max(0, m.cfg.time - m.time) : m.time, mm = Math.floor(tl / 60), ss = Math.floor(tl % 60);
    const clock = `${mm}:${String(ss).padStart(2, '0')}`;
    g.fillStyle = 'rgba(8,14,22,0.55)'; round(cx - 170, 10, 340, 46, 10); g.fill();
    const myTeam = m.player ? m.player.team : 0;
    if (m.mode === 'destroy' || m.mode === 'dogfight') {
      const a = m.scores[myTeam], b = m.scores[1 - myTeam];
      text(String(a), cx - 110, 42, COL.ally, 24, 'center', true); text(String(b), cx + 110, 42, COL.enemy, 24, 'center', true);
      text(clock, cx, 32, COL.white, 16, 'center', true); text(MODE_NAMES[m.mode].toUpperCase() + (m.mode === 'dogfight' ? ' · KILLS' : ' · POINTS'), cx, 48, COL.dim, 9, 'center');
      if (m.mode === 'dogfight') { const lv = t => m.crafts.filter(c => c.team === t).reduce((s, c) => s + Math.max(0, c.lives === Infinity ? 0 : c.lives) + (c.alive && !c.wreck ? 0 : 0), 0); text(`lives ${lv(myTeam)}`, cx - 110, 54, COL.dim, 9, 'center'); text(`lives ${lv(1 - myTeam)}`, cx + 110, 54, COL.dim, 9, 'center'); }
    } else if (m.mode === 'missions') {
      text(m.mission.name, cx, 30, COL.white, 14, 'center', true); text(objectiveText(m) + ' · ' + clock, cx, 48, COL.dim, 11, 'center');
    } else { text(`WAVE ${m.wave}`, cx, 32, COL.white, 16, 'center', true); text(`${m.crafts.filter(c => c.team === 1 && c.alive && !c.wreck).length} enemies · ${clock}`, cx, 48, COL.dim, 11, 'center'); }
  }
  function objectiveText(m) {
    const ms = m.mission;
    if (ms.type === 'sweep') return `Enemy aircraft left: ${m.crafts.filter(c => c.team === 1 && (c.alive && !c.wreck)).length}`;
    if (ms.type === 'intercept') return `Bombers left: ${m.crafts.filter(c => c.team === 1 && c.spec.task === 'bomb' && c.alive && !c.wreck).length}`;
    const o = m.bases.filter(b => b.team === 1 && b.objective); return `Targets destroyed: ${o.filter(b => b.dead).length}/${o.length}` + (ms.type === 'escort' ? ` · bombers: ${m.crafts.filter(c => c.team === 0 && c.spec.task === 'bomb' && c.alive && !c.wreck).length}` : '');
  }
  return { init, draw, clear, resize, objectiveText };
})();
