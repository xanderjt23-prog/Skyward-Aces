// node tools/tests/cdp.mjs tools/tests/live.mjs : the published site (URL=..., default the GitHub Pages address) loads,
// every photo and sound it refers to is there (the server is case-sensitive, Windows is not), a battle runs, and the
// build it serves is the same as the local files (BUILD meta tag)
import fs from 'fs';
export default async function (t) {
  const url = process.env.URL || 'https://xanderjt23-prog.github.io/Skyward-Aces/';
  await t.goto(url + '?nocache=' + Date.now());
  await new Promise(r => setTimeout(r, 3000));
  const local = (fs.readFileSync('index.html', 'utf8').match(/name="build" content="([^"]*)"/) || [])[1];
  console.log('build served:', await t.eval("(document.querySelector('meta[name=build]') || {}).content || 'none'"), '| local:', local || 'none');
  console.log('globals:', await t.eval("['THREE', 'PLANES', 'Game', 'UI', 'Profile', 'EQUIP', 'PHOTO_CREDITS', 'Peer'].map(k => k + (typeof window[k] !== 'undefined' || eval('typeof ' + k) !== 'undefined' ? ' ok' : ' MISSING')).join(', ')"));
  const missing = await t.eval(`(async () => { const urls = Object.values(PHOTO_CREDITS).map(c => c.src).concat(['merlin', 'radial', 'propcruise', 'draken', 'spitfire', 'shot3006', 'shot3006far', 'shot762r', 'shotarisaka', 'cannon', 'expl1', 'expl2', 'expl3'].map(k => 'assets/sounds/' + k + '.js'));
    const bad = []; await Promise.all(urls.map(async u => { try { const r = await fetch(u, { method: 'HEAD', cache: 'no-store' }); if (!r.ok) bad.push(r.status + ' ' + u); } catch (e) { bad.push('ERR ' + u); } }));
    return urls.length + ' files checked, missing: ' + (bad.join(', ') || 'none'); })()`);
  console.log(missing);
  const r = await t.eval(`(() => { const cfg = Plan.build({ mode: 'dogfight', teamSize: [4, 4], time: 600, map: 'land', size: 'medium', weather: 'clear', realistic: true }, [{ name: 'T', plane: 'f16c', loadout: Profile.loadoutFor('f16c'), owner: 'H', team: 0 }]);
    Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); for (let k = 0; k < 600; k++) Game.update(1/30); Game.render();
    const m = Game.match; return 'battle ran 20 s: ' + m.crafts.length + ' aircraft, ' + m.crafts.filter(c => c.alive).length + ' alive'; })()`);
  console.log(r); await t.shot('live');
}
