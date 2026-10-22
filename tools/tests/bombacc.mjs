// node tools/tests/cdp.mjs tools/tests/bombacc.mjs : the bombsight's predicted impact point against where the bomb lands
// (level release from a B-17 and a dive release from an F-16), and the bomb's time of fall
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const [plane, store, alt, dive] of [['b17g', 'an_m64', 3000, 0], ['ju87', 'sc500', 1200, -60], ['f16c', 'mk82', 1500, -20], ['f16c', 'mk82se', 200, 0]]) {
    const r = await t.eval(`(() => { const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], respawns: 0, time: 0, map: 'land', weather: 'clear' }, [{ name: 'T', plane: '${plane}', loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match, p = m.player, foe = m.crafts.find(c => c.team === 1); foe.pos.set(0, 9000, 30000); foe.ai = null;
      const gy = m.world.groundAt(0, 0), a = ${dive} * Math.PI / 180; p.pos.set(0, gy + ${alt}, 0); p.vel.set(0, Math.sin(a), -Math.cos(a)).multiplyScalar(p.def.kind === 'jet' ? 230 : 95);
      const s = STORES.${store}, ip = p.bombImpact(s);
      m.combat.bomb(p.pos.clone(), p.vel.clone(), p, s); const bm = m.combat.bombs[m.combat.bombs.length - 1]; let land = null, tt = 0;
      const orig = m.combat.explode.bind(m.combat); m.combat.explode = (q, ...rest) => { if (!land) land = q.clone(); return orig(q, ...rest); };
      for (let i = 0; i < 30 * 90 && !land; i++) { m.combat.update(1/30); tt += 1/30; }
      m.combat.explode = orig;
      return JSON.stringify({ plane: '${plane}', store: '${store}', alt: ${alt}, dive: ${dive}, predicted: ip && [Math.round(ip.x), Math.round(ip.z), +ip.tti.toFixed(1)], landed: land && [Math.round(land.x), Math.round(land.z), +tt.toFixed(1)], error_m: ip && land ? +Math.hypot(ip.x - land.x, ip.z - land.z).toFixed(1) : null }); })()`);
    console.log(r);
  }
}
