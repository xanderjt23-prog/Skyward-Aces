// node tools/tests/cdp.mjs tools/tests/collide.mjs : mid-air collisions in Realistic mode. Two aircraft put on a
// collision course (head-on, a slow brush of wing tips) and the damage done; then a realistic battle to see how often
// the bots collide now that they keep clear of each other; arcade mode has no collisions.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const start = realistic => t.eval(`(() => { const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], respawns: 0, time: 0, map: 'land', realistic: ${realistic} }, [{ name: 'T', plane: 'p51d', loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match; for (const c of m.crafts) { c.ai = null; c.spawnT = -99; } return 1; })()`);
  const crash = (name, setup) => t.eval(`(() => { const m = Game.match, p = m.player, e = m.crafts.find(c => c !== p), V = THREE.Vector3; for (const c of [p, e]) { c.onGround = false; c.gearDown = false; }
    const gy = m.world.groundAt(0, 0) + 2000; ${setup}
    const hp = c => c.dm.comps.filter(k => k.hp < k.max).map(k => k.id + ':' + Math.round(k.hp / k.max * 100) + '%').join(' ');
    for (let k = 0; k < 90 && p.alive && e.alive; k++) Game.update(1/30);
    return '${name}: player ' + (p.dm.destroyed ? 'DESTROYED' : hp(p) || 'undamaged') + ' | other ' + (e.dm.destroyed ? 'DESTROYED' : hp(e) || 'undamaged') + ' | msg ' + (m.events.filter(x => x.text && /collision/.test(x.text)).map(x => x.text).pop() || '-'); })()`);
  await start(true);
  console.log(await crash('head-on 2 x 120 m/s', "p.pos.set(0, gy, 300); p.quat.identity(); p.vel.set(0, 0, -120); e.pos.set(0, gy, -300); e.quat.setFromAxisAngle(new V(0, 1, 0), Math.PI); e.vel.set(0, 0, 120);"));
  await start(true);
  console.log(await crash('wing-tip brush, 8 m/s across', "p.pos.set(0, gy, 0); p.quat.identity(); p.vel.set(0, 0, -110); e.pos.set(10.5, gy, -6); e.quat.identity(); e.vel.set(-8, 0, -110);"));
  await start(false);
  console.log(await crash('arcade head-on', "p.pos.set(0, gy, 300); p.quat.identity(); p.vel.set(0, 0, -120); e.pos.set(0, gy, -300); e.quat.setFromAxisAngle(new V(0, 1, 0), Math.PI); e.vel.set(0, 0, 120);"));
  // a crowded realistic battle: how many collisions with the bots keeping clear
  console.log('crowded realistic battle', await t.eval(`(() => { const cfg = Plan.build({ mode: 'destroy', teamSize: [16, 16], time: 600, realistic: true }, [{ name: 'T', plane: 'p51d', loadout: Profile.loadoutFor('p51d'), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match; m.player.ai = new BotBrain(m.player, 0.8); let n = 0; const ap = m.applyHits.bind(m); m.applyHits = (c, h, i) => { if (i.kind === 'collision') n++; return ap(c, h, i); };
    for (let k = 0; k < 30 * 180; k++) Game.update(1/30); return 'collision hits in 3 min: ' + n + ' (same team ' + (m.collSame || 0) + ', ground ' + m.crafts.filter(c => c.onGround).length + ' on ground now), kills ' + m.crafts.reduce((a, c) => a + c.stats.kills, 0); })()`));
}
