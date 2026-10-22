// node tools/tests/cdp.mjs tools/tests/tutorials.mjs : starts every tutorial, checks the spawn, then completes each step by
// putting the aircraft in the state the step asks for (a scripted pilot), and checks the tutorial reaches "complete"
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await t.eval("(() => { localStorage.clear(); Profile.reset(); UI.refresh(); return 1; })()");
  const ids = JSON.parse(await t.eval("JSON.stringify(Tutorial.LIST.map(x => x.id))"));
  // the scripted pilot: for the current step of tutorial `id`, change the state so that its check is met
  const SOLVE = `(() => { const m = Game.match, p = m.player, T = m.tut, st = T.t.steps[T.step], id = T.t.id, i = T.step, V = THREE.Vector3;
    const gy = (x, z) => m.world.groundAt(x, z), home = m.bases.find(b => b.home && b.runway), tb = m.bases.find(b => b.team === 1);
    const kill = c => { if (c && c.alive) { c.dm.destroyed = true; m.onCrash ? m.onCrash(c, false) : (c.alive = false); c.alive = false; } };
    if (st.wp) p.pos.copy(st.wp);
    if (id === 'basics') { if (i === 1) { Input.keys[Input.bind('throttleUp')] = true; p.ctl.throttle = 1; } if (i === 2) p.quat.setFromEuler(new THREE.Euler(0, 0, 1.3)); if (i === 4) Game.camMode = 'nose'; if (i === 5) { Input.keys[Input.bind('zoom')] = true; } }
    if (id === 'takeoff') { if (i === 0) p.ctl.throttle = 1; if (i === 1) p.vel.setLength(p.perf.vs * 1.4); if (i === 2) { p.onGround = false; p.pos.y = gy(p.pos.x, p.pos.z) + 30; } if (i === 3) p.gearDown = false; if (i === 4) p.pos.y = gy(p.pos.x, p.pos.z) + 650; }
    if (id === 'landing') { const r = home.runway; if (i === 0) p.ctl.throttle = 0.2; if (i === 1) { p.vel.setLength(p.perf.vs * 1.8); p.flaps = Craft.FLAP_NAMES.length - 1; } if (i === 2) p.gearDown = true;
      if (i === 3) { const q = r.c.clone().addScaledVector(r.dir, -(r.len / 2 + 800)); p.pos.set(q.x, gy(q.x, q.z) + 60, q.z); p.quat.setFromEuler(new THREE.Euler(0, Math.atan2(-r.dir.x, -r.dir.z), 0)); p.vel.copy(r.dir).multiplyScalar(p.perf.vs * 1.6); }
      if (i === 4) { p.pos.copy(r.c); p.pos.y = gy(r.c.x, r.c.z) + Models.layout(p.def).gearH; p.onGround = true; p.vel.copy(r.dir).multiplyScalar(20); p.atHome = true; } if (i === 5) { p.vel.set(0, 0, 0); p.ctl.throttle = 0; p.serviced = true; } }
    if (id === 'gunnery') { if (i === 0) { const c = m.crafts.find(c => c.team === 1 && c.alive); p.pos.copy(c.pos).add(new V(0, 0, 800)); Game.target = c; } if (i === 1) kill(m.crafts.find(c => c.team === 1 && c.alive)); if (i === 2) m.crafts.filter(c => c.team === 1).forEach(kill); }
    if (id === 'bombing' || id === 'divebomb') { if (st.text({ m, p, T }).includes('bombsight')) Game.camMode = 'sight';
      if (/course hair/.test(st.text({ m, p, T }))) { p.pos.x = tb.pos.x; p.vel.set(0, 0, -100); }
      if (/towards the camp/.test(st.text({ m, p, T }))) { p.pos.x = tb.pos.x; p.pos.z = tb.pos.z + 300; }
      if (/dive steeper/.test(st.text({ m, p, T }))) p.vel.set(0, -100, -30);
      if (/Release|release/.test(st.text({ m, p, T })) && !/Keep dropping|more passes/.test(st.text({ m, p, T }))) { if (id === 'divebomb') p.pos.y = gy(p.pos.x, p.pos.z) + 800; p.dropBomb(); }
      if (/Pull out/.test(st.text({ m, p, T }))) { p.vel.set(0, 30, -90); p.pos.y = gy(p.pos.x, p.pos.z) + 400; }
      if (/destroyed/.test(st.text({ m, p, T }))) { tb.hp = 0; tb.dead = true; } }
    if (id === 'ccip') { if (i === 0) { p.pos.x = tb.pos.x; p.pos.z = tb.pos.z + 4000; p.vel.set(0, 0, -230); } if (i === 1) p.vel.set(0, -90, -210); if (i === 2) { p.pos.y = gy(p.pos.x, p.pos.z) + 900; p.dropBomb(); } if (i === 3) { tb.hp = 0; tb.dead = true; } }
    if (id === 'rockets') { const v = m.vehicles.list.find(v => !v.dead); if (i === 0) { p.pos.copy(v.pos).add(new V(0, 400, 900)); p.vel.set(0, -40, -120); } if (i === 1) p.fireRockets(); if (i === 2) m.vehicles.list.slice(0, 2).forEach(v => { v.hp = 0; v.dead = true; }); }
    if (id === 'missiles') { if (i === 0) { Game.locked = true; } if (i === 1 || i === 2) kill(m.crafts.find(c => c.team === 1 && c.alive)); if (i === 3) kill(m.crafts.find(c => c.team === 1 && c.alive)); }
    if (id === 'flares') { T.survived = i + 1; }
    // maneuvers: fly the figure by setting the attitude stage by stage (two frames each), so the lesson's own measurement runs
    const Q = (ax, deg) => new THREE.Quaternion().setFromAxisAngle(ax, deg * Math.PI / 180), X = new V(1, 0, 0), Y = new V(0, 1, 0), Z = new V(0, 0, 1);
    const f0 = new V(0, 0, -1).applyQuaternion(p.quat), q0 = Q(Y, Math.atan2(-f0.x, -f0.z) * 180 / Math.PI), y0 = Math.max(p.pos.y, gy(p.pos.x, p.pos.z) + 2500);
    const fly = list => { for (const [q, dy] of list) { for (let k = 0; k < 2; k++) { p.quat.copy(q); p.pos.y = y0 + dy; p.vel.set(0, 0, -150).applyQuaternion(q); Game.update(1/30); } } };
    const range = (a, b, s) => { const r = []; for (let x = a; s > 0 ? x <= b : x >= b; x += s) r.push(x); return r; };
    if (id === 'turns') { fly([[q0, 0]]);
      if (i === 0) fly(range(0, 380, 15).map(h => [q0.clone().multiply(Q(Y, h)).multiply(Q(Z, 65)), 0]));
      if (i === 1) fly(range(0, 110, 10).map(h => [q0.clone().multiply(Q(Y, h)).multiply(Q(Z, 85)), 0]));
      if (i === 2) fly(range(0, 180, 10).map(h => [q0.clone().multiply(Q(Y, h)).multiply(Q(Z, h < 180 ? 30 : 0)), 300 * h / 180])); }
    if (id === 'rolls') { fly([[q0, 0]]);
      if (i === 0) fly(range(0, 360, 20).map(r => [q0.clone().multiply(Q(Z, r)), 0]));
      if (i === 1) fly(range(0, 360, 15).map(a => [q0.clone().multiply(Q(X, a)), 300 * Math.sin(a * Math.PI / 180)])); }
    if (id === 'reversals') { fly([[q0, 0]]);
      if (i === 0) fly([...range(0, 180, 15).map(a => [q0.clone().multiply(Q(X, a)), 300 * (1 - Math.cos(a * Math.PI / 180))]), ...range(0, 180, 20).map(r => [q0.clone().multiply(Q(X, 180)).multiply(Q(Z, r)), 600])]);
      if (i === 1) fly([...range(0, 180, 20).map(r => [q0.clone().multiply(Q(Z, r)), 0]), ...range(0, 180, 15).map(a => [q0.clone().multiply(Q(Z, 180)).multiply(Q(X, a)), -300 * (1 - Math.cos(a * Math.PI / 180))])]); }
    return T.step; })()`;
  for (const id of ids) {
    const r = await t.eval(`(() => { const cfg = Plan.build({ mode: 'tutorial', tutorial: '${id}' }, [{ name: 'T', plane: Tutorial.byId('${id}').plane, owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); return 1; })()`);
    for (let k = 0; k < 4; k++) await t.eval("for (let k = 0; k < 15; k++) Game.update(1/30); Game.render(); 1");
    const raw = await t.eval(`(() => { const m = Game.match, p = m.player; return JSON.stringify({ plane: p.def.id, alive: p.alive, onGround: p.onGround, agl: Math.round(p.pos.y - m.world.groundAt(p.pos.x, p.pos.z)), kmh: Math.round(p.speed * 3.6), gear: p.gearDown,
      stores: p.stations.map(s => s.id + 'x' + s.n).join(' '), bots: m.crafts.length - 1, bases: m.bases.map(b => b.kind + (b.home ? '(home)' : '')).join(','), tanks: m.vehicles.list.length, step: m.tut && m.tut.step, text: m.tut && m.tut.t.steps[m.tut.step].text(Tutorial.ctx(m)) }); })()`); if (raw.startsWith("ERR")) { console.log(id, raw.slice(0, 600)); continue; } const s0 = JSON.parse(raw);
    await t.shot('tut-' + id);
    let steps = [], guard = 0;
    while (guard++ < 20) {
      const over = await t.eval("Game.match.over"); if (over) break;
      const before = await t.eval("Game.match.tut.step");
      await t.eval(SOLVE);
      for (let k = 0; k < 3; k++) await t.eval("for (let k = 0; k < 10; k++) Game.update(1/30); 1");
      const after = await t.eval("Game.match.over ? 'done' : Game.match.tut.step"); steps.push(before + '>' + after);
      if (after === before) { steps.push('STUCK at ' + before + ': ' + await t.eval("Game.match.tut.t.steps[Game.match.tut.step].text(Tutorial.ctx(Game.match))")); break; }
    }
    const res = await t.eval("Game.match.result ? Game.match.result.reason : 'not finished'");
    console.log(id.padEnd(9), JSON.stringify(s0).slice(0, 330));
    console.log('          steps', steps.join(' '), '|', res);
    await t.eval("for (const k in Input.keys) Input.keys[k] = false; Game.camMode = 'chase'; Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); 1");
  }
}
