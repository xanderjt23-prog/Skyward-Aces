// node tools/tests/cdp.mjs tools/tests/radardrill.mjs : the radar missile step of the missile defence tutorial.
// Flying straight at the launcher should get the player hit; beaming low with chaff should defeat it.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  for (const how of ['straight', 'notch+chaff']) {
    const r = await t.eval(`(() => { const cfg = Plan.build({ mode: 'tutorial', tutorial: 'flares' }, [{ name: 'T', plane: 'ef2000uk', owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match; for (let k = 0; k < 20; k++) Game.update(1/30);
      const T = m.tut, p = m.player; T.step = 2; T.S = {}; T.stepT = 0; T.survived = 2; T.launchT = 0.5; p.spawnT = -99;
      const V = THREE.Vector3, hp0 = p.dm.comps.reduce((a, c) => a + c.hp, 0); let warn = '', cm = 0;
      for (let i = 0; i < 30 * 40 && !m.over && p.alive; i++) {
        const ms = m.combat.missiles.find(x => x.target === p);
        if ('${how}' !== 'straight' && ms) { const L = ms.owner.pos.clone().sub(p.pos).setY(0).normalize(), side = new V(-L.z, 0, L.x);
          const gy = m.world.groundAt(p.pos.x, p.pos.z); p.vel.copy(side).multiplyScalar(260); p.vel.y = p.pos.y - gy > 400 ? -60 : 0; p.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(p.pos, p.pos.clone().add(p.vel), new V(0, 1, 0)));
          if (i % 15 === 0 && cm++ < 12) p.dropFlares(); }
        Game.update(1/30); if (p.wLaunch != null && m.time - p.wLaunch < 0.1) warn = 'RWR launch'; }
      return JSON.stringify({ how: '${how}', survived: T.survived, step: m.over ? 'done' : T.step, alive: p.alive, damaged: p.dm.comps.reduce((a, c) => a + c.hp, 0) < hp0, warn }); })()`);
    console.log(r);
    await t.eval("Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); 1");
  }
}
