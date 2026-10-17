// node tools/tests/cdp.mjs tools/tests/realistic.mjs : Realistic mode - take-off from the runway, landing, servicing (PLANE env)
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const plane = process.env.PLANE || 'p51d';
  console.log(await t.eval(`(() => { const p = Profile.get(); p.owned['${plane}'] = true; p.selected = '${plane}';
    const cfg = Plan.build({ mode: '${process.env.MODE || 'dogfight'}', teamSize: [4, 4], respawns: 2, time: 900, realistic: true }, [{ name: 'Tester', plane: '${plane}', loadout: Profile.loadoutFor('${plane}'), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true });
    const m = Game.match, pl = m.player; return 'homes ' + m.bases.filter(b => b.home).map(b => b.team + ':' + b.runway.len).join(',') + ' player onGround ' + pl.onGround + ' gear ' + pl.gearDown + ' y ' + pl.pos.y.toFixed(1); })()`));
  // the player takes off: full throttle, aim along the runway, then raise the aim once fast
  const st = "(() => { const m = Game.match, p = m.player, g = m.world.groundAt(p.pos.x, p.pos.z); return 'agl ' + (p.pos.y - g).toFixed(1) + ' spd ' + (p.speed * 3.6 | 0) + ' ground ' + p.onGround + ' gear ' + p.gearDown + ' alive ' + p.alive + ' | bots airborne ' + m.crafts.filter(c => c.isBot && c.alive && !c.onGround).length + '/' + m.crafts.filter(c => c.isBot).length; })()";
  await t.eval("Input.keys.KeyW = true; Game.aimReset(); 1");
  for (let i = 0; i < 40; i++) {
    await t.eval("(() => { const p = Game.match.player; if (p.speed > p.perf.vs * 1.3) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat); Game.setAim(Math.atan2(-f.x, -f.z), 0.18); } for (let k = 0; k < 15; k++) Game.update(1/30); return 1; })()");
    if (i % 4 === 3) console.log('t' + (i + 1) / 2, await t.eval(st));
  }
  await t.eval("Input.keys.KeyW = false; 1");
  // landing: put the player on a 3 degree approach to the home runway, gear down, slow
  console.log(await t.eval(`(() => { const m = Game.match, p = m.player, h = m.bases.find(b => b.home && b.team === p.team), r = h.runway;
    const start = r.c.clone().addScaledVector(r.dir, -r.len / 2 - 700); start.y = m.world.groundAt(r.c.x, r.c.z) + 38;
    p.pos.copy(start); p.quat.setFromEuler(new THREE.Euler(0, Math.atan2(-r.dir.x, -r.dir.z), 0, 'YXZ')); p.vel.copy(r.dir).multiplyScalar(p.perf.vs * 1.45); p.gearDown = true; p.ctl.throttle = 0.35; Game.aimReset();
    window._land = { r, gy: m.world.groundAt(r.c.x, r.c.z) };
    const oc = m.onCrash.bind(m); m.onCrash = (c, sea) => { if (c === p) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quat), rr = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quat); window._crash = 'vy ' + c.vel.y.toFixed(1) + ' pitch ' + (Math.asin(f.y) * 57).toFixed(1) + ' bank ' + (Math.asin(rr.y) * 57).toFixed(1) + ' spd ' + (c.speed * 3.6 | 0) + ' gear ' + c.gearDown + ' land ' + m.world.heightAt(c.pos.x, c.pos.z).toFixed(1); } oc(c, sea); };
    return 'approach set, vs ' + (p.perf.vs * 3.6 | 0) + ' km/h'; })()`));
  for (let i = 0; i < 70; i++) {
    // simple autoland for the test: aim at the runway threshold on a shallow glide path, flare near the ground, then brake
    await t.eval(`(() => { const m = Game.match, p = m.player, L = window._land; if (!p.alive) return 0;
      for (let k = 0; k < 15; k++) {
        const agl = p.pos.y - m.world.groundAt(p.pos.x, p.pos.z), td = L.r.c.clone().addScaledVector(L.r.dir, -L.r.len / 2 + 150);
        const along = p.pos.clone().sub(td).dot(L.r.dir); // < 0 before the touchdown point
        const wantY = L.gy + Math.max(0, -along) * 0.05 + 1;
        let pitch = Math.max(-0.12, Math.min(0.12, (wantY - p.pos.y) / 250)); if (agl < 8) pitch = 0.04;
        Game.setAim(Math.atan2(-L.r.dir.x, -L.r.dir.z), pitch);
        const thr = agl < 8 || p.onGround ? 0 : Math.max(0, Math.min(1, 0.35 + (p.perf.vs * 1.35 - p.speed) * 0.06));
        Input.keys.KeyS = false; Input.keys.KeyB = p.onGround; Game.update(1/30); p.ctl.throttle = thr;
      } return 1; })()`);
    if (i % 6 === 5) console.log('L' + (i + 1) / 2, await t.eval(st + " + ' service ' + (Game.match.player.serviceT || 0).toFixed(1) + ' done ' + Game.match.player.serviced + ' atHome ' + Game.match.player.atHome"));
  }
  await t.eval("Game.render(); 1"); await t.shot('realistic');
  console.log('crash', await t.eval('window._crash || "none"'));
  console.log('events', await t.eval("Game.match.events.map(e => e.text || e.e).join(' | ')"));
}
