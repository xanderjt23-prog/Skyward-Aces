// node tools/tests/cdp.mjs tools/tests/maps.mjs : every map, checked and pictured. For a destroy battle on each map:
// bases in water / on land as they should be, how level the ground under each base is, runway slope, spawn height above
// the terrain, how fair the layout is (distance from each team's spawn to the enemy bases), the highest terrain inside the
// battle area; and an overview picture from high above.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const maps = (process.env.MAPS || 'land,coast,islands,desert,snow,alps,canyon,farmland,jungle,arctic').split(','), size = process.env.SIZE || 'medium', plane = process.env.PLANE || 'p51d';
  for (const map of maps) {
    const r = await t.eval(`(() => { const cfg = Plan.build({ mode: 'destroy', teamSize: [8, 8], time: 600, map: '${map}', size: '${size}', weather: 'clear', realistic: true }, [{ name: 'T', plane: '${plane}', loadout: Profile.loadoutFor('${plane}'), owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match, w = m.world; for (let k = 0; k < 5; k++) Game.update(1/30);
      const issues = [];
      for (const b of m.bases) { const hs = []; for (let a = 0; a < 8; a++) for (const f of [0.3, 0.7]) hs.push(w.groundAt(b.pos.x + Math.cos(a * 0.785) * b.radius * f, b.pos.z + Math.sin(a * 0.785) * b.radius * f));
        const raw = w.heightAt(b.pos.x, b.pos.z), spread = Math.max(...hs) - Math.min(...hs), water = b.kind === 'ship' || b.kind === 'carrier';
        if (water && raw > -2) issues.push(b.kind + ' on land (' + Math.round(raw) + ' m)'); if (!water && raw < 1) issues.push(b.kind + ' in water'); if (!water && spread > 6) issues.push(b.kind + ' ' + b.size + ' on uneven ground (' + Math.round(spread) + ' m)');
        if (b.runway) { const r0 = b.runway, a0 = w.groundAt(r0.c.x - r0.dir.x * r0.len / 2, r0.c.z - r0.dir.z * r0.len / 2), a1 = w.groundAt(r0.c.x + r0.dir.x * r0.len / 2, r0.c.z + r0.dir.z * r0.len / 2); if (Math.abs(a0 - a1) > 3) issues.push('runway slope ' + Math.round(Math.abs(a0 - a1)) + ' m'); } }
      for (const c of m.crafts) if (c.alive && !c.onGround && c.pos.y - w.groundAt(c.pos.x, c.pos.z) < 150) issues.push('spawn ' + Math.round(c.pos.y - w.groundAt(c.pos.x, c.pos.z)) + ' m above ground');
      const spawn = t0 => { const l = m.crafts.filter(c => c.team === t0); return l.reduce((a, c) => a.add(c.pos), new THREE.Vector3()).divideScalar(l.length); };
      const reach = t0 => { const s = spawn(t0), e = m.bases.filter(b => b.team !== t0); return e.length ? Math.round(e.reduce((a, b) => a + Math.hypot(b.pos.x - s.x, b.pos.z - s.z), 0) / e.length / 100) / 10 : 0; };
      let top = 0; for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) top = Math.max(top, w.groundAt((i / 20 - 0.5) * m.spread * 2, (j / 20 - 0.5) * m.spread * 2));
      const bases = [0, 1].map(t0 => m.bases.filter(b => b.team === t0).map(b => b.kind[0] + b.size[0]).join(''));
      // overview from high above the middle, looking down at an angle
      const p = m.player; p.pos.set(0, top + m.spread * 0.9, m.spread * 1.1); p.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(p.pos, new THREE.Vector3(0, 0, -m.spread * 0.2), new THREE.Vector3(0, 1, 0))); Game.camMode = 'nose'; Game.update(1/30); Game.render();
      return '${map}'.padEnd(9) + ' bases ' + bases.join(' v ') + ' | to enemy bases: blue ' + reach(0) + ' km, red ' + reach(1) + ' km | top ' + Math.round(top) + ' m | ' + (issues.length ? issues.join('; ') : 'ok'); })()`);
    console.log(r); await t.shot('map-' + map);
    await t.eval("(() => { Game.camMode = 'chase'; Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); return 1; })()");
  }
}
