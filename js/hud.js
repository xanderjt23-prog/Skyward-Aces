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
        if (d < LEAD_RANGE[p.def.era]) { const tof = d / ms, lp = t.pos.clone().addScaledVector(t.vel.clone().sub(p.vel), tof).add(new THREE.Vector3(0, 4.9 * tof * tof, 0)); const ls = proj(lp, cam);
          if (ls) { ring(ls.x, ls.y, 6, COL.enemy, 2); g.beginPath(); g.moveTo(ls.x - 9, ls.y); g.lineTo(ls.x + 9, ls.y); g.moveTo(ls.x, ls.y - 9); g.lineTo(ls.x, ls.y + 9); g.strokeStyle = COL.enemy; g.lineWidth = 1; g.stroke(); } }
      }
      // bomb sight: where bombs released now would hit
      if (p.count('b') > 0 && p.pos.y - m.world.groundAt(p.pos.x, p.pos.z) > 30) {
        const ip = p.bombImpact(), bs = ip && proj(ip, cam);
        if (bs) { for (const [col, w] of [['rgba(0,0,0,0.6)', 4], ['#ffd34d', 2]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(bs.x, bs.y - 10); g.lineTo(bs.x + 10, bs.y); g.lineTo(bs.x, bs.y + 10); g.lineTo(bs.x - 10, bs.y); g.closePath(); g.stroke(); }
          text('BOMBS', bs.x, bs.y + 24, '#ffd34d', 10, 'center', true); }
      }
      // missile seeker
      if (game.seeker) { const ss = proj(game.seeker.pos, cam); if (ss) { g.strokeStyle = game.locked ? '#ff3b30' : '#ffd34d'; g.lineWidth = 2; g.beginPath(); g.arc(ss.x, ss.y, 18, 0, Math.PI * 2); g.stroke(); if (game.locked) text('LOCK', ss.x, ss.y - 24, '#ff3b30', 11, 'center', true); } }
      if (m.hitMarker && m.time - m.hitMarker < 0.12 && ns) { g.strokeStyle = '#ffd34d'; g.lineWidth = 2; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(ns.x + a * 8, ns.y + b * 8); g.lineTo(ns.x + a * 15, ns.y + b * 15); g.stroke(); } }
      gauges(game, p); damageView(p); radar(game, p); warnings(game, p);
    }
    topBar(game);
    if (p && p.alive && document.pointerLockElement !== document.getElementById('view') && !game.paused && !m.over) text('Click to take control (mouse aim)', W / 2, H * 0.62, '#ffd34d', 18, 'center', true);
  }
  // ---- bottom-centre flight data and weapons
  function gauges(game, p) {
    const cx = W / 2, y = H - 64;
    g.fillStyle = 'rgba(8,14,22,0.55)'; round(cx - 250, y - 22, 500, 76, 10); g.fill();
    const spd = Math.round(p.speed * 3.6), alt = Math.round(p.pos.y), thr = p.ctl.throttle;
    const thrTxt = thr > 1.01 ? (p.def.ab ? 'AB' : 'WEP') : Math.round(thr * 100) + '%';
    text('SPD', cx - 230, y - 4, COL.dim, 10); text(spd + ' km/h', cx - 230, y + 14, COL.white, 16, 'left', true);
    text('ALT', cx - 120, y - 4, COL.dim, 10); text(alt + ' m', cx - 120, y + 14, COL.white, 16, 'left', true);
    text('THR', cx - 20, y - 4, COL.dim, 10); text(thrTxt, cx - 20, y + 14, thr > 1.01 ? '#ffb347' : COL.white, 16, 'left', true);
    text('G', cx + 60, y - 4, COL.dim, 10); text((p.gLoad || 1).toFixed(1), cx + 60, y + 14, COL.white, 16, 'left', true);
    text('FUEL', cx + 120, y - 4, COL.dim, 10); text(Math.round(p.fuel * 100) + '%', cx + 120, y + 14, p.dm.fx.leak > 0.001 ? '#ffc04d' : COL.white, 16, 'left', true);
    if (p.def.kind === 'jet') { text('M', cx + 185, y - 4, COL.dim, 10); text((p.speed / 340).toFixed(2), cx + 185, y + 14, COL.white, 16, 'left', true); }
    // weapons line
    const parts = [];
    const ga = p.totalAmmo(); parts.push(`GUNS ${ga.a | 0}`);
    for (const g2 of p.guns) if (g2.pod) parts.push(`POD ${Math.max(0, g2.pod.gunAmmo | 0)}`);
    const nb = p.count('b'), nr = p.count('r'), nm = p.count('m');
    if (nb) parts.push(`BOMBS ${nb} [${Input.label(Input.bind('bombs'))}]`); if (nr) parts.push(`ROCKETS ${nr} [${Input.label(Input.bind('rockets'))}]`);
    if (nm) { const st = p.missileStation(); parts.push(`${st.s.name.split(' ')[0]} ×${nm} [${Input.label(Input.bind('missile'))}]`); }
    if (p.def.flares) parts.push(`FLARES ${p.flares} [${Input.label(Input.bind('flares'))}]`);
    if (game.match.cfg.realistic) parts.push(Models.layout(p.def).fixed ? 'GEAR FIXED' : p.gearDown ? 'GEAR ▼ DOWN' : 'GEAR ▲ UP');
    text(parts.join('   '), cx, y + 40, COL.white, 12, 'center');
  }
  function round(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // ---- damage schematic: the hit boxes seen from above, coloured by condition
  function damageView(p) {
    const dm = p.dm, lay = Models.layout(p.def), bx = 18, by = H - 230, bw = 190, bh = 200;
    g.fillStyle = 'rgba(8,14,22,0.55)'; round(bx, by, bw, bh, 10); g.fill();
    text('AIRCRAFT CONDITION', bx + 10, by + 16, COL.dim, 10, 'left', true);
    const sc = Math.min((bw - 30) / lay.S, (bh - 70) / lay.L), cx = bx + bw / 2, cy = by + 24 + (bh - 70) / 2 + 6;
    const order = ['wing', 'tailH', 'tailV', 'fuselage', 'fuel', 'ammo', 'engine', 'crew'];
    for (const type of order) for (const c of dm.comps) {
      if (c.type !== type) continue;
      const f = c.dead ? 0 : c.hp / c.max;
      let col = c.dead ? 'rgba(40,40,40,0.9)' : f > 0.75 ? 'rgba(90,200,110,0.55)' : f > 0.4 ? 'rgba(255,200,70,0.8)' : 'rgba(255,80,60,0.9)';
      if (c.type === 'crew' && !c.dead) col = f > 0.99 ? 'rgba(120,200,255,0.9)' : 'rgba(255,80,60,0.95)';
      if (c.dead && (c.type === 'wing' || c.type === 'tailH')) col = 'rgba(0,0,0,0)';
      g.fillStyle = col; g.fillRect(cx + c.lo.x * sc, cy + c.lo.z * sc, (c.hi.x - c.lo.x) * sc, (c.hi.z - c.lo.z) * sc);
      if (c.fire > 0) text('🔥', cx + c.c.x * sc, cy + c.c.z * sc + 4, '#fff', 12, 'center');
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
  function warnings(game, p) {
    const m = game.match, w = [];
    if (p.missileWarn > 0.3) w.push(['MISSILE', '#ff3b30', true]);
    const ahead = p.pos.clone().addScaledVector(p.vel, 4);
    if (ahead.y < m.world.groundAt(ahead.x, ahead.z) + 20 && p.vel.y < -5) w.push(['PULL UP', '#ff3b30', true]);
    if (p.stalled) w.push(['STALL', '#ffc04d']);
    if (p.glocT > 0) w.push(['G-LOC — UNCONSCIOUS', '#ff3b30', true]); else if ((p.gVision || 0) > 0.45) w.push(['HIGH G — EASE OFF', '#ffc04d']); else if ((p.gVision || 0) < -0.4) w.push(['NEGATIVE G', '#ff3b30']);
    if (Math.abs(p.pos.x) > m.half || Math.abs(p.pos.z) > m.half) w.push([`OUT OF BOUNDS ${Math.max(0, Math.ceil(20 - game.oobT))}`, '#ffc04d', true]);
    if (p.dm.fx.ctrl === 0) w.push(['PILOT KNOCKED OUT', '#ff3b30']);
    // Realistic mode: take-off, landing and servicing prompts
    if (m.cfg.realistic) {
      const key = a => Input.label(Input.bind(a)), lay = Models.layout(p.def), agl = p.pos.y - m.world.groundAt(p.pos.x, p.pos.z);
      let hint = null;
      if (p.onGround) {
        if (p.serviceT > 0 && !p.serviced && p.atHome) hint = `Servicing aircraft… ${Math.floor(p.serviceT / Craft.SERVICE_TIME * 100)}%`;
        else if (p.speed < 3 && p.atHome && p.serviced) hint = 'Ready — throttle up to take off';
        else if (p.ctl.throttle < 0.5) hint = `Throttle up (${key('throttleUp')}) to take off — pull up at about ${Math.round(p.perf.vs * 1.3 * 3.6)} km/h`;
        else if (p.speed < p.perf.vs * 1.3) hint = `Take-off roll… rotate at ${Math.round(p.perf.vs * 1.3 * 3.6)} km/h`;
        else hint = 'Pull up gently to lift off';
        if (p.atHome && p.speed > 3 && p.ctl.throttle < 0.2) hint = `Stop on the runway to refuel, rearm and repair (brakes: ${key('brakes')})`;
      } else {
        const home = m.bases.find(b => b.home && b.team === p.team && !b.dead && b.runway && b.runway.c.distanceTo(p.pos) < 4000);
        if (p.gearDown && !lay.fixed && agl > 250) hint = `Raise the landing gear (${key('gear')})`;
        else if (home && agl < 500 && !p.gearDown && !lay.fixed) hint = `Lower the landing gear (${key('gear')}) to land and service the aircraft`;
        else if (home && agl < 300) hint = `Land on the runway: gentle sink, wings level, below ${Math.round((p.perf.vs * 1.9 + 15) * 3.6)} km/h`;
      }
      if (hint) text(hint, W / 2, H * 0.7, '#cfe6ff', 15, 'center', true);
    }
    w.forEach(([t, c, blink], i) => { if (blink && Math.floor(m.time * 4) % 2) return; text(t, W / 2, H * 0.3 + i * 26, c, 20, 'center', true); });
    if ((w.some(x => x[0] === 'MISSILE') || w.some(x => x[0] === 'PULL UP'))) Sound.warn(m.time);
  }
  // ---- match status (top centre)
  function topBar(game) {
    const m = game.match, cx = W / 2;
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
