// ============================================================================
// Game: renderer, the main loop, the menu backdrop, and the in-battle
// controller (mouse aim, keyboard, camera, respawns, results).
// ============================================================================
const Game = (() => {
  let renderer, scene, camera, menuScene, menuCam, menuPlane = null, clock;
  const G = {
    match: null, running: false, paused: false, aimDir: new THREE.Vector3(0, 0, -1), mouseAim: true, keys: {}, mouse: { l: false, r: false },
    camMode: 'chase', camDist: 1, freeLook: { yaw: 0, pitch: 0 }, target: null, seeker: null, locked: false, lockT: 0, oobT: 0, endT: 0, net: false,
  };
  let yaw = 0, pitch = 0;
  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.setSize(innerWidth, innerHeight);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 1, 120000);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a5a3a, 0.75));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.95); sun.position.set(0.5, 1, 0.3); scene.add(sun);
    FX.init(scene);
    // menu backdrop: sky gradient, slowly turning aircraft
    menuScene = new THREE.Scene();
    menuScene.add(new THREE.HemisphereLight(0xdfeeff, 0x445566, 0.9)); const ms = new THREE.DirectionalLight(0xffffff, 0.9); ms.position.set(-0.6, 1, 0.8); menuScene.add(ms);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vp; void main(){ float t = clamp(vp.y*1.4+0.25,0.0,1.0); vec3 c = mix(vec3(0.82,0.66,0.48), vec3(0.18,0.34,0.58), pow(t,0.8)); gl_FragColor = vec4(c,1.0); }' }));
    menuScene.add(sky);
    menuCam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 2000);
    window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = menuCam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); menuCam.updateProjectionMatrix(); });
    bindInput();
    clock = new THREE.Clock();
    requestAnimationFrame(frame);
  }
  function showPlane(id) {
    if (menuPlane) menuScene.remove(menuPlane);
    const pl = PLANES[id]; menuPlane = Models.aircraft(pl); menuScene.add(menuPlane);
    const r = Math.max(pl.span, pl.len); menuPlane.userData.r = r;
    menuCam.position.set(r * 0.95, r * 0.32, r * 1.05); menuCam.lookAt(0, -r * 0.05, 0);
  }
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    if (G.running && G.match) { if (!G.paused || G.net) update(dt); render(); }
    else if (menuPlane && !G.freeze) {
      menuPlane.rotation.y += dt * 0.25; menuPlane.position.y = Math.sin(performance.now() / 1400) * menuPlane.userData.r * 0.02;
      for (const p of menuPlane.userData.props) p.rotation.z += dt * 30;
      // keep the aircraft in the right part of the screen, clear of the menus
      // in the hangar the aircraft sits above the stats column on the right (smaller), elsewhere right of the menus
      const side = G.menuView === 'side' && innerWidth > 900, r = menuPlane.userData.r * (side ? 2.4 : 1);
      menuCam.position.set(r * 0.95, r * 0.32, r * 1.05); menuCam.lookAt(0, -menuPlane.userData.r * 0.05, 0);
      if (side) menuCam.setViewOffset(innerWidth, innerHeight, innerWidth * (0.5 - 0.84), innerHeight * (0.5 - 0.19), innerWidth, innerHeight);
      else menuCam.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.12, innerHeight * 0.02, innerWidth, innerHeight);
      renderer.render(menuScene, menuCam);
    }
  }
  // ---- battle lifecycle
  function startMatch(cfg, opt) {
    stopMatch();
    G.net = !!opt.net;
    G.match = new Match(cfg, { scene, isHost: opt.isHost !== false, net: opt.net, myPeer: opt.myPeer || 'H', playerId: opt.playerId });
    G.running = true; G.paused = false; G.endT = 0; G.target = null; G.oobT = 0; G.camMode = 'chase'; G.resultShown = false;
    const p = G.match.player; G.aimDir.set(0, 0, -1).applyQuaternion(p.quat); yaw = Math.atan2(-G.aimDir.x, -G.aimDir.z); pitch = 0;
    Sound.resume(); Sound.engineStart(p.def.kind === 'jet');
    camera.position.copy(p.pos).add(new THREE.Vector3(0, 10, 30));
    UI.enterBattle(G.match);
    requestLock();
  }
  function setAim(y, p) { yaw = y; pitch = p; }
  function aimReset() { const p = G.match && G.match.player; if (!p) return; const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat); yaw = Math.atan2(-f.x, -f.z); pitch = Math.asin(Math.max(-1, Math.min(1, f.y))); G.aimDir.copy(f); }
  function stopMatch() {
    if (G.match) { G.match.dispose(); G.match = null; }
    G.running = false; Sound.engineStop(); Sound.lockTone(0);
  }
  function requestLock() { const c = document.getElementById('view'); if (c.requestPointerLock) try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  // ---- input
  function bindInput() {
    addEventListener('keydown', e => {
      if (!G.running) return; if (e.target && e.target.tagName === 'INPUT') return;
      G.keys[e.code] = true;
      const m = G.match, p = m && m.player;
      if (e.code === 'Tab') { e.preventDefault(); UI.scoreboard(true); }
      if (!p) return;
      if (e.code === 'KeyC') G.camMode = G.camMode === 'chase' ? 'nose' : 'chase';
      if (p.alive && !p.wreck) {
        if (e.code === 'Space') { e.preventDefault(); p.dropBomb(); }
        if (e.code === 'KeyR') p.fireRockets();
        if (e.code === 'KeyF') { if (G.locked && G.seeker) { if (p.fireMissile(G.seeker)) { G.lockT = 0; G.locked = false; } } else UI.toast('No missile lock'); }
        if (e.code === 'KeyX') p.dropFlares();
      } else if (e.code === 'Space' || e.code === 'Enter') UI.tryRespawn();
    });
    addEventListener('keyup', e => { G.keys[e.code] = false; if (e.code === 'Tab') UI.scoreboard(false); });
    const view = document.getElementById('view');
    view.addEventListener('mousedown', e => { if (!G.running) return; if (document.pointerLockElement !== view) { requestLock(); return; }
      const pp = G.match && G.match.player; if (pp && !pp.alive && e.button === 0) { UI.tryRespawn(); return; } if (e.button === 0) G.mouse.l = true; if (e.button === 2) G.mouse.r = true; });
    addEventListener('mouseup', e => { if (e.button === 0) G.mouse.l = false; if (e.button === 2) { G.mouse.r = false; G.freeLook.yaw = G.freeLook.pitch = 0; } });
    view.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!G.running || document.pointerLockElement !== view) return;
      const s = 0.0022 * Profile.get().settings.sens, inv = Profile.get().settings.invert ? -1 : 1;
      if (G.mouse.r) { G.freeLook.yaw -= e.movementX * s; G.freeLook.pitch = Math.max(-1.3, Math.min(1.3, G.freeLook.pitch - e.movementY * s)); return; }
      yaw -= e.movementX * s; pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * s * inv));
    });
    addEventListener('wheel', e => { if (G.running) G.camDist = Math.max(0.6, Math.min(2.5, G.camDist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { if (!G.running || !G.match || G.match.over) return; const locked = document.pointerLockElement === view; G.paused = !locked; UI.pause(!locked); });
  }
  // ---- per frame
  function update(dt) {
    const m = G.match, p = m.player;
    if (p && p.alive && !p.wreck) controlPlayer(dt, p);
    else if (p) { p.setTrigger(false); }
    m.cameraPos = camera.position;
    m.update(dt);
    if (p) { Sound.engineSet(p.ctl.throttle, p.speed ? p.speed / p.perf.vmax : 0, p.alive && !p.wreck && p.fuel > 0); }
    UI.battleTick(m, dt);
    if (m.over && !G.resultShown) { G.endT += dt; if (G.endT > 2.5) { G.resultShown = true; finish(false); } }
  }
  function controlPlayer(dt, p) {
    const k = G.keys, m = G.match;
    G.aimDir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    Flight.steer(p, G.aimDir, p.ctl, { allowPush: false });
    // keyboard overrides (and keyboard-only flying)
    if (k.KeyA) p.ctl.roll = -1; if (k.KeyD) p.ctl.roll = 1;
    if (k.KeyQ) p.ctl.yaw = -1; if (k.KeyE) p.ctl.yaw = 1;
    if (k.ArrowUp) p.ctl.pitch = -1; if (k.ArrowDown) p.ctl.pitch = 1; if (k.ArrowLeft) p.ctl.roll = -1; if (k.ArrowRight) p.ctl.roll = 1;
    // keyboard stick moves the aim with the aircraft so mouse aim doesn't fight it
    if (k.KeyA || k.KeyD || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight || k.KeyQ || k.KeyE) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat); yaw = Math.atan2(-f.x, -f.z); pitch = Math.asin(Math.max(-1, Math.min(1, f.y))); }
    // throttle: hold W past 100% for WEP / afterburner
    if (k.KeyW || k.ShiftLeft) { if (p.ctl.throttle < 1) p.ctl.throttle = Math.min(1, p.ctl.throttle + dt * 0.6); else { G.wepT = (G.wepT || 0) + dt; if (G.wepT > 0.25) p.ctl.throttle = 1.1; } }
    else { G.wepT = 0; if (p.ctl.throttle > 1) p.ctl.throttle = 1; }
    if (k.KeyS || k.ControlLeft) p.ctl.throttle = Math.max(0, Math.min(1, p.ctl.throttle) - dt * 0.6);
    if (G.mouse.l) p.setTrigger(true);
    // target for the lead indicator: the enemy closest to the aim
    let best = null, bs = 0.2;
    for (const c of m.crafts) { if (!c.alive || c.team === p.team || c.wreck) continue; const to = c.pos.clone().sub(p.pos), d = to.length(); if (d > 3000) continue; const a = Math.acos(Math.max(-1, Math.min(1, to.dot(G.aimDir) / d))) + (c === G.target ? -0.05 : 0); if (a < bs) { bs = a; best = c; } }
    G.target = best;
    // missile seeker and lock tone
    const st = p.missileStation();
    if (st) {
      const hobs = st.s.fov >= 45; const sk = p.seekerTarget(st, hobs ? G.aimDir : null);
      if (sk && sk === G.seeker) G.lockT += dt; else { G.lockT = 0; }
      G.seeker = sk; G.locked = !!sk && G.lockT > (st.s.seek === 'ir' ? 0.7 : 1.2);
      Sound.lockTone(sk ? (G.locked ? 2 : 1) : 0);
    } else { G.seeker = null; G.locked = false; Sound.lockTone(0); }
    // out of bounds
    if (Math.abs(p.pos.x) > m.half || Math.abs(p.pos.z) > m.half) { G.oobT += dt; if (G.oobT > 20) { G.oobT = 0; m.onCrash(p, false); } } else G.oobT = 0;
  }
  const _off = new THREE.Vector3(), _look = new THREE.Vector3();
  function render() {
    const m = G.match, p = m.player;
    const focus = p && (p.alive || p.wreck) ? p : (G.deathCam || p);
    if (p && p.alive && !p.wreck) {
      const lay = Models.layout(p.def), dist = (Math.max(lay.S, lay.L) * 1.25 + 6) * G.camDist;
      if (G.camMode === 'nose') {
        p.model.userData.body.visible = false; p.model.children[1].visible = false;
        _off.set(0, lay.fr * 1.7, lay.cockZ - 0.6).applyQuaternion(p.quat); camera.position.copy(p.pos).add(_off);
        camera.quaternion.copy(p.quat); if (G.mouse.r) { camera.rotateY(G.freeLook.yaw); camera.rotateX(G.freeLook.pitch); }
      } else {
        p.model.userData.body.visible = true; p.model.children[1].visible = true;
        let dir = G.aimDir.clone();
        if (G.mouse.r) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), G.freeLook.yaw).applyAxisAngle(new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), G.freeLook.pitch);
        camera.position.copy(p.pos).addScaledVector(dir, -dist).add(_look.set(0, dist * 0.2, 0));
        const gy = m.world.groundAt(camera.position.x, camera.position.z) + 3; if (camera.position.y < gy) camera.position.y = gy;
        camera.up.set(0, 1, 0); camera.lookAt(camera.position.clone().add(dir));
      }
      G.deathCam = null;
    } else if (p) {
      // shot down: orbit the wreck / crash site
      p.model.userData.body.visible = true; p.model.children[1].visible = true;
      if (!G.deathPos || p.alive) G.deathPos = p.pos.clone();
      if (p.wreck) G.deathPos.copy(p.pos);
      const t = performance.now() / 4000, r = 90;
      camera.position.set(G.deathPos.x + Math.cos(t) * r, Math.max(G.deathPos.y + 40, m.world.groundAt(G.deathPos.x, G.deathPos.z) + 40), G.deathPos.z + Math.sin(t) * r);
      camera.lookAt(G.deathPos);
    }
    FX.update(1 / 60, camera, innerHeight);
    renderer.render(scene, camera);
    HUD.draw(G);
  }
  // ---- results and rewards
  function finish(left) {
    const m = G.match; if (!m) return;
    const p = m.player, r = m.result || { winner: -2, reason: 'Left the battle', scores: m.scores };
    const won = !left && (m.mode === 'survival' ? m.wave >= 5 : r.winner === p.team);
    const s = p.stats;
    const reward = Profile.applyBattle({ kills: s.kills, assists: s.assists, basePoints: s.basePoints, damage: Math.round(s.damage / 10), deaths: s.deaths, won, era: p.def.era, mode: m.mode,
      minutes: m.time / 60, waves: m.mode === 'survival' ? Math.max(0, m.wave - 1) : 0, score: 0, nation: p.def.nation, plane: p.def.id,
      basesDestroyed: s.basesDestroyed, bigBases: s.bigBases, crewKills: s.crewKills, wingKills: s.wingKills, fires: s.fires, crashKills: s.crashKills, missileKills: s.missileKills, giantKills: s.giantKills });
    document.exitPointerLock && document.exitPointerLock();
    Sound.engineStop(); Sound.lockTone(0);
    UI.showResults(m, { won, left, reward, reason: r.reason });
  }
  function leave() {
    if (!G.match) return;
    if (!G.match.over) finish(true); else if (!G.resultShown) { G.resultShown = true; finish(false); }
  }
  Object.assign(G, { setAim, aimReset, init, startMatch, stopMatch, showPlane, update, render, leave, requestLock, finish });
  Object.defineProperties(G, { camera: { get: () => camera }, scene: { get: () => scene }, renderer: { get: () => renderer } });
  return G;
})();
