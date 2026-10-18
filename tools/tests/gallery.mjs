// node tools/tests/cdp.mjs tools/tests/gallery.mjs : renders aircraft models in a grid (IDS=a,b,c or NATION=usa, or ALL=1)
//   CAM=x,y,z camera direction (default 1,0.5,1: rear quarter), FRONT=1, K=distance factor, CLOSE=1 cockpit close-up,
//   TZ=target as a fraction of the length, AT=intake|tail (aim at the intake mouth / the exhaust plane), COLS / ROWS grid size, OUT=file prefix
// Draws on its own full-screen canvas above the game UI, so the menu can never paint over the shots.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const ids = await t.eval(`JSON.stringify(${process.env.IDS ? JSON.stringify(process.env.IDS.split(',')) : `PLANE_LIST.filter(p => ${process.env.NATION ? `p.nation === '${process.env.NATION}'` : 'true'}).map(p => p.id)`})`);
  const list = JSON.parse(ids), cols = +(process.env.COLS || 4), rows = +(process.env.ROWS || 3), per = cols * rows;
  await t.eval(`(() => { Game.freeze = true; const cv = document.createElement('canvas'); cv.id = 'gal'; cv.width = 1440; cv.height = 900;
    cv.style.cssText = 'position:fixed;left:0;top:0;width:1440px;height:900px;z-index:99999'; document.body.appendChild(cv);
    const lb = document.createElement('canvas'); lb.id = 'gallab'; lb.width = 1440; lb.height = 900; lb.style.cssText = 'position:fixed;left:0;top:0;width:1440px;height:900px;z-index:100000;pointer-events:none'; document.body.appendChild(lb);
    window.__gr = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); window.__gr.setPixelRatio(1); return 1; })()`);
  for (let start = 0; start < list.length; start += per) {
    const chunk = list.slice(start, start + per);
    const res = await t.eval(`(() => {
      const r = window.__gr, W = 1440, H = 900, cols = ${cols}, rows = ${rows}, w = W / cols, h = H / rows;
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0x9cb6cf); sc.add(new THREE.HemisphereLight(0xdfeeff, 0x667055, 0.75)); const d = new THREE.DirectionalLight(0xfff4e0, 0.95); d.position.set(-0.6, 1, 0.5); sc.add(d);
      const cam = new THREE.PerspectiveCamera(35, w / h, 0.05, 1000);
      r.setScissorTest(false); r.setViewport(0, 0, W, H); r.setClearColor(0x9cb6cf); r.clear(); r.setScissorTest(true); r.autoClear = true;
      const ids = ${JSON.stringify(chunk)}, errs = [];
      ids.forEach((id, i) => { try { const m = Models.aircraft(PLANES[id]); sc.add(m); const s = Math.max(PLANES[id].span, PLANES[id].len);
        const cl = ${process.env.CLOSE ? 1 : 0}, sp = Airframe.spec(PLANES[id]), cz = ${process.env.AT === 'intake' ? '(sp.intakeZ !== null ? sp.intakeZ : sp.canopy.z)' : process.env.AT === 'tail' ? '(sp.nozzleZ !== null ? sp.nozzleZ : sp.L / 2)' : process.env.TZ ? `PLANES[id].len * ${process.env.TZ}` : `cl ? Models.layout(PLANES[id]).cockZ : 0`}, k = ${process.env.K || 0} || (cl ? 0.32 : 0.85);
        const cv = ${JSON.stringify((process.env.CAM || (process.env.FRONT ? '1,0.5,-1' : '1,0.5,1')).split(',').map(Number))}; cam.position.set(s * k * cv[0], s * k * cv[1], cz + s * k * cv[2]); cam.lookAt(0, 0, cz);
        const x = (i % cols) * w, y = H - (Math.floor(i / cols) + 1) * h; r.setViewport(x, y, w, h); r.setScissor(x, y, w, h); r.render(sc, cam); sc.remove(m); } catch (e) { errs.push(id + ': ' + e.message); } });
      r.setScissorTest(false);
      const g = document.getElementById('gallab').getContext('2d'); g.clearRect(0, 0, W, H); g.font = 'bold 13px sans-serif';
      ids.forEach((id, i) => { const tx = (i % cols) * w + 6, ty = Math.floor(i / cols) * h + 16; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(tx - 3, ty - 12, g.measureText(PLANES[id].name).width + 6, 16); g.fillStyle = '#000'; g.fillText(PLANES[id].name, tx, ty); });
      return JSON.stringify(errs); })()`);
    if (res !== '[]') console.log('errors', res);
    await t.shot((process.env.OUT || 'gallery-' + (process.env.NATION || 'all')) + '-' + start / per);
  }
}
