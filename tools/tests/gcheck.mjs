// node tools/tests/cdp.mjs tools/tests/gcheck.mjs : the G meter against cases with known answers: level flight (1 G), a level
// 60 deg banked turn (2 G), the hardest autopilot pull at corner speed (should sit at the aircraft's limit, not above),
// a manual overpull, and the pilot's grey-out / G-LOC timing at 6, 8 and 9 G
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const plane of (process.env.PLANES || 'p51d,spit9,f86f,f16c,f15c,su27').split(',')) {
    const r = await t.eval(`(() => { const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], respawns: 0, time: 0, map: 'land', weather: 'clear' }, [{ name: 'T', plane: '${plane}', loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match, p = m.player, e = m.crafts.find(c => c.team === 1); e.pos.set(0, 9000, 40000); e.ai = null; e.local = false;
      const run = (s, f) => { const g = []; for (let i = 0; i < s * 60; i++) { f && f(i); Flight.step(p, 1 / 60); p.gTick && p.gTick(1 / 60); if (i % 6 === 0) g.push(p.gLoad); } return g; };
      const reset = (v) => { p.pos.set(0, 3000, 0); p.quat.identity(); p.vel.set(0, 0, -v); p.rates.set(0, 0, 0); p.ctl.throttle = 1; p.gStress = 0; p.gVision = 0; p.glocT = 0; };
      const out = { gMax: p.perf.gMax, tol: p.perf.gTol };
      // 1. level
      reset(p.perf.vmax * 0.6); const lv = run(6, () => Flight.steer(p, new THREE.Vector3(0, 0, -1), p.ctl)); out.level = +lv.slice(-10).reduce((a, b) => a + b / 10, 0).toFixed(2);
      // 2. 60 deg level turn: hold the bank with the roll channel, hold the altitude with the pitch channel
      reset(p.perf.vmax * 0.6); let y0 = p.pos.y; const tv = run(8, () => { const a = Flight.axes(p), bank = Math.atan2(-a.right.y, a.up.y); p.ctl.roll = Math.max(-1, Math.min(1, (1.047 - bank) * 2)); p.ctl.yaw = 0;
        p.ctl.pitch = Math.max(-1, Math.min(1, 0.35 + (y0 - p.pos.y) * 0.01 - p.vel.y * 0.05)); p.ctl.throttle = 1.1; });
      out.turn60 = +tv.slice(-15).reduce((a, b) => a + b / 15, 0).toFixed(2);
      // 3. hardest instructor pull at corner speed, level start
      reset(Math.min(p.perf.vmax * 0.9, p.perf.vc * 1.05)); const ap = run(3, () => { Flight.steer(p, new THREE.Vector3(0, 0.9, 0.44).normalize(), p.ctl); p.gStress = 0; }); out.autoPullMax = +Math.max(...ap).toFixed(2);
      // 4. full manual pull (pitch key) at high speed
      reset(p.perf.vmax * 0.85); const mp = run(3, () => { p.ctl.pitch = 1; p.ctl.roll = 0; p.ctl.manual = true; p.gStress = 0; }); out.manualPullMax = +Math.max(...mp).toFixed(2);
      // 5. tolerance: seconds until G-LOC holding 6 / 8 / 9 G
      for (const gg of [6, 8, 9]) { p.gStress = 0; p.gVision = 0; p.glocT = 0; let t = 0; while (t < 30 && !(p.glocT > 0)) { p.gLoad = gg; p.gTick(0.05); t += 0.05; } out['gloc@' + gg] = t >= 30 ? 'none' : t.toFixed(1) + 's'; }
      Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); return JSON.stringify(out); })()`);
    console.log(plane.padEnd(8), r);
  }
}
