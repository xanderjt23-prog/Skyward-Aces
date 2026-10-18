// node tools/tests/cdp.mjs tools/tests/gunnery.mjs : an imperfect "human" (aim circle wobbles ~2 deg around the lead marker,
// reacts with a lag, fires on the FIRE cue) against one bot, with and without the gunnery assist
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const plane of (process.env.PLANES || 'p51d,bf109e,f86f').split(','))
  for (const diff of ['rookie', 'regular']) for (const assist of [true, false]) {
    const res = [];
    for (let trial = 0; trial < 3; trial++) {
      const r = await t.eval(`(() => { const pr = Profile.get(); pr.owned['${plane}'] = true; pr.settings.assist = ${assist};
        const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], respawns: 0, time: 0, map: 'land', weather: 'clear', difficulty: '${diff}' }, [{ name: 'T', plane: '${plane}', loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]);
        Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match, p = m.player, e = m.crafts.find(c => c.team === 1);
        // start 500 m behind the bot, same heading
        p.pos.set(0, 2000, 0); e.pos.set(30, 2050, -500); e.quat.copy(p.quat); e.vel.copy(p.vel); e.spawnT = -10; p.spawnT = -10; Game.aimReset();
        let wob = new THREE.Vector3(), lag = new THREE.Vector3(0, 0, -1), hitT = -1, shots = 0;
        for (let i = 0; i < 30 * 60; i++) {
          if (i % 12 === 0) wob.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.07);
          const want = e.alive ? p.leadPoint(e).sub(p.pos).normalize().add(wob).normalize() : lag;
          lag.lerp(want, 0.12).normalize(); // the hand lags behind the eye
          Game.setAim(Math.atan2(-lag.x, -lag.z), Math.asin(Math.max(-1, Math.min(1, lag.y))));
          const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat), d = e.pos.distanceTo(p.pos), lp = p.leadPoint(e).sub(p.pos).normalize();
          const fire = e.alive && Math.acos(Math.max(-1, Math.min(1, lp.dot(f)))) < Math.max(0.015, 12 / d) && d < 800;
          Input.keys.Mouse0 = fire; if (fire) shots++;
          Game.update(1 / 30);
          if ((!e.alive || e.wreck || e.dm.destroyed) && hitT < 0) { hitT = m.time; break; }
          if (!p.alive) break;
        }
        Input.keys.Mouse0 = false;
        const out = hitT > 0 ? hitT.toFixed(0) + 's' : (p.alive ? 'none' : 'died'); Game.leave(); document.querySelector('#res-ok') && document.querySelector('#res-ok').click(); return out + '/' + Math.round(shots / 30) + 'sFire'; })()`);
      res.push(r);
    }
    console.log(plane.padEnd(7), diff.padEnd(8), assist ? 'assist ' : 'manual ', res.join('  '));
  }
}
