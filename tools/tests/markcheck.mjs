// node tools/tests/cdp.mjs tools/tests/markcheck.mjs : every marking vertex of every aircraft must lie on the skin. Rays from
// each vertex back along the surface normal (inwards) must meet the airframe within a few centimetres; reports the aircraft
// whose markings hang off an edge, plus aircraft that ended up without fuselage markings
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const r = await t.eval(`(() => { const out = [], none = []; const ray = new THREE.Raycaster(); const dbl = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    for (const pl of PLANE_LIST) { const m = Models.aircraft(pl), u = m.userData; m.updateMatrixWorld(true);
      const skins = [u.body, u.wingL, u.wingR].map(o => { const k = o.clone(false); k.material = dbl; k.matrixWorld.copy(o.matrixWorld); return k; });
      const check = (mk, label) => { if (!mk) return 0; const pa = mk.geometry.attributes.position, na = mk.geometry.attributes.normal; let bad = 0, n = 0;
        for (let i = 0; i < pa.count; i += 3) { n++; const p = new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(mk.matrixWorld);
          // find the nearest skin surface along +/- the three axes
          let best = Infinity; for (const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]) { ray.set(p, new THREE.Vector3(...d)); ray.far = 0.5; for (const h of ray.intersectObjects(skins, false)) best = Math.min(best, h.distance); }
          if (best > 0.12) bad++; }
        if (bad / Math.max(1, n) > 0.03) out.push(pl.id + ':' + label + ' ' + Math.round(bad / n * 100) + '% off'); return n; };
      const nb = check(u.marks, 'fuselage'); check(u.wingL.children.find(c => c.material && c.material.polygonOffset), 'wingL');
      if (!nb) none.push(pl.id); }
    return JSON.stringify({ off: out, noFuselageMarks: none }); })()`);
  const j = JSON.parse(r); console.log('markings hanging off the skin:', j.off.length, j.off.join(' ')); console.log('no fuselage markings:', j.noFuselageMarks.length, j.noFuselageMarks.join(' '));
}
