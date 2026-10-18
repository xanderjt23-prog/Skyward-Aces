// ============================================================================
// Aircraft pictures for the menus: each model is rendered once on a small
// offscreen canvas and cached as an image URL. Cards get <img data-thumb="id">
// and fill() renders the missing ones a few per frame so menus open instantly.
// ============================================================================
const Thumbs = (() => {
  const W = 240, H = 120, cache = {};
  let r = null, scene, cam;
  function setup() {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(W, H, false); r.setClearColor(0x000000, 0);
    scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.85));
    const d = new THREE.DirectionalLight(0xffffff, 0.85); d.position.set(-1, 2, 1.5); scene.add(d);
    cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 1000);
  }
  function get(id) {
    if (cache[id]) return cache[id];
    if (!r) setup();
    const pl = PLANES[id], m = Models.aircraft(pl), s = Math.max(pl.span, pl.len * 1.15);
    for (const p of m.userData.props) p.rotation.z = 0.4;
    scene.add(m);
    cam.position.set(s * 0.72, s * 0.38, s * 0.86); cam.lookAt(0, -s * 0.02, 0);
    r.render(scene, cam); scene.remove(m);
    m.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    return (cache[id] = r.domElement.toDataURL('image/png'));
  }
  let queue = [], busy = false;
  function fill(root) {
    queue = [...(root || document).querySelectorAll('img[data-thumb]')];
    if (!busy) step();
  }
  function step() {
    busy = queue.length > 0; if (!busy) return;
    for (let i = 0; i < 4 && queue.length; i++) { const img = queue.shift(); if (img.isConnected) { img.src = get(img.dataset.thumb); img.removeAttribute('data-thumb'); } }
    requestAnimationFrame(step);
  }
  const has = id => !!cache[id];
  // an <img> tag for a card: the picture if it's ready, else an invisible placeholder that fill() completes
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const tag = id => cache[id] ? `<img class="thumb" src="${cache[id]}" alt="">` : `<img class="thumb" data-thumb="${id}" src="${BLANK}" alt="">`;
  return { get, fill, has, tag };
})();
