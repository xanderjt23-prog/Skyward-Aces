// node tools/tests/cdp.mjs tools/tests/structures.mjs : every ground structure on its own overlay canvas, overall and
// close up. KINDS="airfield:6,factory:3,..." (kind:era), SIZE=small|medium|big
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const kinds = (process.env.KINDS || 'airfield:3,airfield:6,factory:3,camp:3,camp:6,sam:6,city:3,ship:4,carrier:6,balloon:1').split(',');
  const size = process.env.SIZE || 'medium';
  for (const ke of kinds) {
    const [kind, era] = ke.split(':');
    for (const view of ['overall', 'close']) {
      await t.eval(`(() => { let cv = document.getElementById('sx'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'sx'; cv.width = 1440; cv.height = 900; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:9999'; document.body.appendChild(cv); window._sr = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); }
        const sc = new THREE.Scene(); sc.background = new THREE.Color(0x9cc0e0); sc.add(new THREE.HemisphereLight(0xdfeeff, 0x445533, 0.8)); const sun = new THREE.DirectionalLight(0xfff4e0, 0.9); sun.position.set(300, 500, 200); sc.add(sun);
        const water = '${kind}' === 'ship' || '${kind}' === 'carrier';
        const gnd = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: water ? 0x2a5a78 : 0x6f7f45 })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = water ? 0 : -0.05; sc.add(gnd);
        const B = Models.base('${kind}', '${size}', 1, ${era}); sc.add(B.group);
        const R = B.radius, cam = new THREE.PerspectiveCamera(50, 1440 / 900, 0.5, 20000);
        if ('${view}' === 'overall') { cam.position.set(R * 1.1, R * 0.9, R * 1.3); cam.lookAt(0, 0, 0); }
        else { const s = B.aaSpots[0] || new THREE.Vector3(R * 0.3, 0, R * 0.3); cam.position.set(s.x * 0.4 + 70, 35, s.z * 0.4 + 90); cam.lookAt(s.x * 0.4, 4, s.z * 0.4); }
        _sr.render(sc, cam); return 1; })()`);
      await t.shot(`struct-${kind}-${era}-${view}`);
    }
  }
}
