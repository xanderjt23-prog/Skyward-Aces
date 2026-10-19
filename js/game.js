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
    hemi.layers.enable(1); sun.layers.enable(1); // they also light the cockpit pass (layer 1)
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
        if (e && (act === 'scoreboard' || act === 'bombs' || act === 'brakes')) e.preventDefault();
        if (act === 'scoreboard') UI.scoreboard(true);
        if (!p) continue;
        if (act === 'camera') G.camMode = G.camMode === 'chase' ? 'nose' : 'chase';
        if (act === 'bombsight') { if (p.def.bombsight) G.camMode = G.camMode === 'sight' ? 'chase' : 'sight'; else UI.toast('No bombsight on this aircraft'); }
        if (p.alive && !p.wreck) {
          if (act === 'bombs') p.dropBomb();
          if (act === 'rockets') p.fireRockets();
          if (act === 'missile') { if (G.locked && G.seeker) { if (p.fireMissile(G.seeker)) { G.lockT = 0; G.locked = false; } } else UI.toast('No missile lock'); }
          if (act === 'flares') p.dropFlares();
          if (act === 'gear') p.toggleGear && p.toggleGear();
          if (act === 'flapsDown') p.setFlaps(1);
          if (act === 'flapsUp') p.setFlaps(-1);
          if (act === 'guns') p.cycleGuns();
          if (act === 'missileSelect') { if (p.cycleMissile()) UI.toast('Missile: ' + STORES[p.missileSel].name); }
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
      G.mouseMoved = (G.mouseMoved || 0) + Math.abs(e.movementX) + Math.abs(e.movementY);
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
    let steerDir = G.aimDir; G.assisting = false;
    if (Profile.get().settings.assist !== false && G.target && G.target.alive) {
      const d = G.target.pos.distanceTo(p.pos);
      if (d < 1500) { const ld = p.leadPoint(G.target).sub(p.pos).normalize(); if (Math.acos(Math.max(-1, Math.min(1, ld.dot(G.aimDir)))) < 0.07) { steerDir = ld; G.assisting = true; } }
    }
    Flight.steer(p, steerDir, p.ctl, { allowPush: false, pilot: true });
    // on the wheels the aim steers the nose wheel; the wings stay level
    if (p.onGround) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat); const hErr = Math.atan2(f.x * G.aimDir.z - f.z * G.aimDir.x, f.x * G.aimDir.x + f.z * G.aimDir.z); p.ctl.yaw = Math.max(-1, Math.min(1, hErr * 3)); p.ctl.roll = 0; }
    // ---- keyboard: A/D roll, Q/E rudder, arrows pitch. The inputs ramp in (~0.4 s), and the pitch keys are a
    // manual override: they bypass the autopilot's AoA / G limits (that's how you stall, spin or cobra).
    const I = Input.down;
    const kr = (I('rollRight') ? 1 : 0) - (I('rollLeft') ? 1 : 0), kp = (I('pitchUp') ? 1 : 0) - (I('pitchDown') ? 1 : 0), ky = (I('yawRight') ? 1 : 0) - (I('yawLeft') ? 1 : 0);
    const ramp = (v, t, r) => v + Math.max(-r, Math.min(r, t - v));
    G.kr = ramp(G.kr || 0, kr, dt * (kr ? 2.5 : 6)); G.kp = ramp(G.kp || 0, kp, dt * (kp ? 2.5 : 6)); G.ky = ramp(G.ky || 0, ky, dt * (ky ? 3 : 6));
    const lim = Flight.limits(p), ax = Flight.axes(p), bank = Math.atan2(-ax.right.y, ax.up.y);
    // the pull that holds the flight path level at the current bank (a coordinated level turn)
    const levelPull = () => { const b = Math.max(-1.3, Math.min(1.3, bank)), v = Math.max(30, p.speed); return Math.max(-0.5, Math.min(1, ((9.81 / v) * Math.sin(b) * Math.tan(b) - p.vel.y * 0.004) / Math.max(lim.q, 0.05))); };
    // the aim point glides along with the nose while flying by hand, so the view follows smoothly
    const followNose = r => { const f = ax.fwd; const ty = Math.atan2(-f.x, -f.z), tp = Math.asin(Math.max(-1, Math.min(1, f.y))); let d = ty - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; yaw += d * Math.min(1, r); pitch += (tp - pitch) * Math.min(1, r); };
    if (kr || kp || ky) {
      if (kr || Math.abs(G.kr) > 0.02) p.ctl.roll = G.kr;
      if (kp || Math.abs(G.kp) > 0.02) { p.ctl.pitch = G.kp; p.ctl.manual = G.kp > 0.6; } else p.ctl.pitch = levelPull();
      if (ky) p.ctl.yaw = G.ky;
      followNose(dt * 5); G.byHand = true; G.bankHold = null;
    } else if (G.byHand) {
      // keys released: hold the bank you rolled to in a level turn, until the mouse moves again
      G.byHand = false; followNose(1); G.mouseMoved = 0;
      G.bankHold = Math.abs(bank) > 0.09 && Math.abs(bank) < 2.0 ? bank : null;
    }
    if (G.bankHold != null && !kr && !kp && !ky) {
      if (G.mouseMoved > 12) G.bankHold = null;
      else { let d = G.bankHold - bank; p.ctl.roll = Math.max(-1, Math.min(1, d * 2.6 / Math.max(lim.p, 0.3))); p.ctl.pitch = levelPull(); p.ctl.yaw = 0; followNose(dt * 5); }
    }
    if (p.glocT > 0) { p.ctl.pitch = p.ctl.roll = p.ctl.yaw = 0; p.ctl.manual = false; }
    // throttle: hold past 100% for WEP / afterburner
    if (I('throttleUp')) { if (p.ctl.throttle < 1) p.ctl.throttle = Math.min(1, p.ctl.throttle + dt * 0.6); else { G.wepT = (G.wepT || 0) + dt; if (G.wepT > 0.25) p.ctl.throttle = 1.1; } }
    else { G.wepT = 0; if (p.ctl.throttle > 1) p.ctl.throttle = 1; }
    if (I('throttleDown')) p.ctl.throttle = Math.max(0, Math.min(1, p.ctl.throttle) - dt * 0.6);
    p.brakes = I('brakes'); p.airbrakeOut = I('brakes') && p.def.airbrake && !p.onGround;
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
      if (G.camMode === 'sight' && p.def.bombsight) {
        // the bomb aimer's sight in the nose: the telescope looks forward-down along the dropping angle, so the cross wires
        // (screen centre) mark where a bomb released now lands; gyro-stabilised sights stay level while the aircraft rolls
        if (G.cockpit) G.cockpit.group.visible = false; p.model.visible = false;
        const lay = Models.layout(p.def), sight = p.def.bombsight;
        _off.set(0, -lay.fr * 0.6, -lay.L * 0.4).applyQuaternion(p.quat); camera.position.copy(p.pos).add(_off);
        const ip = p.bombImpact(), look = ip || p.pos.clone().add(new THREE.Vector3(p.vel.x, 0, p.vel.z).normalize().multiplyScalar(400)).setY(m.world.groundAt(p.pos.x, p.pos.z));
        const track = new THREE.Vector3(p.vel.x, 0, p.vel.z); if (track.lengthSq() < 1) track.set(0, 0, -1).applyQuaternion(p.quat).setY(0); track.normalize();
        if (sight.gyro) camera.up.copy(track); else camera.up.set(0, 0, -1).applyQuaternion(p.quat); // screen-up = the ground track (drift shows as the wires' angle)
        camera.lookAt(look); G.sightImpact = ip;
      } else if (G.camMode === 'nose') {
        // cockpit: the interior is fixed to the aircraft, the camera sits at the pilot's eye
        if (!G.cockpit || G.cockpit.def !== p.def) { if (G.cockpit) G.cockpit.group.parent && G.cockpit.group.parent.remove(G.cockpit.group); G.cockpit = Cockpit.build(p.def); G.cockpit.def = p.def; G.cockpit.group.traverse(o => o.layers.set(1)); p.model.add(G.cockpit.group); }
        if (G.cockpit.group.parent !== p.model) p.model.add(G.cockpit.group);
        G.cockpit.group.visible = true; p.model.userData.glass.visible = false;
        G.cockpit.update(p, m.time);
        _off.copy(G.cockpit.eye).applyQuaternion(p.quat); camera.position.copy(p.pos).add(_off);
        camera.quaternion.copy(p.quat); if (Input.down('freeLook')) { camera.rotateY(G.freeLook.yaw); camera.rotateX(G.freeLook.pitch); }
      } else {
        if (G.cockpit) G.cockpit.group.visible = false; p.model.visible = true;
        p.model.userData.body.visible = true; p.model.userData.glass.visible = true;
        let dir = G.aimDir.clone();
        if (Input.down('lookTarget') && G.target && G.target.alive) dir = G.target.pos.clone().sub(p.pos).normalize();
        if (Input.down('freeLook')) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), G.freeLook.yaw).applyAxisAngle(new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), G.freeLook.pitch);
        camera.position.copy(p.pos).addScaledVector(dir, -dist).add(_look.set(0, dist * 0.2, 0));
        const gy = m.world.groundAt(camera.position.x, camera.position.z) + 3; if (camera.position.y < gy) camera.position.y = gy;
        camera.up.set(0, 1, 0); camera.lookAt(camera.position.clone().add(dir));
      }
      G.deathCam = null;
    } else if (p) {
      // shot down: orbit the wreck / crash site
      p.model.visible = true; p.model.userData.body.visible = true; p.model.userData.glass.visible = true; if (G.cockpit) G.cockpit.group.visible = false; if (G.camMode === 'sight') G.camMode = 'chase';
      if (!G.deathPos || p.alive) G.deathPos = p.pos.clone();
      if (p.wreck) G.deathPos.copy(p.pos);
      const t = performance.now() / 4000, r = 90;
      camera.position.set(G.deathPos.x + Math.cos(t) * r, Math.max(G.deathPos.y + 40, m.world.groundAt(G.deathPos.x, G.deathPos.z) + 40), G.deathPos.z + Math.sin(t) * r);
      camera.up.set(0, 1, 0); camera.lookAt(G.deathPos);
    }
    const sightOn = G.camMode === 'sight' && p && p.alive && p.def.bombsight, wantFov = sightOn ? (Input.down('zoom') ? 6 : 14) : p && p.alive && Input.down('zoom') ? BASE_FOV * 0.5 : BASE_FOV; // the sight's telescope magnifies ~4x
    if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * 0.2; camera.updateProjectionMatrix(); }
    FX.update(1 / 60, camera, innerHeight);
    if (G.cockpit && G.cockpit.group.visible) {
      // the cockpit interior sits inside the fuselage skin, and is always nearer than anything outside it should cover:
      // draw the world, then the cockpit (layer 1) over it with a fresh depth buffer
      camera.layers.set(0); renderer.render(scene, camera);
      renderer.autoClear = false; renderer.clearDepth(); camera.layers.set(1); renderer.render(scene, camera);
      renderer.autoClear = true; camera.layers.set(0);
    } else renderer.render(scene, camera);
    HUD.draw(G);
  }
  // ---- results and rewards
  function finish(left) {
    const m = G.match; if (!m) return;
    const p = m.player, r = m.result || { winner: -2, reason: 'Left the battle', scores: m.scores };
    if (m.mode === 'tutorial') { // practice: no rewards, no statistics
      document.exitPointerLock && document.exitPointerLock(); Sound.stopAll();
      return UI.showResults(m, { won: !left && r.winner === 0, left, reward: { xp: 0, coins: 0, achievements: [], levelUp: 0 }, reason: left ? 'Tutorial left' : r.reason }); }
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
