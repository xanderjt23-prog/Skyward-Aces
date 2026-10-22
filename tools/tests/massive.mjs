// node tools/tests/cdp.mjs tools/tests/massive.mjs : map sizes. Build time, terrain detail, render time and a view
// from altitude for each size (SIZE env to pick one), plus where the teams start and the bases sit.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const [plane, size, map] of [['f16c', 'medium', 'alps'], ['f16c', 'massive', 'alps'], ['p51d', 'massive', 'coast'], ['camel', 'massive', 'farmland']]) {
    const r = await t.eval(`(() => { const t0 = performance.now();
      const cfg = Plan.build({ mode: 'destroy', teamSize: [8, 8], time: 600, map: '${map}', size: '${size}', weather: 'clear' }, [{ name: 'T', plane: '${plane}', loadout: Profile.loadoutFor('${plane}'), owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const build = performance.now() - t0, m = Game.match, p = m.player;
      p.pos.y += 3000; Game.camMode = 'chase'; for (let k = 0; k < 10; k++) Game.update(1/30);
      let rt = 0; for (let k = 0; k < 20; k++) { const a = performance.now(); Game.render(); rt += performance.now() - a; }
      const blue = m.crafts.filter(c => c.team === 0), red = m.crafts.filter(c => c.team === 1), avgZ = l => Math.round(l.reduce((a, c) => a + c.pos.z, 0) / l.length);
      let tris = 0; m.scene.traverse(o => { if (o.isLOD) tris++; });
      return JSON.stringify({ plane: '${plane}', size: '${size}', map: '${map}', worldKm: Math.round(m.half * 2 / 1000), battleKm: Math.round(m.spread * 2 / 1000), buildMs: Math.round(build), renderMs: +(rt / 20).toFixed(1), chunks: tris,
        startGapKm: +((avgZ(blue) - avgZ(red)) / 1000).toFixed(1), bases: m.bases.map(b => Math.round(Math.hypot(b.pos.x, b.pos.z) / 1000) + 'km').join(' '), fog: [Math.round(m.scene.fog.near), Math.round(m.scene.fog.far)] }); })()`);
    console.log(r);
    await t.eval("Game.render(); 1"); await t.shot(`map-${size}-${map}`);
    await t.eval("(() => { const p = Game.match.player; p.pos.y += 9000; Game.camMode = 'chase'; for (let k = 0; k < 3; k++) Game.update(1/30); Game.render(); return 1; })()"); await t.shot(`map-${size}-${map}-high`);
    await t.eval("Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); 1");
  }
}
