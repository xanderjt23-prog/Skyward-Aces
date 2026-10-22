// node tools/tests/cdp.mjs tools/tests/wingmen.mjs : wingman orders. A 4 v 4 dogfight: target an enemy and order
// "attack my target" (F): both wingmen go for it; "cover me" (Y): they come to the player; "engage at will" (U).
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval(`(() => { const p = Profile.get(); p.owned.p51d = true; p.selected = 'p51d';
    const cfg = Plan.build({ mode: 'dogfight', teamSize: [4, 4], respawns: 2, time: 600 }, [{ name: 'T', plane: 'p51d', loadout: Profile.loadoutFor('p51d'), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); for (let k = 0; k < 60; k++) Game.update(1/30); return 1; })()`);
  const st = () => t.eval(`(() => { const m = Game.match, p = m.player, f = Game.flight || []; return JSON.stringify(f.map(c => ({ name: c.name, order: c.ai.order && c.ai.order.type, target: c.ai.target && c.ai.target.name, dPlayer: Math.round(c.pos.distanceTo(p.pos)) }))); })()`);
  await t.eval(`(() => { const m = Game.match, p = m.player, e = m.crafts.filter(c => c.team !== p.team && c.alive)[0], f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat); e.pos.copy(p.pos).addScaledVector(f, 900); Game.update(1/30); window.__t = Game.target && Game.target.name; return 1; })()`);
  await t.key('f'); await t.key('f', 'keyUp'); await t.eval("for (let k = 0; k < 60; k++) Game.update(1/30); 1");
  console.log('attack order on', await t.eval('window.__t'), '->', await st(), '| radio:', await t.eval("Game.match.events.filter(e => e.text && /engaging|forming/.test(e.text)).map(e => e.text).pop()"));
  await t.key('y'); await t.key('y', 'keyUp'); for (let q = 0; q < 6; q++) { await t.eval("for (let k = 0; k < 30 * 5; k++) { { const p = Game.match.player, f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat).setY(0).normalize(); p.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), f, new THREE.Vector3(0, 1, 0))); p.vel.copy(f).multiplyScalar(110); p.ctl.throttle = 0.7; } Game.update(1/30); } 1"); console.log('  cover t+' + (q + 1) * 5 + 's', await st(), 'player kmh', await t.eval('Math.round(Game.match.player.speed * 3.6)')); }
  console.log('cover order after 25 s ->', await st());
  await t.key('u'); await t.key('u', 'keyUp'); await t.eval("for (let k = 0; k < 60; k++) Game.update(1/30); 1");
  console.log('free ->', await st());
}
