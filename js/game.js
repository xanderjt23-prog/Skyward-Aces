// ============================================================================
// Game: renderer, the main loop, the menu backdrop, and the in-battle
// controller (mouse aim, keyboard, camera, respawns, results).
// ============================================================================
const Game = (() => {
  let renderer, scene, camera, menuScene, menuCam, menuPlane = null, clock;
  const G = {
    match: null, running: false, paused: false, aimDir: new THREE.Vector3(0, 0, -1), mouseAim: true,
    camMode: 'chase', camDist: 1, freeLook: { yaw: 0, pitch: 0 }, target: null, seeker: null, locked: false, lockT: 0, oobT: 0, endT: 0, net: false,
  };
  let yaw = 0, pitch = 0;
  const BASE_FOV = 65;
  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true }); // log depth: no z-fighting across 100 km views
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.setSize(innerWidth, innerHeight);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.08, 150000);
    const hemi = new THREE.HemisphereLight(0xdfeeff, 0x4a5a3a, 0.75); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.95); sun.position.set(0.5, 1, 0.3); scene.add(sun);
    scene.userData.lights = { hemi, sun }; // weather and night dim / tint these
    FX.init(scene); scene.add(camera);
    // menu backdrop: sky gradient, slowly turning aircraft
    menuScene = new THREE.Scene();
    menuScene.add(new THREE.HemisphereLight(0xdfeeff, 0x445566, 0.9)); const ms = new THREE.DirectionalLight(0xffffff, 0.9); ms.position.set(-0.6, 1, 0.8); menuScene.add(ms);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false,
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
    G.cockpit = null;
    G.match = new Match(cfg, { scene, isHost: opt.isHost !== false, net: opt.net, myPeer: opt.myPeer || 'H', playerId: opt.playerId });
    G.running = true; G.paused = false; G.endT = 0; G.target = null; G.oobT = 0; G.camMode = 'chase'; G.resultShown = false;
    const p = G.match.player; G.aimDir.set(0, 0, -1).applyQuaternion(p.quat); yaw = Math.atan2(-G.aimDir.x, -G.aimDir.z); pitch = 0;
    Sound.resume(); Sound.engineStart(p.def);
    camera.position.copy(p.pos).add(new THREE.Vector3(0, 10, 30));
    UI.enterBattle(G.match);
    requestLock();
  }
  function setAim(y, p) { yaw = y; pitch = p; }
  function aimReset() { const p = G.match && G.match.player; if (!p) return; const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat); yaw = Math.atan2(-f.x, -f.z); pitch = Math.asin(Math.max(-1, Math.min(1, f.y))); G.aimDir.copy(f); }
  function stopMatch() {
    if (G.match) { G.match.dispose(); G.match = null; }
    G.running = false; Sound.stopAll();
  }
  function requestLock() { const c = document.getElementById('view'); if (c.requestPointerLock) try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  // ---- input
  function bindInput() {
    const view = document.getElementById('view');
    // a key or mouse button went down: holds are read each frame, presses act now
    function press(code, e) {
      Input.keys[code] = true;
      const m = G.match, p = m && m.player;
      for (const act of Input.actionsFor(code)) {
        if (e && (act === 'scoreboard' || act === 'bombs')) e.preventDefault();
        if (act === 'scoreboard') UI.scoreboard(true);
        if (!p) continue;
        if (act === 'camera') G.camMode = G.camMode === 'chase' ? 'nose' : 'chase';
        if (p.alive && !p.wreck) {
          if (act === 'bombs') p.dropBomb();
          if (act === 'rockets') p.fireRockets();
          if (act === 'missile') { if (G.locked && G.seeker) { if (p.fireMissile(G.seeker)) { G.lockT = 0; G.locked = false; } } else UI.toast('No missile lock'); }
          if (act === 'flares') p.dropFlares();
          if (act === 'gear') p.toggleGear && p.toggleGear();
        }
      }
      if (p && !p.alive && (code === 'Space' || code === 'Enter' || code === 'Mouse0')) UI.tryRespawn();
    }
    function release(code) { Input.keys[code] = false; if (Input.actionsFor(code).includes('scoreboard')) UI.scoreboard(false); if (Input.actionsFor(code).includes('freeLook')) G.freeLook.yaw = G.freeLook.pitch = 0; }
    addEventListener('keydown', e => {
      if (!G.running || UI.capturing) return; if (e.target && e.target.tagName === 'INPUT') return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) press(e.code, e);
    });
    addEventListener('keyup', e => release(e.code));
    view.addEventListener('mousedown', e => { if (!G.running) return; if (document.pointerLockElement !== view) { requestLock(); return; } press('Mouse' + e.button, e); });
    addEventListener('mouseup', e => release('Mouse' + e.button));
    view.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!G.running || document.pointerLockElement !== view) return;
      // zooming in lowers the mouse speed with the field of view
      const st = Profile.get().settings, s = 0.0022 * st.sens * (camera.fov / BASE_FOV), inv = st.invert ? -1 : 1;
      if (Input.down('freeLook')) { G.freeLook.yaw -= e.movementX * s; G.freeLook.pitch = Math.max(-1.3, Math.min(1.3, G.freeLook.pitch - e.movementY * s)); return; }
      yaw -= e.movementX * s; pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * s * inv));
    });
    addEventListener('wheel', e => { if (G.running) G.camDist = Math.max(0.6, Math.min(2.5, G.camDist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { if (!G.running || !G.match || G.match.over) return; const locked = document.pointerLockElement === view; if (!locked) for (const k in Input.keys) Input.keys[k] = false; G.paused = !locked; UI.pause(!locked); });
  }
  // ---- per frame
  function update(dt) {
    const m = G.match, p = m.player;
    if (p && p.alive && !p.wreck) controlPlayer(dt, p);
    else if (p) { p.setTrigger(false); }
    m.cameraPos = camera.position;
    m.update(dt);
    Sound.setListener(camera.position); Sound.tick(); Sound.flyby(m.crafts, p);
    if (p) Sound.engineSet(p);
    UI.battleTick(m, dt);
    if (m.over && !G.resultShown) { G.endT += dt; if (G.endT > 2.5) { G.resultShown = true; finish(false); } }
  }
  function controlPlayer(dt, p) {
    const m = G.match;
    G.aimDir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    Flight.steer(p, G.aimDir, p.ctl, { allowPush: false });
    // on the wheels the aim steers the nose wheel; the wings stay level
    if (p.onGround) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat); const hErr = Math.atan2(f.x * G.aimDir.z - f.z * G.aimDir.x, f.x * G.aimDir.x + f.z * G.aimDir.z); p.ctl.yaw = Math.max(-1, Math.min(1, hErr * 3)); p.ctl.roll = 0; }
    // keyboard overrides (and keyboard-only flying)
    const I = Input.down;
    if (I('rollLeft')) p.ctl.roll = -1; if (I('rollRight')) p.ctl.roll = 1;
    if (I('yawLeft')) p.ctl.yaw = -1; if (I('yawRight')) p.ctl.yaw = 1;
    if (I('pitchDown')) p.ctl.pitch = -1; if (I('pitchUp')) p.ctl.pitch = 1;
    // keyboard stick moves the aim with the aircraft so mouse aim doesn't fight it
    if (I('rollLeft') || I('rollRight') || I('pitchUp') || I('pitchDown') || I('yawLeft') || I('yawRight')) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat); yaw = Math.atan2(-f.x, -f.z); pitch = Math.asin(Math.max(-1, Math.min(1, f.y))); }
    // throttle: hold past 100% for WEP / afterburner
    if (I('throttleUp')) { if (p.ctl.throttle < 1) p.ctl.throttle = Math.min(1, p.ctl.throttle + dt * 0.6); else { G.wepT = (G.wepT || 0) + dt; if (G.wepT > 0.25) p.ctl.throttle = 1.1; } }
    else { G.wepT = 0; if (p.ctl.throttle > 1) p.ctl.throttle = 1; }
    if (I('throttleDown')) p.ctl.throttle = Math.max(0, Math.min(1, p.ctl.throttle) - dt * 0.6);
    p.brakes = I('brakes');
    if (I('fire')) p.setTrigger(true);
    // target for the lead indicator: the enemy closest to the aim
    let best = null, bs = 0.2;
    for (const c of m.crafts) { if (!c.alive || c.team === p.team || c.wreck) continue; const to = c.pos.clone().sub(p.pos), d = to.length(); if (d > 3500) continue; const a = Math.acos(Math.max(-1, Math.min(1, to.dot(G.aimDir) / d))) + (c === G.target ? -0.05 : 0); if (a < bs) { bs = a; best = c; } }
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
        // cockpit: the interior is fixed to the aircraft, the camera sits at the pilot's eye
        if (!G.cockpit || G.cockpit.def !== p.def) { if (G.cockpit) G.cockpit.group.parent && G.cockpit.group.parent.remove(G.cockpit.group); G.cockpit = Cockpit.build(p.def); G.cockpit.def = p.def; p.model.add(G.cockpit.group); }
        if (G.cockpit.group.parent !== p.model) p.model.add(G.cockpit.group);
        G.cockpit.group.visible = true; p.model.userData.glass.visible = false;
        G.cockpit.update(p, m.time);
        _off.copy(G.cockpit.eye).applyQuaternion(p.quat); camera.position.copy(p.pos).add(_off);
        camera.quaternion.copy(p.quat); if (Input.down('freeLook')) { camera.rotateY(G.freeLook.yaw); camera.rotateX(G.freeLook.pitch); }
      } else {
        if (G.cockpit) G.cockpit.group.visible = false;
        p.model.userData.body.visible = true; p.model.userData.glass.visible = true;
        let dir = G.aimDir.clone();
        if (Input.down('freeLook')) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), G.freeLook.yaw).applyAxisAngle(new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), G.freeLook.pitch);
        camera.position.copy(p.pos).addScaledVector(dir, -dist).add(_look.set(0, dist * 0.2, 0));
        const gy = m.world.groundAt(camera.position.x, camera.position.z) + 3; if (camera.position.y < gy) camera.position.y = gy;
        camera.up.set(0, 1, 0); camera.lookAt(camera.position.clone().add(dir));
      }
      G.deathCam = null;
    } else if (p) {
      // shot down: orbit the wreck / crash site
      p.model.userData.body.visible = true; p.model.userData.glass.visible = true; if (G.cockpit) G.cockpit.group.visible = false;
      if (!G.deathPos || p.alive) G.deathPos = p.pos.clone();
      if (p.wreck) G.deathPos.copy(p.pos);
      const t = performance.now() / 4000, r = 90;
      camera.position.set(G.deathPos.x + Math.cos(t) * r, Math.max(G.deathPos.y + 40, m.world.groundAt(G.deathPos.x, G.deathPos.z) + 40), G.deathPos.z + Math.sin(t) * r);
      camera.lookAt(G.deathPos);
    }
    const wantFov = p && p.alive && Input.down('zoom') ? BASE_FOV * 0.5 : BASE_FOV;
    if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * 0.2; camera.updateProjectionMatrix(); }
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
    const reward = Profile.applyBattle({ left: !!left, tanks: s.tanks || 0, kills: s.kills, assists: s.assists, basePoints: s.basePoints, damage: Math.round(s.damage / 10), deaths: s.deaths, won, era: p.def.era, mode: m.mode,
      minutes: m.time / 60, waves: m.mode === 'survival' ? Math.max(0, m.wave - 1) : 0, score: 0, nation: p.def.nation, plane: p.def.id,
      basesDestroyed: s.basesDestroyed, bigBases: s.bigBases, crewKills: s.crewKills, wingKills: s.wingKills, fires: s.fires, crashKills: s.crashKills, missileKills: s.missileKills, giantKills: s.giantKills });
    document.exitPointerLock && document.exitPointerLock();
    Sound.stopAll();
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
