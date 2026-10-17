// ============================================================================
// Component damage model: no health bar. An aircraft is a set of hit boxes in
// its own frame - engines, fuel tanks, crew, ammunition, wings, tailplane,
// fin, fuselage - each with its own structure points and failure behaviour:
//   engine: loses power, smokes, seizes, catches fire
//   fuel:   leaks (self-sealing tanks close), catches fire, explodes
//   wing:   loses lift (asymmetric roll), ailerons jam, snaps off
//   tail:   elevator / rudder authority, departs
//   crew:   pilot killed = uncontrollable; all crew dead = kill
// "Damage fraction" (0..1) is only bookkeeping, for kill credit and the HUD.
// ============================================================================
const Damage = (() => {
  const V3 = THREE.Vector3;
  function create(def, mods, opt) {
    const lay = Models.layout(def), { L, S, fr, chord, sweep, wingZ, wingY, tailZ, cockZ } = lay;
    const s = Math.max(0.45, Math.min(4, Math.sqrt(def.mass / 3000))) * (mods && mods.airframe ? 1.15 : 1) * (opt && opt.hpMul || 1);
    const comps = [];
    const add = (id, type, cx, cy, cz, hx, hy, hz, hp, w, extra) => comps.push(Object.assign({ id, type, lo: new V3(cx - hx, cy - hy, cz - hz), hi: new V3(cx + hx, cy + hy, cz + hz), c: new V3(cx, cy, cz), hp, max: hp, w, fire: 0, dead: false }, extra || {}));
    lay.engines.forEach((e, i) => add('engine' + i, 'engine', e.x, e.y, e.z, e.r, e.r, e.len / 2, (def.kind === 'jet' ? 170 : 130) * s * (def.armor > 2 ? 1.6 : 1), 1.3, { idx: i, seize: 0 }));
    const jet = def.kind === 'jet';
    add('fuel0', 'fuel', 0, 0, jet ? L * 0.05 : -L * 0.18 + (lay.bi ? 0.4 : 0), fr * 0.7, fr * 0.6, L * 0.1, 150 * s, 0.8, { leak: 0 });
    if (def.era >= 3 || lay.big) for (const sd of [-1, 1]) add(sd < 0 ? 'fuelL' : 'fuelR', 'fuel', sd * S * 0.17, wingY, wingZ + sweep * 0.3, S * 0.08, 0.25 + chord * 0.04, chord * 0.3, 110 * s, 0.6, { leak: 0 });
    // crew
    const crewPos = [];
    def.crew.forEach((role, i) => {
      let p;
      if (role === 'pilot') p = new V3(0, fr * 0.45, cockZ);
      else if (role === 'copilot') p = new V3(0.7, fr * 0.45, cockZ);
      else if (role === 'rio' || role === 'wso') p = new V3(0, fr * 0.45, cockZ + 1.3);
      else { const t = def.turrets[crewPos.filter(c => c.role === 'gunner').length] || [0, 0, 'rear']; p = Models.turretPos(def, t[2]).clone(); p.y *= 0.8; }
      crewPos.push({ role, p });
      add('crew' + i, 'crew', p.x, p.y, p.z, 0.35, 0.5, 0.45, 22, 0.6, { role, turret: role === 'gunner' ? crewPos.filter(c => c.role === 'gunner').length - 1 : -1 });
    });
    // ammunition
    const wingGuns = def.guns.some(g => g[2] === 'wing');
    if (wingGuns) for (const sd of [-1, 1]) add(sd < 0 ? 'ammoL' : 'ammoR', 'ammo', sd * S * 0.24, wingY, wingZ, S * 0.05, 0.2, chord * 0.2, 60 * s, 0.3);
    if (def.guns.some(g => g[2] !== 'wing')) add('ammoN', 'ammo', 0, fr * 0.4, jet ? -L * 0.33 : -L * 0.27, fr * 0.5, fr * 0.3, L * 0.05, 60 * s, 0.3);
    // structure
    const thick = Math.max(0.3, chord * 0.12) + 0.2, yTop = lay.bi ? lay.upperY + thick : wingY + thick;
    for (const sd of [-1, 1]) {
      const x0 = fr * 0.5, x1 = S / 2;
      add(sd < 0 ? 'wingL' : 'wingR', 'wing', sd * (x0 + x1) / 2, (wingY - thick + yTop) / 2, wingZ + sweep * 0.5, (x1 - x0) / 2, (yTop - wingY + thick) / 2, chord / 2 + sweep * 0.5 + 0.2, 230 * s * (lay.bi ? 1.25 : 1), 1.6, { side: sd, ail: 1 });
    }
    const tailBase = (def.shape === 'jet_d' || def.shape === 'jet_dc') ? L * 0.2 : chord, hsSpan = S * (jet ? 0.22 : 0.18), hsChord = tailBase * (jet ? 0.55 : 0.6), finH = Math.max(1, S * (jet ? 0.17 : 0.13));
    const noHT = def.shape === 'jet_d' || def.shape === 'jet_dc';
    if (!noHT) add('tailH', 'tailH', 0, def.tTail ? finH : 0, tailZ, hsSpan + fr * 0.2, 0.3, hsChord * 0.6 + 0.2, 140 * s, 0.9);
    add('tailV', 'tailV', 0, finH / 2 + fr * 0.4, tailZ, def.shape === 'jet_tt' ? fr * 1.3 : 0.35, finH / 2 + 0.2, hsChord * 0.7, 120 * s, 0.7);
    add('fuselage', 'fuselage', 0, 0, 0, fr * 1.05, fr * 1.05, L / 2, 380 * s, 1.5);
    // bounding box for the broad phase
    const bmin = new V3(Infinity, Infinity, Infinity), bmax = new V3(-Infinity, -Infinity, -Infinity);
    for (const c of comps) { bmin.min(c.lo); bmax.max(c.hi); }
    const dm = { def, comps, bmin, bmax, radius: Math.max(bmax.length(), bmin.length()), log: {}, total: 0, sumW: comps.reduce((a, c) => a + c.w, 0),
      armor: (def.armor || 0) + (mods && mods.armor ? 1 : 0), sealing: def.sealing || (mods && mods.sealing), extinguisher: mods && mods.extinguisher ? 1 : 0,
      fx: { thrust: lay.engines.map(() => 1), liftL: 1, liftR: 1, elev: 1, ail: 1, ailL: 1, ailR: 1, rud: 1, ctrl: 1, stab: 1, finStab: 1, dragMul: 1, leak: 0, spin: 0, drift: [0, 0] },
      destroyed: null, events: [], fires: 0, wingOff: [false, false], tailOff: false, frac: 0 };
    return dm;
  }
  // segment (local frame) vs AABB: entry t in [0,len] or -1
  function rayBox(o, d, len, mn, mx) {
    let t0 = 0, t1 = len;
    for (const a of ['x', 'y', 'z']) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) return -1; continue; }
      let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a]; if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return -1;
    }
    return t0;
  }
  const INNER = { engine: 1, fuel: 1, crew: 1, ammo: 1 };
  // what a projectile segment hits. Returns null or { t, hits: [{ci, dmg}], point(local) }
  // shell: { dmg, pen, he(radius m or 0), fire }
  function trace(dm, o, d, len, shell) {
    if (rayBox(o, d, len, dm.bmin, dm.bmax) < 0) return null;
    const list = [];
    dm.comps.forEach((c, i) => { if (c.dead && (c.type === 'wing' || c.type === 'tailH' || c.type === 'tailV')) return; const t = rayBox(o, d, len, c.lo, c.hi); if (t >= 0) list.push({ i, t, c }); });
    if (!list.length) return null;
    list.sort((a, b) => a.t - b.t);
    const t = list[0].t, point = new V3().copy(o).addScaledVector(d, t);
    const hits = [];
    const inner = list.find(h => INNER[h.c.type] && !h.c.dead), outer = list.find(h => !INNER[h.c.type]);
    if (inner) { hits.push({ ci: inner.i, dmg: shell.dmg * 0.85 }); if (outer) hits.push({ ci: outer.i, dmg: shell.dmg * 0.2 }); }
    else hits.push({ ci: list[0].i, dmg: shell.dmg });
    // high explosive: fragments reach neighbouring components
    if (shell.he > 0) dm.comps.forEach((c, i) => { if (hits.some(h => h.ci === i)) return;
      const cl = new V3().copy(point).clamp(c.lo, c.hi), dd = cl.distanceTo(point); if (dd < shell.he) hits.push({ ci: i, dmg: shell.dmg * 0.45 * (1 - dd / shell.he) }); });
    return { t, hits, point };
  }
  // proximity blast (missile / flak / rocket) at a local point
  function blast(dm, point, dmg, radius) {
    const hits = [];
    dm.comps.forEach((c, i) => { const cl = new V3().copy(point).clamp(c.lo, c.hi), dd = cl.distanceTo(point); if (dd < radius) hits.push({ ci: i, dmg: dmg * Math.pow(1 - dd / radius, 1.3) }); });
    return hits;
  }
  // apply a list of hits (done by the aircraft's owner). info: { attacker, time, fire (chance mult), pen, fromBehind, kind }
  function apply(dm, hits, info, rnd) {
    if (dm.destroyed) return;
    rnd = rnd || Math.random;
    let total = 0;
    for (const h of hits) {
      const c = dm.comps[h.ci]; if (!c) continue;
      let d = h.dmg;
      if (c.type === 'crew' && dm.armor > 0 && info.fromBehind && (info.pen || 1) * (info.cal || 8) < 14 * dm.armor) d *= 0.15;
      if (c.type === 'engine' && dm.armor > 2) d *= 0.6;
      if (c.dead && c.type !== 'fuselage') d *= 0.3;
      const before = c.hp; c.hp = Math.max(0, c.hp - d); total += (before - c.hp) * c.w / c.max;
      if (c.type === 'fuel' && !c.dead && d > 2) { c.leak = Math.min(0.02, c.leak + 0.003 + d / c.max * 0.01); if (dm.sealing) c.sealT = 4; }
      // fire
      const fc = (c.type === 'fuel' ? 0.09 : c.type === 'engine' ? 0.07 : 0) * (info.fire || 1) * Math.min(2, d / 20 + 0.4);
      if (fc > 0 && !c.fire && !c.dead && rnd() < fc) { c.fire = 8 + rnd() * 22; dm.fires++; dm.events.push('fire'); }
      if (c.type === 'ammo' && c.hp <= 0 && !c.dead && rnd() < 0.35) { c.dead = true; destroy(dm, 'explode', 'Ammunition exploded'); }
      if (c.hp <= 0 && !c.dead) kill(dm, c);
    }
    if (info.attacker != null) { const l = dm.log[info.attacker] || (dm.log[info.attacker] = { dmg: 0, t: 0, kind: info.kind }); l.dmg += total; l.t = info.time; l.kind = info.kind || l.kind; }
    dm.total += total; update(dm);
  }
  function kill(dm, c) {
    c.dead = true;
    if (c.type === 'wing') { const i = c.side < 0 ? 0 : 1; dm.wingOff[i] = true; dm.events.push(i ? 'wingR' : 'wingL'); }
    else if (c.type === 'tailH' || c.type === 'tailV') { dm.tailOff = true; dm.events.push(c.type); }
    else if (c.type === 'fuselage') destroy(dm, 'explode', 'Fuselage broke apart');
    else if (c.type === 'crew') { dm.events.push(c.role === 'pilot' ? 'pilot' : 'crew'); }
    else if (c.type === 'engine') dm.events.push('engine');
    else if (c.type === 'fuel' && c.fire) destroy(dm, 'explode', 'Fuel tank exploded');
    if (dm.comps.filter(x => x.type === 'crew').every(x => x.dead)) destroy(dm, 'crew', 'Crew killed');
  }
  function destroy(dm, cause, text) { if (dm.destroyed) return; dm.destroyed = cause; dm.destroyText = text; dm.events.push('destroyed'); update(dm); }
  // recompute the flight effects from component states
  function update(dm) {
    const fx = dm.fx, get = id => dm.comps.find(c => c.id === id);
    for (const c of dm.comps) if (c.type === 'engine') { const f = c.hp / c.max; fx.thrust[c.idx] = c.dead ? 0 : Math.min(1, f > 0.6 ? 1 : 0.35 + f) * (1 - c.seize); }
    for (const sd of ['L', 'R']) { const w = get('wing' + sd), f = w.hp / w.max; fx['lift' + sd] = w.dead ? 0 : 0.55 + 0.45 * f; fx['ail' + sd] = w.dead ? 0 : Math.max(0.15, w.ail * (f < 0.5 ? 0.5 + f : 1)); }
    fx.ail = Math.min(fx.ailL, fx.ailR) > 0 ? 1 : 0.3;
    const th = get('tailH'), tv = get('tailV');
    fx.elev = th ? (th.dead ? 0.05 : 0.35 + 0.65 * th.hp / th.max) : 1;
    fx.stab = th ? (th.dead ? -0.6 : 1) : 1;
    fx.rud = tv.dead ? 0 : 0.3 + 0.7 * tv.hp / tv.max; fx.finStab = tv.dead ? 0.1 : 1;
    const pilots = dm.comps.filter(c => c.type === 'crew' && (c.role === 'pilot' || c.role === 'copilot'));
    fx.ctrl = dm.destroyed ? 0 : pilots.some(c => !c.dead) ? 1 : 0;
    if (!fx.ctrl && !fx.drift[0]) fx.drift = [-0.15 - Math.random() * 0.3, (Math.random() - 0.5) * 0.6];
    if (dm.tailOff && th && th.dead) fx.drift = [-0.5, fx.drift[1]];
    fx.spin = dm.wingOff[0] ? -1 : dm.wingOff[1] ? 1 : 0;
    let holes = 0; for (const c of dm.comps) if (c.type === 'wing' || c.type === 'fuselage' || c.type === 'tailH') holes += (1 - c.hp / c.max) * 0.25;
    fx.dragMul = 1 + holes + (dm.wingOff[0] || dm.wingOff[1] ? 1.5 : 0);
    fx.leak = dm.comps.reduce((a, c) => a + (c.type === 'fuel' ? c.leak : 0), 0);
    let lost = 0; for (const c of dm.comps) lost += c.w * (c.dead ? 1 : 1 - c.hp / c.max);
    dm.frac = dm.destroyed ? 1 : Math.min(1, lost / dm.sumW * 1.6);
  }
  // per-second effects: fires burn, engines seize, leaks seal. speedFrac = v / vmax
  function tick(dm, dt, speedFrac, rnd) {
    rnd = rnd || Math.random; let changed = false;
    for (const c of dm.comps) {
      if (c.sealT > 0) { c.sealT -= dt; if (c.sealT <= 0) { c.leak *= 0.1; changed = true; } }
      if (c.type === 'engine' && !c.dead && c.hp / c.max < 0.35) { c.seize = Math.min(1, c.seize + dt / 40); changed = true; if (c.seize >= 1) { c.dead = true; dm.events.push('engine'); } }
      if (c.fire > 0) {
        c.fire -= dt; changed = true;
        c.hp = Math.max(0, c.hp - c.max * 0.05 * dt);
        // the fire spreads to the fuel and structure next to it
        for (const o of dm.comps) if (o !== c && (o.type === 'fuel' || o.type === 'fuselage' || o.type === 'wing') && o.c.distanceTo(c.c) < 3) o.hp = Math.max(0, o.hp - o.max * 0.012 * dt);
        if (dm.extinguisher && c.fire < 25 && rnd() < dt * 0.4) { dm.extinguisher = 0; c.fire = 0; dm.events.push('extinguished'); }
        if (speedFrac > 0.8 && rnd() < dt * 0.05) c.fire = 0;
        if (c.fire <= 0) { c.fire = 0; dm.events.push('extinguished'); }
        if (c.hp <= 0 && !c.dead) { kill(dm, c); if (c.type === 'fuel' || rnd() < 0.5) destroy(dm, 'explode', 'Burned up'); }
        for (const o of dm.comps) if (o.hp <= 0 && !o.dead) kill(dm, o);
      }
    }
    if (changed) update(dm);
  }
  const burning = dm => dm.comps.some(c => c.fire > 0);
  const smoking = dm => dm.comps.some(c => c.type === 'engine' && (c.dead || c.hp / c.max < 0.5));
  // compact state for the network: hp fractions (0..255) + fire bits
  function pack(dm) { return [dm.comps.map(c => Math.round(c.hp / c.max * 255) * (c.dead ? -1 : 1) || (c.dead ? -0.5 : 0)), dm.comps.map(c => c.fire > 0 ? 1 : 0).join(''), dm.destroyed || '']; }
  function unpack(dm, p) {
    p[0].forEach((v, i) => { const c = dm.comps[i]; if (!c) return; c.dead = v < 0; c.hp = Math.abs(v) / 255 * c.max; });
    const f = p[1] || ''; dm.comps.forEach((c, i) => { c.fire = f[i] === '1' ? 1 : 0; });
    dm.wingOff = [dm.comps.find(c => c.id === 'wingL').dead, dm.comps.find(c => c.id === 'wingR').dead];
    if (p[2]) dm.destroyed = p[2]; update(dm);
  }
  return { create, trace, blast, apply, tick, update, burning, smoking, pack, unpack, destroy, rayBox };
})();
