// node tools/tests/cdp.mjs tools/tests/crashlog.mjs : logs the state of every undamaged bot that flies into the ground
// (AI mode, speed, vertical speed, height above the ground 2 s before, G, stalled / G-LOC) on a mountainous map
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval(`(() => { window.__cl = []; const plane = '${process.env.PLANE || 'f16c'}', cfg = Plan.build({ mode: 'destroy', teamSize: [8, 8], time: 600, map: '${process.env.MAP || 'alps'}' }, [{ name: 'T', plane, loadout: Profile.loadoutFor(plane), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match; m.player.ai = new BotBrain(m.player, 0.8);
    const hist = new Map(); window.__hist = hist;
    const oc = m.onCrash.bind(m); m.onCrash = (c, sea) => { if (c.dm && c.dm.frac < 0.05 && !c.dm.destroyed) { const h = hist.get(c) || [];
        __cl.push({ id: c.def.id, mode: c.ai && c.ai.mode, task: c.spec.task, spd: Math.round(c.speed * 3.6), vy: Math.round(c.vel.y), g: +(c.gLoad || 0).toFixed(1), stall: !!c.stalled, gloc: c.glocT > 0, ctrl: c.dm.fx.ctrl,
          path: h.map(x => x.agl + '/' + x.vy + '/' + x.pull).join(' '), tgt: c.ai && c.ai.target ? Math.round(c.ai.target.pos.y - m.world.groundAt(c.ai.target.pos.x, c.ai.target.pos.z)) : null, pullOut: c.ai && +(c.ai.pullOut || 0).toFixed(1), ground: c.ai && c.ai.ground ? 1 : 0 }); }
      return oc(c, sea); };
    return 1; })()`);
  for (let s = 0; s < 120; s++) await t.eval(`(() => { const m = Game.match; for (let k = 0; k < 30; k++) { Game.update(1/30);
      if (k % 10 === 0) for (const c of m.crafts) { if (!c.alive) continue; const h = __hist.get(c) || []; h.push({ agl: Math.round(c.pos.y - m.world.groundAt(c.pos.x, c.pos.z)), vy: Math.round(c.vel.y), pull: (c.ai && c.ai.pullOut > 0) ? 'P' : '' }); if (h.length > 9) h.shift(); __hist.set(c, h); } } return 1; })()`);
  const log = JSON.parse(await t.eval('JSON.stringify(__cl)'));
  console.log('undamaged crashes:', log.length); for (const x of log.slice(0, 14)) console.log(JSON.stringify(x));
}
