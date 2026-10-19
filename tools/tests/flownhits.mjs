// node tools/tests/cdp.mjs tools/tests/flownhits.mjs : the player flies (mouse aim on the lead marker, autopilot steering) behind
// a target flying straight and level, fires on the FIRE cue; reports rounds fired, hits, the aim error at the trigger and time to kill
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const [me, foe] of (process.env.PAIRS || 'p51d:bf109g,spit9:bf109g,bf109g:p51d,f86f:mig15,mig21bis:f4e').split(',').map(x => x.split(':'))) {
    const r = await t.eval(`(() => {
      const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], respawns: 0, time: 0, map: 'land', weather: 'clear' }, [{ name: 'T', plane: '${me}', loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]);
      cfg.roster.find(r => r.bot).plane = '${foe}'; cfg.roster.find(r => r.bot).loadout = { belts: {}, stores: [], mods: {} };
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match, p = m.player, e = m.crafts.find(c => c.team === 1);
      e.ai = { update() { e.ctl.throttle = 0.6; Flight.steer(e, new THREE.Vector3(0.05, 0, -1).normalize(), e.ctl); } };
      p.pos.set(0, 2000, 0); e.pos.set(20, 2010, -450); e.quat.copy(p.quat); const v = Math.min(p.perf.vmax, e.perf.vmax) * 0.62; p.vel.set(0, 0, -v * 1.05); e.vel.set(0, 0, -v); Game.aimReset();
      let fired = 0, hits = 0, errSum = 0, errN = 0, kill = -1; const t0 = m.time; const hp0 = e.dm.comps.reduce((a, c) => a + c.hp, 0); let lastHit = e.lastHitT;
      const fd = [];
      for (let i = 0; i < 30 * 25; i++) {
        const lp = p.leadPoint(e), dir = lp.clone().sub(p.pos).normalize(); Game.setAim(Math.atan2(-dir.x, -dir.z), Math.asin(dir.y));
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat), d = e.pos.distanceTo(p.pos), err = Math.acos(Math.max(-1, Math.min(1, dir.dot(f))));
        const fire = d < 700 && err < Math.max(0.012, 8 / d); Input.keys.Mouse0 = fire;
        const a0 = p.guns.reduce((a, g) => a + (g.pod ? 0 : g.ammo), 0); Game.update(1 / 30); const a1 = p.guns.reduce((a, g) => a + (g.pod ? 0 : g.ammo), 0);
        if (fire) { fired += a0 - a1; errSum += err; errN++; }
        if (e.lastHitT !== lastHit) { hits++; lastHit = e.lastHitT; }
        if (i % 30 === 0) fd.push(Math.round(d) + '/' + (err * 1000).toFixed(0));
        if (!e.alive || e.wreck || e.dm.destroyed) { kill = m.time - t0; break; }
      }
      Input.keys.Mouse0 = false; const out = (kill > 0 ? 'kill ' + kill.toFixed(1) + 's' : 'no kill') + ' | rounds ' + Math.round(fired) + ' | hit-frames ' + hits + ' | mean aim error at trigger ' + (errN ? (errSum / errN * 1000).toFixed(1) : '-') + ' mrad | dist/err(mrad) per s: ' + fd.join(' ');
      Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); return out; })()`);
    console.log((me + ' vs ' + foe).padEnd(18), r);
  }
}
