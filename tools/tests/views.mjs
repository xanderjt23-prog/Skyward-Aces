// node tools/tests/cdp.mjs tools/tests/views.mjs : screenshots of maps / weather / night / cockpits / tanks
// CASES="map:weather:night:plane:cam:mode,..."  (cam = chase | nose | tank | base)
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const cases = (process.env.CASES || 'alps:clear:0:p51d:chase:destroy,canyon:scattered:0:f16c:nose:destroy,farmland:overcast:0:camel:nose:destroy,jungle:rain:0:bf109g:nose:destroy,arctic:snow:0:f4e:chase:destroy,land:storm:1:spit9:chase:destroy,coast:fog:0:p51d:tank:destroy,desert:clear:1:f15c:nose:destroy').split(',');
  for (const cs of cases) {
    const [map, wx, night, plane, cam, mode] = cs.split(':');
    const r = await t.eval(`(() => { const p = Profile.get(); p.owned['${plane}'] = true; p.selected = '${plane}';
      const cfg = Plan.build({ mode: '${mode || 'destroy'}', teamSize: [6, 6], time: 600, map: '${map}', weather: '${wx}', night: ${night === '1'}, size: 'medium', respawns: 2 }, [{ name: 'Tester', plane: '${plane}', loadout: Profile.loadoutFor('${plane}'), owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match; m.player.ai = new BotBrain(m.player, 0.8);
      for (let k = 0; k < 150; k++) Game.update(1/30);
      Game.camMode = '${cam}' === 'nose' ? 'nose' : 'chase';
      if ('${cam}' === 'tank') { const v = m.vehicles.list.find(v => !v.dead); if (v) { const pl = m.player; pl.pos.copy(v.pos).add(new THREE.Vector3(60, 45, 90)); const d = v.pos.clone().sub(pl.pos).normalize(); pl.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d); pl.vel.copy(d).multiplyScalar(80); Game.aimReset(); } }
      if ('${cam}' === 'nose') { const pl = m.player; Game.aimReset(); }
      if ('${cam}'.startsWith('base')) { const kind = '${cam}'.slice(5); const b = m.bases.find(x => x.kind === kind) || m.bases[0]; const pl = m.player; const d = Math.max(400, b.radius * 2.2);
        pl.pos.copy(b.pos).add(new THREE.Vector3(d * 0.8, d * 0.7, d * 0.8)); pl.pos.y = Math.max(pl.pos.y, m.world.groundAt(pl.pos.x, pl.pos.z) + 150); const dir = b.pos.clone().sub(pl.pos).normalize(); pl.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir); pl.vel.copy(dir).multiplyScalar(60); Game.aimReset(); Game.camDist = 0.6; }
      if (!'${cam}'.startsWith('base')) Game.update(1/30); Game.render(); return 'ok ' + m.world.weather.name + ' tanks ' + m.vehicles.list.length; })()`);
    console.log(cs, r);
    await t.shot('view-' + cs.replace(/:/g, '_'));
    await t.eval('Game.leave(); document.querySelector("#res-ok") && document.querySelector("#res-ok").click(); 1');
  }
}
