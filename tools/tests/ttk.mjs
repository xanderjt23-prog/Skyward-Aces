// node tools/tests/cdp.mjs tools/tests/ttk.mjs : time to kill with perfect aim against a target flying straight ahead
// (300 m), with hits / rounds fired and the damage per hit; separates "hard to hit" from "too many hits needed"
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const pairs = (process.env.PAIRS || 'p51d:bf109g,bf109g:p51d,spit9:fw190a,camel:fd7,a6m2:f4u1d,f86f:mig15,mig21bis:f4e,f16c:mig29,p51d:b17g').split(',').map(x => x.split(':'));
  for (const [me, foe] of pairs) {
    const res = [];
    for (const range of [200, 350, 500]) {
      const r = await t.eval(`(() => {
        const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], respawns: 0, time: 0, map: 'land', weather: 'clear' }, [{ name: 'T', plane: '${me}', loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]);
        cfg.roster.find(r => r.bot).plane = '${foe}'; cfg.roster.find(r => r.bot).loadout = { belts: {}, stores: [], mods: {} };
        Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match, p = m.player, e = m.crafts.find(c => c.team === 1);
        e.ai = { update() { e.ctl.throttle = 0.8; Flight.steer(e, new THREE.Vector3(0, 0, -1), e.ctl); } };
        p.pos.set(0, 2000, 0); e.pos.set(0, 2000, -${range}); e.quat.copy(p.quat); const v = Math.min(p.perf.vmax, e.perf.vmax) * 0.7; p.vel.set(0, 0, -v); e.vel.set(0, 0, -v); e.spawnT = -10; p.spawnT = -10;
        let fired = 0, t0 = m.time, kill = -1; const ammo0 = p.guns.reduce((a, g) => a + g.ammo, 0), hp0 = e.dm.comps.reduce((a, c) => a + c.hp, 0);
        for (let i = 0; i < 30 * 20; i++) {
          const lp = p.leadPoint(e).sub(p.pos).normalize(); Game.setAim(Math.atan2(-lp.x, -lp.z), Math.asin(lp.y));
          p.vel.setLength(e.speed); p.pos.copy(e.pos).addScaledVector(lp, -${range}); p.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), lp); // a perfect gun platform
          Input.keys.Mouse0 = true; Game.update(1 / 30);
          if (!e.alive || e.wreck || e.dm.destroyed) { kill = m.time - t0; break; }
        }
        Input.keys.Mouse0 = false; const used = ammo0 - p.guns.reduce((a, g) => a + g.ammo, 0), dmg = hp0 - e.dm.comps.reduce((a, c) => a + Math.max(0, c.hp), 0);
        const out = (kill > 0 ? kill.toFixed(1) + 's' : 'none') + ' ' + used + 'rds ' + (e.dm.destroyed || '').slice(0, 22); Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); return out; })()`);
      res.push(range + 'm: ' + r);
    }
    console.log((me + ' vs ' + foe).padEnd(20), res.join(' | '));
  }
}
