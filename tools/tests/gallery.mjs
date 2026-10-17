// node tools/tests/cdp.mjs tools/tests/gallery.mjs : renders aircraft models in a grid (IDS=a,b,c or NATION=usa)
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const ids = await t.eval(`JSON.stringify(${process.env.IDS ? JSON.stringify(process.env.IDS.split(',')) : `PLANE_LIST.filter(p => ${process.env.NATION ? `p.nation === '${process.env.NATION}'` : 'true'}).map(p => p.id)`})`);
  const list = JSON.parse(ids);
  for (let start = 0; start < list.length; start += 12) {
    const chunk = list.slice(start, start + 12);
    await t.eval("Game.freeze = true; 1");
    await t.eval(`(() => {
      const r = Game.renderer, W = 1440, H = 900, cols = 4, rows = 3, w = W / cols, h = H / rows;
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0x87a8c8); sc.add(new THREE.HemisphereLight(0xffffff, 0x556655, 0.8)); const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(-1, 2, 1); sc.add(d);
      const cam = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
      r.setScissorTest(true); r.autoClear = true;
      const ids = ${JSON.stringify(chunk)};
      ids.forEach((id, i) => { const m = Models.aircraft(PLANES[id]); sc.add(m); const s = Math.max(PLANES[id].span, PLANES[id].len);
        cam.position.set(s * 0.9, s * 0.45, s * 0.9); cam.lookAt(0, 0, 0);
        const x = (i % cols) * w, y = H - (Math.floor(i / cols) + 1) * h; r.setViewport(x, y, w, h); r.setScissor(x, y, w, h); r.render(sc, cam); sc.remove(m); });
      r.setScissorTest(false); r.setViewport(0, 0, W, H);
      document.getElementById('menu-ui').style.display = 'none';
      const hud = document.getElementById('hud'), g = hud.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,hud.width,hud.height); g.font = '14px sans-serif'; g.fillStyle = '#000';
      ids.forEach((id, i) => g.fillText(PLANES[id].name, (i % cols) * w + 8, Math.floor(i / cols) * h + 18));
      return 1; })()`);
    // stop the menu loop from overwriting the frame
    await t.eval("Game.freeze = true; 1");
    await t.shot('gallery-' + (process.env.NATION || 'all') + '-' + start / 12);
  }
}
