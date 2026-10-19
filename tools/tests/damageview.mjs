// node tools/tests/cdp.mjs tools/tests/damageview.mjs : draws the aircraft-condition diagram of several aircraft (with some
// damage applied) and copies each into one grid for a single screenshot
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const ids = (process.env.IDS || 'camel,p51d,b17g,p38l,f15c,mirage3c,f22a,tornadoids,me262,lancaster').split(',');
  await t.eval(`(() => { const cv = document.createElement('canvas'); cv.id = 'dmggrid'; cv.width = 1000; cv.height = 440; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:100001;background:#2a3540'; document.body.appendChild(cv); return 1; })()`);
  for (let i = 0; i < ids.length; i++) {
    const r = await t.eval(`(() => { const id = '${ids[i]}'; const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], time: 300 }, [{ name: 'T', plane: id, loadout: Profile.loadoutFor(id), owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); Game.update(1/30);
      const dm = Game.match.player.dm; const set = (id, f) => { const c = dm.comps.find(c => c.id === id); if (c) c.hp = c.max * f; };
      set('wingL', 0.3); set('engine0', 0.5); set('tailH', 0.6); set('fuelR', 0.2);
      Game.render(); const hud = document.getElementById('hud'), H = hud.height, g = document.getElementById('dmggrid').getContext('2d');
      g.drawImage(hud, 18, H - 230, 190, 200, (${i} % 5) * 200, Math.floor(${i} / 5) * 220, 190, 200); g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText(id, (${i} % 5) * 200 + 6, Math.floor(${i} / 5) * 220 + 214);
      Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); return 'ok'; })()`);
    if (r !== 'ok') console.log(ids[i], r);
  }
  await t.shot('damageview');
}
