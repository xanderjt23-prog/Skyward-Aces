// node tools/tests/cdp.mjs tools/tests/speeds.mjs : level-flight top speeds and climb at several altitudes vs the database
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const ids = (process.env.IDS || 'camel,dr1,p26,bf109e,spit9,p51d,fw190a,me262,f86f,mig15,f104g,f4e,mig21bis,f15c,f16c,su27,f22a').split(',');
  console.log(await t.eval(`(() => {
    const m = new Match(Plan.build({ mode: 'dogfight', teamSize: [1, 1], respawns: 0 }, [{ name: 'x', plane: 'camel', loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]), { scene: Game.scene, isHost: true, playerId: 1 });
    const out = [];
    for (const id of ${JSON.stringify(ids)}) {
      const row = [id.padEnd(9), 'db ' + PLANES[id].spd];
      for (const [alt, thr] of [[300, 1], [300, 1.1], [5000, 1.1], [10000, 1], [10000, 1.1]]) {
        const c = m.addCraft({ id: 5000 + out.length * 10 + row.length, team: 0, name: 'x', plane: id, bot: false, owner: 'H', loadout: { belts: {}, stores: [], mods: {} } });
        c.spawn(new THREE.Vector3(0, alt, 0), 0, PLANES[id].spd / 3.6 * 0.8); c.ctl.throttle = thr;
        const dir = new THREE.Vector3(0, 0, -1);
        for (let i = 0; i < 90 * 30; i++) { Flight.steer(c, new THREE.Vector3(0, (alt - c.pos.y) * 0.002, -1).normalize(), c.ctl); c.ctl.throttle = thr; Flight.step(c, 1/30); }
        row.push(alt + 'm' + (thr > 1 ? '+' : '') + ' ' + (c.speed * 3.6 | 0));
        c.alive = false; m.scene.remove(c.model);
      }
      // climb at full power from 500 m, best climb speed ~ 55% vmax
      const c = m.addCraft({ id: 9000 + out.length, team: 0, name: 'x', plane: id, bot: false, owner: 'H', loadout: { belts: {}, stores: [], mods: {} } });
      c.spawn(new THREE.Vector3(0, 500, 0), 0, PLANES[id].spd / 3.6 * 0.5); let y0 = 0;
      for (let i = 0; i < 40 * 30; i++) { const want = PLANES[id].spd / 3.6 * (PLANES[id].kind === 'jet' ? 0.45 : 0.5); const pitch = Math.max(-0.2, Math.min(1.2, (c.speed - want) / 40)); Flight.steer(c, new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch)), c.ctl); c.ctl.throttle = 1.1; Flight.step(c, 1/30); if (i === 20 * 30) y0 = c.pos.y; }
      row.push('climb ' + ((c.pos.y - y0) / 20).toFixed(0) + ' (db ' + PLANES[id].clb + ')');
      m.scene.remove(c.model);
      out.push(row.join('  '));
    }
    m.dispose(); return out.join('\\n'); })()`));
}
