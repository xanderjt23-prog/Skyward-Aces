// node tools/tests/cdp.mjs tools/tests/propview.mjs : close-ups of single props (PROPS="hut:3,tank:4,house,..." ; CAM=x,y,z)
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const list = (process.env.PROPS || 'hut:3,hut:6,tank:3,tank:4,tank:6,tank:1,truck:4,house:3,hall:3,sa2:5,kub:6,shelter:6,tower:6,ship:4,ship:2,ship:6').split(',');
  for (const it of list) {
    const [name, era] = it.split(':'), e = +(era || 4);
    await t.eval(`(() => { let cv = document.getElementById('sx'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'sx'; cv.width = 1440; cv.height = 900; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:9999'; document.body.appendChild(cv); window._sr = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); }
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0x9cc0e0); sc.add(new THREE.HemisphereLight(0xdfeeff, 0x445533, 0.8)); const sun = new THREE.DirectionalLight(0xfff4e0, 0.9); sun.position.set(300, 500, 200); sc.add(sun);
      const b = new Models.Builder(), n = '${name}'; let size = 12;
      if (n === 'hut') Props.hut(b, 0, 0, 0.5, ${e}); if (n === 'tank') { Props.tankAt(b, 0, 0, 0.6, ${e}, 0xd04040); size = 6; } if (n === 'truck') { Props.truck(b, 0, 0, 0.6, ${e}); size = 6; }
      if (n === 'house') Props.house(b, 0, 0, 0.4, 12, 16, 8); if (n === 'hall') { Props.hall(b, 0, 0, 0.4, 50, 50, 12); size = 45; } if (n === 'sa2') { Props.sa2(b, 0, 0, 0.5); size = 12; } if (n === 'kub') { Props.kub(b, 0, 0, 0.6, ${e}, 0xd04040); size = 7; }
      if (n === 'shelter') { Props.shelter(b, 0, 0, 0.6); size = 25; } if (n === 'tower') { Props.tower(b, 0, 0, 0.3, ${e}); size = 18; }
      if (n === 'ship') { Props.warship(b, 'ship', ${e === 2 ? 3 : e === 6 ? 2 : 2}, ${e === 2 ? 4 : e}, 0xd04040); size = 90; }
      const water = n === 'ship', gnd = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: water ? 0x2a5a78 : 0x6f7f45 })); gnd.rotation.x = -Math.PI / 2; sc.add(gnd);
      sc.add(new THREE.Mesh(b.build(), Models.mat('vc')));
      const cam = new THREE.PerspectiveCamera(45, 1440 / 900, 0.1, 5000); cam.position.set(size * 1.3, size * 0.75, -size * 1.6); cam.lookAt(0, size * 0.18, 0); _sr.render(sc, cam); return 1; })()`);
    await t.shot('prop-' + it.replace(':', '-'));
  }
}
