// node tools/tests/cdp.mjs tools/tests/liveries.mjs : buy and apply a paint scheme, check it reaches the hangar preview and
// the aircraft in battle, and render a sheet of schemes next to the standard scheme
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  console.log(await t.eval(`(() => { localStorage.clear(); Profile.reset(); const p = Profile.get(); p.coins = 50000; p.owned.p51d = true; p.selected = 'p51d';
    const c0 = p.coins, ok = Profile.buyLivery('p51d', 'usaaf_nm'), bad = Profile.buyLivery('p51d', 'red_baron');
    const lo = Profile.loadoutFor('p51d'); return JSON.stringify({ bought: ok, wrongPlaneRejected: !bad, paid: c0 - p.coins, applied: lo.livery }); })()`));
  await t.eval("(() => { UI.open('mods'); document.querySelector('[data-mt=paint]').click(); return 1; })()"); await t.sleep(300); await t.shot('ui-paint');
  console.log(await t.eval(`(() => { const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], time: 300 }, [{ name: 'T', plane: 'p51d', loadout: Profile.loadoutFor('p51d'), owner: 'H', team: 0 }]);
    UI.close(); Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const p = Game.match.player;
    const col = p.model.userData.body.geometry.attributes.color.array; let r = 0, g = 0, b = 0; const n = col.length / 3; for (let i = 0; i < col.length; i += 3) { r += col[i]; g += col[i + 1]; b += col[i + 2]; }
    const out = 'in battle: livery ' + p.lo.livery + ', body mean colour ' + [r, g, b].map(x => (x / n).toFixed(2)).join(','); Game.leave(); const bt = document.querySelector('#res-ok'); if (bt) bt.click(); return out; })()`));
  // sheet: standard and scheme side by side
  const pairs = (process.env.PAIRS || 'p51d:usaaf_nm,f6f5:usn_gsb,a6m2:ameiro,bf109g:rlm7978,dr1:red_baron,hunter6:black_arrows,f4e:euro1,f15j:jasdf_aggr').split(',').map(x => x.split(':'));
  await t.eval(`(() => { const cv = document.createElement('canvas'); cv.id = 'lv'; cv.width = 1440; cv.height = 900; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:100001'; document.body.appendChild(cv);
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); const sc = new THREE.Scene(); sc.background = new THREE.Color(0x9cb6cf);
    sc.add(new THREE.HemisphereLight(0xdfeeff, 0x667055, 0.75)); const d = new THREE.DirectionalLight(0xfff4e0, 0.95); d.position.set(-0.6, 1, 0.5); sc.add(d);
    const pairs = ${JSON.stringify(pairs)}, cols = 4, rows = 4, w = 360, h = 225, cam = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000); r.setScissorTest(true);
    const lab = []; pairs.forEach(([id, lv], k) => [null, lv].forEach((L, j) => { const i = k * 2 + j, m = Models.aircraft(PLANES[id], L); sc.add(m); const s = Math.max(PLANES[id].span, PLANES[id].len) * 0.8;
      cam.position.set(s, s * 0.55, s * 0.9); cam.lookAt(0, 0, 0); const x = (i % cols) * w, y = 900 - (Math.floor(i / cols) + 1) * h; r.setViewport(x, y, w, h); r.setScissor(x, y, w, h); r.render(sc, cam); sc.remove(m);
      lab.push([x + 6, Math.floor(i / cols) * h + 16, id + ' — ' + (L ? LIVERY[L].name : 'standard')]); }));
    const c2 = document.createElement('canvas'); c2.width = 1440; c2.height = 900; c2.style.cssText = 'position:fixed;left:0;top:0;z-index:100002;pointer-events:none'; document.body.appendChild(c2);
    const g = c2.getContext('2d'); g.font = 'bold 12px sans-serif'; for (const [x, y, s] of lab) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x - 3, y - 12, g.measureText(s).width + 6, 16); g.fillStyle = '#000'; g.fillText(s, x, y); } return 1; })()`);
  await t.shot('liveries');
}
