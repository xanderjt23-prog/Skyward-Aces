// node tools/tests/cdp.mjs tools/tests/soak.mjs : long all-bot battles in every mode and era (the player flown by a bot
// too), catching exceptions, NaN positions, aircraft stuck under the ground and battles that never progress.
// SECS (default 150) per battle; MODES / ERAS to narrow.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const secs = +(process.env.SECS || 150), modes = (process.env.MODES || 'destroy,dogfight,missions,survival').split(','), eras = (process.env.ERAS || '1,2,3,4,5,6,7').split(',').map(Number);
  await t.eval("window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message).slice(0, 160))); 1");
  for (const era of eras) for (const mode of modes) {
    const r = await t.eval(`(() => { try {
      const pl = PLANE_LIST.find(x => x.era === ${era} && !x.aiOnly && x.role !== 'bomber'), p0 = Profile.get(); p0.owned[pl.id] = true; p0.selected = pl.id;
      const s = { destroy: { mode: 'destroy', teamSize: [8, 8], time: 600 }, dogfight: { mode: 'dogfight', teamSize: [4, 4], respawns: 2, time: 600 }, missions: { mode: 'missions' }, survival: { mode: 'survival', time: 600 } }['${mode}'];
      const cfg = Plan.build(Object.assign(s, { realistic: ${era % 2 === 0} }), [{ name: 'Soak', plane: pl.id, loadout: Profile.loadoutFor(pl.id), owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match; m.player.ai = new BotBrain(m.player, 0.8);
      let nan = 0, under = 0;
      for (let i = 0; i < ${secs} * 30 && !m.over; i++) { Game.update(1 / 30);
        if (i % 30 === 0) for (const c of m.crafts) { if (!c.alive) continue; if (!(c.pos.x === c.pos.x && c.pos.y === c.pos.y)) nan++; else if (!c.onGround && c.pos.y < m.world.groundAt(c.pos.x, c.pos.z) - 5) under++; } }
      Game.render();
      const k = m.crafts.reduce((a, c) => a + c.stats.kills, 0), b = m.bases.filter(x => x.dead).length;
      return '${mode}'.padEnd(9) + ' era ${era} ' + pl.id.padEnd(9) + ' t ' + Math.round(m.time) + ' over ' + m.over + ' kills ' + k + ' bases ' + b + ' nan ' + nan + ' under ' + under + ' errors ' + window.__errs.length;
    } catch (e) { return 'EXC ${mode} ${era}: ' + e.message + ' ' + (e.stack || '').split('\\n')[1]; } })()`);
    console.log(r);
    await t.eval("(() => { try { Game.leave(); } catch (e) {} const b = document.querySelector('#res-ok'); if (b) b.click(); return 1; })()");
  }
  console.log('errors:', JSON.stringify(await t.eval("JSON.stringify([...new Set(window.__errs)])")));
}
