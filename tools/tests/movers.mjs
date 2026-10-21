// node tools/tests/cdp.mjs tools/tests/movers.mjs : flaps at the landing notch and air brakes out, in flight (the craft animates
// them), rendered from below-behind; and how long the flaps take to travel
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const ids = (process.env.IDS || 'p51d,spit9,ju87,f6f5,f86f,f16c,f15c,f4e').split(',');
  await t.eval(`(() => { const cv = document.createElement('canvas'); cv.id = 'mv'; cv.width = 1440; cv.height = 900; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:100001'; document.body.appendChild(cv);
    window.__r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); return 1; })()`);
  for (let i = 0; i < ids.length; i++) {
    const r = await t.eval(`(() => { const id = '${ids[i]}'; const cfg = Plan.build({ mode: 'dogfight', teamSize: [1, 1], time: 300 }, [{ name: 'T', plane: id, loadout: { belts: {}, stores: [], mods: {} }, owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const p = Game.match.player; p.flaps = PLANES[id].flaps === 'manual' ? 3 : 0; p.airbrakeOut = !!PLANES[id].airbrake;
      let t50 = -1; for (let k = 0; k < 240; k++) { p.render(1 / 30); if (t50 < 0 && p.flapA >= 44) t50 = k / 30; }
      const m = p.model, sc = new THREE.Scene(); sc.background = new THREE.Color(0x9cb6cf); sc.add(new THREE.HemisphereLight(0xdfeeff, 0x667055, 0.8)); const d = new THREE.DirectionalLight(0xfff4e0, 0.9); d.position.set(-0.6, 1, 0.5); sc.add(d);
      const par = m.parent; sc.add(m); m.position.set(0, 0, 0); m.quaternion.identity(); const s = Math.max(PLANES[id].span, PLANES[id].len) * 1.0, cam = new THREE.PerspectiveCamera(35, 360 / 450, 0.1, 1000);
      cam.position.set(s * 0.95, -s * 0.25, s * 0.55); cam.lookAt(0, 0, 0); const r = window.__r, x = (${i} % 4) * 360, y = 900 - (Math.floor(${i} / 4) + 1) * 450;
      r.setScissorTest(true); r.setViewport(x, y, 360, 450); r.setScissor(x, y, 360, 450); r.render(sc, cam); par && par.add(m);
      const out = id + ' movers ' + m.userData.movers.length + ' flap ' + (p.flapA || 0).toFixed(0) + ' deg (full travel ' + (t50 < 0 ? '-' : t50.toFixed(1) + ' s') + '), brake ' + (p.brakeA || 0).toFixed(2);
      Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); return out; })()`);
    console.log(r);
  }
  await t.shot('movers');
}
