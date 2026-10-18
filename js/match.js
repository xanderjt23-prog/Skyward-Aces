// ============================================================================
// Match: one battle. The host (or single player) is authoritative for bots,
// bases, AA, scoring and kill credit; every machine simulates its own
// aircraft and its own projectiles, and sends hits on others to their owner.
// ============================================================================
const BASE_HP = { small: 1500, medium: 3600, big: 8000 };
const BASE_PTS = { small: 2, medium: 3, big: 5 };
const ERA_HP = [0, 0.3, 0.45, 1, 1.4, 1.9, 2.4, 2.9];
const MAP_HALF = [0, 3500, 4500, 6000, 8000, 10000, 12000, 14000];
const SPAWN_ALT = [0, 900, 1200, 1800, 2500, 3500, 4000, 4500];
const MODE_NAMES = { destroy: 'Destroy', dogfight: 'Dogfight', missions: 'Missions', survival: 'Survival' };
const PILOT_NAMES = {
  usa: ['Miller', 'Johnson', 'Brooks', 'Carter', 'Hayes', 'Walker', 'Reed', 'Foster', 'Bennett', 'Cole', 'Murphy', 'Price'],
  ger: ['Weber', 'Hartmann', 'Krüger', 'Vogel', 'Schmidt', 'Becker', 'Lange', 'Wolf', 'Braun', 'Keller', 'Richter', 'Busch'],
  uk: ['Bader', 'Hughes', 'Fletcher', 'Ashby', 'Lacey', 'Turner', 'Barker', 'Stanford', 'Wells', 'Hollis', 'Pryce', 'Yates'],
  ussr: ['Pokryshkin', 'Kozhedub', 'Ivanov', 'Petrov', 'Sokolov', 'Volkov', 'Morozov', 'Orlov', 'Kuznetsov', 'Zaitsev', 'Popov', 'Belov'],
  jpn: ['Sakai', 'Nishizawa', 'Tanaka', 'Suzuki', 'Kato', 'Yamada', 'Ito', 'Watanabe', 'Kobayashi', 'Mori', 'Ishii', 'Ota'],
  fra: ['Fonck', 'Nungesser', 'Martin', 'Dubois', 'Leroy', 'Moreau', 'Girard', 'Lambert', 'Rousseau', 'Faure', 'Mercier', 'Blanc'],
};

// ---- host-side match planning (bots, bases): produces the config every machine builds the same match from
const Plan = {
  botLoadout(pl, task) {
    if (task === 'intercept' || task === 'escort') task = 'air';
    const belts = {}; for (const g of Profile.gunsOf(pl)) { const opts = beltsForGun(g, pl.era); belts[g] = opts.includes('hei') ? 'hei' : opts.includes('api') ? 'api' : opts[Math.floor(Math.random() * opts.length)]; }
    const stores = pl.hp.map(() => null); let kg = 0;
    const want = task === 'air' ? 'm' : null;
    pl.hp.forEach((st, i) => {
      const opts = Object.keys(STORES).filter(id => storeAllowed(pl, id, st));
      // candidates of a kind, newest and heaviest first; take the first that still fits the payload
      const fit = k => opts.filter(id => STORES[id].kind === k).sort((a, b) => STORES[b].eras[0] - STORES[a].eras[0] || STORES[b].mass - STORES[a].mass).find(id => kg + STORES[id].mass * st[3] <= pl.payload);
      let pick = null;
      if (st[1].includes('m')) pick = fit('m');
      if (!pick && task !== 'air') pick = Math.random() < 0.6 ? fit('b') || fit('r') : fit('r') || fit('b');
      if (!pick && task === 'air' && Math.random() < 0.3) pick = fit('g');
      if (pick) { stores[i] = pick; kg += STORES[pick].mass * st[3]; }
    });
    const mods = {}; for (const k of ['engine', 'airframe', 'armor', 'sealing']) if (Math.random() < 0.4 && pl.era >= MODS[k].minEra) mods[k] = true;
    if (pl.flares) mods.flares = Math.random() < 0.5;
    return { belts, stores, mods };
  },
  bot(id, team, plane, opt) {
    const pl = PLANES[plane], names = PILOT_NAMES[pl.nation] || PILOT_NAMES.usa;
    const task = opt.task || (pl.role === 'bomber' ? 'bomb' : pl.role === 'attack' ? 'ground' : Math.random() < (opt.groundChance || 0) ? 'ground' : 'air');
    return Object.assign({ id, team, name: names[Math.floor(Math.random() * names.length)] + (opt.suffix || ''), plane, bot: true, owner: 'H', skill: opt.skill == null ? 0.35 + Math.random() * 0.5 : opt.skill, task, loadout: Plan.botLoadout(pl, task) }, opt.extra || {});
  },
  pick(list) { return list[Math.floor(Math.random() * list.length)]; },
  // humans: [{ id, name, plane, loadout, owner, team }]  settings: { mode, teamSize:[a,b], time, respawns, mission, fill, map }
  build(settings, humans) {
    const mode = settings.mode, seed = 1 + Math.floor(Math.random() * 1e6);
    const eraAvg = Math.max(1, Math.min(7, Math.round(humans.reduce((a, h) => a + PLANES[h.plane].era, 0) / humans.length)));
    const mission = mode === 'missions' ? MISSIONS.find(m => m.id === settings.mission) || missionsFor(PLANES[humans[0].plane])[0] : null;
    const era = mission ? Math.max(1, Math.min(7, Math.round((eraAvg + mission.era) / 2))) : eraAvg;
    const map = mission ? mission.map : settings.map || Plan.pick(Object.keys(World.MAPS));
    const sizeMul = (World.SIZES[settings.size] || World.SIZES.medium).mul;
    const half = MAP_HALF[era] * sizeMul * (mode === 'destroy' && Math.max(...settings.teamSize) > 20 ? 1.3 : 1);
    const weather = settings.weather && settings.weather !== 'random' ? settings.weather : Plan.pick(['clear', 'scattered', 'scattered', 'overcast', 'rain', 'fog']);
    const roster = []; let nid = 1;
    const hum = humans.map(h => Object.assign({}, h, { id: nid++, bot: false }));
    const respawns = settings.respawns == null ? 3 : settings.respawns;
    if (mode === 'destroy' || mode === 'dogfight') {
      const size = mode === 'destroy' ? settings.teamSize : [settings.teamSize[0], settings.teamSize[0]];
      for (const h of hum) { h.team = h.team === 1 ? 1 : 0; if (mode === 'dogfight') h.lives = respawns + 1; roster.push(h); }
      for (const t of [0, 1]) {
        let have = roster.filter(r => r.team === t).length;
        // overflowing humans move to the other team
        while (have > size[t] && roster.filter(r => r.team === 1 - t).length < size[1 - t]) { const r = roster.find(x => x.team === t && !x.bot); r.team = 1 - t; have--; }
      }
      if (settings.fill !== false) for (const t of [0, 1]) {
        const n = size[t] - roster.filter(r => r.team === t).length;
        for (let i = 0; i < n; i++) {
          // in Destroy about a quarter of the bots fly bombers and attack aircraft against the bases
          const striker = mode === 'destroy' && Math.random() < 0.25, pl = Plan.pick(botPlanes(era, null, striker ? 'ground' : undefined));
          roster.push(Plan.bot(nid++, t, pl.id, { groundChance: mode === 'destroy' ? 0.25 : 0, extra: mode === 'dogfight' ? { lives: respawns + 1 } : {} })); }
      }
    } else if (mode === 'missions') {
      for (const h of hum) { h.team = 0; h.lives = 3; roster.push(h); }
      const allyN = Math.max(0, mission.allies + 1 - hum.length);
      // allies: on intercepts half go for the bombers and half cover them; on escorts they stay with the bombers
      for (let i = 0; i < allyN; i++) { const pl = Plan.pick(botPlanes(mission.era, mission.nation));
        const task = mission.type === 'strike' ? (i % 2 ? 'ground' : 'air') : mission.type === 'intercept' ? (i % 2 ? 'air' : 'intercept') : mission.type === 'escort' ? (i % 3 === 2 ? 'air' : 'escort') : 'air';
        roster.push(Plan.bot(nid++, 0, pl.id, { task, extra: { lives: 1 } })); }
      if (mission.type === 'strike') { const att = bomberPlanes(mission.era, mission.nation).filter(p => p.role === 'attack' || p.role === 'bomber');
        for (let i = 0; i < 3 && att.length; i++) roster.push(Plan.bot(nid++, 0, Plan.pick(att).id, { task: 'bomb', skill: 0.6, extra: { lives: 1, targetBase: 'T1' } })); }
      const scale = Math.max(1, hum.length * 0.7);
      for (let i = 0; i < Math.round(mission.enemies * scale); i++) { const pl = Plan.pick(botPlanes(mission.era, mission.enemy)); roster.push(Plan.bot(nid++, 1, pl.id, { task: mission.type === 'intercept' ? 'escort' : 'air', extra: { lives: 1 } })); }
      if (mission.bombers) { const bt = mission.type === 'intercept' ? 1 : 0;
        for (let i = 0; i < Math.round(mission.bomberCount * (bt ? scale : 1)); i++) roster.push(Plan.bot(nid++, bt, mission.bombers[0], { task: 'bomb', skill: 0.6, extra: { lives: 1, targetBase: bt ? 'T0' : 'T1' } })); }
    } else if (mode === 'survival') {
      for (const h of hum) { h.team = 0; h.lives = respawns + 1; roster.push(h); }
      if (settings.fill !== false) for (let i = 0; i < Math.max(0, 3 - hum.length); i++) { const pl = Plan.pick(botPlanes(era)); roster.push(Plan.bot(nid++, 0, pl.id, { extra: { lives: 1 }, suffix: ' (wingman)' })); }
    }
    // bases
    const bases = [], rnd = Models.mulberry(seed), water = map === 'islands' || map === 'arctic';
    const place = (team, size, kind, zMin, zMax) => {
      for (let t = 0; t < 60; t++) {
        const x = (rnd() - 0.5) * half * 1.4, z = (team === 0 ? 1 : -1) * (zMin + rnd() * (zMax - zMin)) * half;
        if (map === 'coast' && (kind === 'ship' || kind === 'carrier') !== (x > half * 0.35)) continue;
        if (bases.some(b => Math.hypot(b.x - x, b.z - z) < half * 0.16)) continue;
        bases.push({ id: 'B' + bases.length, team, size, kind, x, z }); return bases[bases.length - 1];
      }
      const b = { id: 'B' + bases.length, team, size, kind, x: (rnd() - 0.5) * half, z: (team === 0 ? 1 : -1) * half * zMax }; bases.push(b); return b;
    };
    const kindFor = size => {
      const sea = water ? rnd() < 0.5 : map === 'coast' ? rnd() < 0.25 : false;
      if (sea) return size === 'big' ? 'carrier' : 'ship';
      if (size === 'small') return era >= 6 && rnd() < 0.4 ? 'sam' : era === 1 && rnd() < 0.3 ? 'balloon' : 'camp';
      if (size === 'medium') return era >= 6 && rnd() < 0.3 ? 'sam' : rnd() < 0.5 ? 'airfield' : 'factory';
      return rnd() < 0.5 ? 'airfield' : 'city';
    };
    if (mode === 'destroy') {
      const extra = Math.max(...settings.teamSize) > 20 ? 1 : 0;
      for (const t of [0, 1]) { for (let i = 0; i < 3 + extra; i++) place(t, 'small', kindFor('small'), 0.15, 0.7); for (let i = 0; i < 2 + extra; i++) place(t, 'medium', kindFor('medium'), 0.2, 0.75); place(t, 'big', water ? 'carrier' : 'airfield', 0.45, 0.8); } // every team flies from a main airfield (or carrier)
    } else if (mode === 'missions') {
      const tg = mission.targets || (mission.type === 'escort' ? [mission.target] : []);
      tg.forEach((t, i) => { const b = place(1, t.size, t.kind, 0.25, 0.65); b.objective = true; if (i === 0) b.id = 'T1'; });
      if (mission.type === 'intercept') { const b = place(0, mission.target.size, mission.target.kind, 0.45, 0.7); b.objective = true; b.id = 'T0'; }
      for (let i = 0; i < 2; i++) place(1, 'small', kindFor('small'), 0.5, 0.8);
      place(0, 'small', kindFor('small'), 0.3, 0.6);
    } else if (mode === 'survival') {
      const b = place(0, 'big', water ? 'carrier' : 'airfield', 0.35, 0.5); b.objective = true; b.id = 'T0';
      place(0, 'small', kindFor('small'), 0.2, 0.5); place(0, 'medium', kindFor('medium'), 0.2, 0.6);
    }
    // tanks (Destroy): a few per team, starting around the team's bases
    const vehicles = [];
    if (mode === 'destroy') for (const t of [0, 1]) {
      const own = bases.filter(b => b.team === t && b.kind !== 'ship' && b.kind !== 'carrier'), n = 6 + (Math.max(...settings.teamSize) > 20 ? 4 : 0);
      for (let i = 0; i < n; i++) { const b = own[i % Math.max(1, own.length)] || { x: 0, z: (t === 0 ? 1 : -1) * half * 0.4 }; vehicles.push({ id: 'V' + vehicles.length, team: t, x: b.x + (rnd() - 0.5) * 700, z: b.z + (rnd() - 0.5) * 700, h: rnd() * 6.28 }); }
    }
    // Realistic mode: these teams take off from (and land on) their home airfields
    const homeTeams = settings.realistic ? (mode === 'destroy' || mode === 'dogfight' ? [0, 1] : [0]) : [];
    for (const t of homeTeams) {
      if (mode === 'destroy') { // the big base and one medium base become the team's airfields
        const big = bases.find(b => b.team === t && b.size === 'big'); if (big) big.kind = 'airfield';
        if (!bases.some(b => b.team === t && b.size === 'medium' && b.kind === 'airfield')) { const med = bases.find(b => b.team === t && b.size === 'medium'); if (med) med.kind = 'airfield'; }
      }
      let homes = bases.filter(b => b.team === t && b.kind === 'airfield');
      if (!homes.length) homes = [place(t, 'medium', 'airfield', 0.55, 0.8)];
      homes.forEach(b => b.home = true);
    }
    return { mode, seed, era, map, half, roster, bases, mission: mission ? mission.id : null, time: mode === 'missions' ? 15 * 60 : settings.time || 0, respawns, nid, realistic: !!settings.realistic, homeTeams, vehicles, weather, night: !!settings.night, size: settings.size || 'medium' };
  },
};

class Match {
  constructor(cfg, opt) {
    this.cfg = cfg; this.mode = cfg.mode; this.scene = opt.scene; this.isHost = opt.isHost !== false; this.net = !!opt.net; this.myPeer = opt.myPeer || 'H';
    this.time = 0; this.era = cfg.era; this.half = cfg.half; this.over = false; this.result = null;
    this.mission = cfg.mission ? MISSIONS.find(m => m.id === cfg.mission) : null;
    this.spawnAlt = SPAWN_ALT[this.era]; this.patrolAlt = this.spawnAlt; this.ceiling = this.spawnAlt * 2.6 + 1500;
    this.scores = [0, 0]; this.feed = []; this.events = []; this.wave = 0; this.waveT = 6; this.debris = [];
    // world + bases
    const sites = cfg.bases.map(b => { const bm = Models.base(b.kind, b.size, b.team, this.era); return { b, bm, x: b.x, z: b.z, radius: bm.flat, water: bm.water }; });
    this.world = World.create(this.scene, { map: cfg.map, half: cfg.half, seed: cfg.seed, sites, weather: cfg.weather, night: cfg.night, lights: this.scene.userData.lights });
    this.bases = sites.map((s, i) => this.makeBase(s, i));
    this.combat = new Combat(this);
    this.vehicles = new Vehicles(this, cfg.vehicles);
    this.crafts = []; this.byId = {};
    for (const r of cfg.roster) this.addCraft(r);
    this.player = this.crafts.find(c => c.id === opt.playerId) || null;
    // a raid's target is as strong as ~a third of the raid's bomb load: an intact raid flattens it, a broken-up raid can't
    for (const b of this.bases) if (b.objective && (b.id === 'T0' || b.id === 'T1') && this.mission && (this.mission.type === 'intercept' || this.mission.type === 'escort')) {
      let pot = 0; for (const r of cfg.roster) if (r.task === 'bomb' && r.targetBase === b.id) { const pl = PLANES[r.plane]; pl.hp.forEach((st, i) => { const id = r.loadout.stores[i]; if (id && STORES[id].kind === 'b') pot += STORES[id].dmg * st[3]; }); }
      if (pot > 0) b.hp = b.max = Math.round(pot * 0.33);
    }
    this.nextId = cfg.nid || 1000;
    this.snapT = 0; this.stateT = 0; this.baseSnapT = 0;
    // initial spawns (each machine spawns the aircraft it owns)
    const idx = [0, 0];
    for (const c of this.crafts) { const i = idx[c.team]++; if (c.local && !(this.mode === 'survival' && c.team === 1)) this.spawnCraft(c, i, true); }
  }
  addCraft(r) {
    const c = new Craft(this, r); c.local = r.owner === this.myPeer;
    if (c.isBot && c.local) c.ai = new BotBrain(c, r.skill);
    this.crafts.push(c); this.byId[c.id] = c; return c;
  }
  makeBase(s, i) {
    const b = s.b, g = s.bm.group, gy = s.water ? 0 : this.world.groundAt(b.x, b.z);
    g.position.set(b.x, gy, b.z); g.rotation.y = (i * 1.7) % (Math.PI * 2); this.scene.add(g);
    // mission targets: raids must be stopped before they flatten them; strike targets are ordinary
    const objMul = !b.objective ? 1 : this.mode === 'survival' ? 3 : !this.mission ? 1 : { intercept: 1, escort: 1, strike: 0.8, sweep: 1 }[this.mission.type];
    const hp = BASE_HP[b.size] * ERA_HP[this.era] * objMul;
    const base = { id: b.id, idx: i, team: b.team, size: b.size, kind: b.kind, objective: b.objective, home: !!b.home, pos: new V3(b.x, gy + (b.kind === 'balloon' ? 262 : 0), b.z), radius: b.kind === 'balloon' ? 22 : s.bm.radius, hp, max: hp, dead: false, group: g, aa: [], log: {} };
    if (this.world.night && !b.kind.startsWith('balloon')) {
      const lp = [], rr = Models.mulberry(i * 13 + 5), R = s.bm.radius;
      for (let k = 0; k < 30; k++) lp.push((rr() - 0.5) * R * 1.4, 2 + rr() * 6, (rr() - 0.5) * R * 1.4);
      if (s.bm.runway) for (let k = 0; k < 24; k++) for (const sd of [-1, 1]) lp.push(s.bm.runway.x + sd * s.bm.runway.w / 2, 0.5, -s.bm.runway.len / 2 + k * s.bm.runway.len / 23);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      g.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffd28a, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 })));
    }
    if (s.bm.runway) { const r = s.bm.runway, rot = g.rotation.y, c = new V3(r.x, 0, r.z).applyAxisAngle(new V3(0, 1, 0), rot).add(g.position);
      base.runway = { c, dir: new V3(0, 0, -1).applyAxisAngle(new V3(0, 1, 0), rot), len: r.len, w: r.w }; }
    // anti-aircraft defences depend on the era (and on the size of the base)
    // only some small bases are defended
    const unarmed = b.size === 'small' && b.kind !== 'sam' && Models.mulberry(this.cfg.seed + i * 31)() < 0.35;
    if (!unarmed) s.bm.aaSpots.forEach((sp, k) => {
      const e = this.era; let type;
      if (b.kind === 'sam' && k > 0) type = 'sam';
      else if (e === 1) type = b.size === 'big' && k === 0 ? 'archie' : 'mg';
      else if (e <= 4) type = (b.size !== 'small' && k % 2 === 0) ? 'heavy' : 'light';
      else if (e === 5) type = b.size === 'big' && k === 0 ? 'sam' : 'radar';
      else type = (b.size !== 'small' && k % 2 === 0) ? 'sam' : 'radar';
      const wp = sp.clone().applyAxisAngle(new V3(0, 1, 0), g.rotation.y).add(new V3(b.x, 0, b.z));
      wp.y = s.water ? 7 : this.world.groundAt(wp.x, wp.z);
      const mount = Models.aaMount(e, type === 'heavy' || type === 'sam' || type === 'archie'); mount.position.copy(wp); this.scene.add(mount);
      const ahp = 160 * Math.sqrt(ERA_HP[e] + 0.3);
      base.aa.push({ isAA: true, team: b.team, id: 'aa', baseIdx: i, type, pos: wp.clone().add(new V3(0, 1.5, 0)), hp: ahp, max: ahp, cd: Math.random() * 2, target: null, retarget: 0, burst: 0, mount, local: this.isHost, vel: new V3() });
    });
    return base;
  }
  get cameraPos() { return this._camPos; }
  set cameraPos(v) { this._camPos = v; }
  // ---- spawning
  spawnPoint(team, i) {
    const s = team === 0 ? 1 : -1, row = Math.floor(i / 8), col = i % 8;
    return { pos: new V3((col - 3.5) * 140 + (Math.random() - 0.5) * 40, this.spawnAlt + (col % 3) * 60 + row * 30, s * this.half * 0.7 + s * row * 160), heading: team === 0 ? 0 : Math.PI };
  }
  // Realistic mode: airfields this team can still take off from
  homes(team) { return this.cfg.realistic && this.cfg.homeTeams.includes(team) ? this.bases.filter(b => b.home && b.team === team && !b.dead && b.runway) : null; }
  groundTeam(team) { return !!(this.cfg.realistic && this.cfg.homeTeams.includes(team)); }
  spawnOnRunway(c, i) {
    const hs = this.homes(c.team); if (!hs || !hs.length) return false;
    const h = hs[(c.id + (i || 0)) % hs.length], r = h.runway, side = new V3(-r.dir.z, 0, r.dir.x);
    const lane = ((i || 0) % 3) - 1, row = Math.floor((i || 0) / 3) % Math.max(1, Math.floor(r.len * 0.35 / 30));
    const p = r.c.clone().addScaledVector(r.dir, -r.len / 2 + 40 + row * 30).addScaledVector(side, lane * r.w * 0.28);
    const lay = Models.layout(c.def); p.y = this.world.groundAt(p.x, p.z) + lay.gearH;
    c.spawn(p, Math.atan2(-r.dir.x, -r.dir.z), 0);
    c.onGround = true; c.gearDown = !lay.fixed; c.ctl.throttle = c.isBot ? 1.1 : 0; c.respawnAt = 0; c.home = h; c.climbOut = c.isBot;
    return true;
  }
  spawnCraft(c, i, first) {
    if (i == null) i = Math.floor(Math.random() * 16);
    // (mission bomber raids still arrive in the air)
    if (this.groundTeam(c.team) && !(this.mode === 'missions' && c.spec.task === 'bomb') && this.spawnOnRunway(c, i)) return;
    const sp = this.spawnPoint(c.team, i);
    if (this.mission && this.mission.type === 'intercept' && c.team === 0) { sp.pos.z = this.half * 0.25 + Math.floor(i / 8) * 160; sp.pos.y = this.spawnAlt * 1.2 + (i % 3) * 60; }
    if (c.def.role === 'bomber' || c.spec.task === 'bomb') {
      sp.pos.y = this.spawnAlt * 1.3 + (i % 4) * 40;
      // raids start far out, giving the defenders time to climb and intercept
      if (first) sp.pos.z = (c.team === 0 ? 1 : -1) * this.half * (this.mode === 'missions' ? 1.6 : 1.0) + (c.team === 0 ? 1 : -1) * Math.floor(i / 8) * 160;
    }
    c.spawn(sp.pos, sp.heading, c.perf ? c.perf.vmax * 0.7 : PLANES[c.def.id].spd / 3.6 * 0.7);
    c.vel.setLength(c.perf.vmax * 0.72);
    c.respawnAt = 0;
  }
  // Destroy: a team can only keep sending up aircraft while it still has an airfield or carrier
  airfieldsLeft(team) { return this.bases.filter(b => b.team === team && !b.dead && (b.kind === 'airfield' || b.kind === 'carrier')).length; }
  canRespawn(c) {
    if (this.over) return false;
    if (this.groundTeam(c.team) && !this.homes(c.team).length) return false; // every airfield of this team is destroyed
    if (this.mode === 'destroy' && !this.airfieldsLeft(c.team)) return false;
    if (this.mode === 'destroy') return true;
    return c.lives > 0;
  }
  respawnDelay() { return this.mode === 'destroy' ? 5 : 4; }
  // ---- queries used by AI / turrets
  nearestEnemy(c, maxD, filter) {
    let best = null, bd = maxD || Infinity;
    for (const e of this.crafts) { if (!e.alive || e.team === c.team || !e.dm || e.dm.destroyed) continue; const d = e.pos.distanceTo(c.pos); if (d < bd && (!filter || filter(e))) { bd = d; best = e; } }
    return best;
  }
  attackersOf(e) { let n = 0; for (const c of this.crafts) if (c.ai && c.ai.target === e) n++; return n; }
  hasEnemyBases(team) { return this.bases.some(b => b.team !== team && !b.dead); }
  nearestEnemyBase(team, p, maxD) { let best = null, bd = maxD || Infinity; for (const b of this.bases) if (b.team !== team && !b.dead) { const d = b.pos.distanceTo(p); if (d < bd) { bd = d; best = b; } } return best; }
  taskTarget(c) { if (c.spec.targetBase) { const b = this.bases.find(x => x.id === c.spec.targetBase); if (b && !b.dead) return b; } const objs = this.bases.filter(b => b.team !== c.team && !b.dead && b.objective); return objs.length ? objs[c.id % objs.length] : this.nearestEnemyBase(c.team, c.pos); }
  // ---- per frame
  update(dt) {
    if (this.over) { this.renderAll(dt); return; }
    this.time += dt;
    for (const c of this.crafts) {
      if (c.local) {
        if (c.alive) { if (c.ai && !c.wreck) c.ai.update(dt); c.update(dt); c.missileWarn = Math.max(0, (c.missileWarn || 0) - dt * 2); }
        else if (c.everSpawned && c.isBot && c.respawnAt && this.time >= c.respawnAt && this.canRespawn(c)) this.spawnCraft(c);
      } else c.remoteUpdate(dt);
    }
    this.updateWrecks(dt);
    this.world.update(dt, this.cameraPos);
    this.vehicles.update(dt);
    this.updateAA(dt);
    this.combat.update(dt);
    if (this.isHost) this.rules(dt);
    if (this.net) this.netTick(dt);
    this.renderAll(dt);
  }
  renderAll(dt) {
    for (const c of this.crafts) c.render(dt);
    this.debris = this.debris.filter(d => { d.v.y -= 9.81 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.r.x * dt; d.m.rotation.z += d.r.z * dt; d.t -= dt;
      if (d.m.position.y < this.world.groundAt(d.m.position.x, d.m.position.z) || d.t < 0) { this.scene.remove(d.m); return false; } if (Math.random() < 0.3) FX.puff('smoke', d.m.position); return true; });
    for (const b of this.bases) for (const a of b.aa) if (a.target && a.hp > 0 && a.mount.userData.turret) a.mount.userData.turret.lookAt(a.target.pos.x, a.mount.position.y + 1, a.target.pos.z);
  }
  // a bot bomber that has gone home empty lands off-map and comes back rearmed (no death)
  recycle(c) { c.alive = false; c.wreck = false; c.model.visible = false; c.respawnAt = this.time + 12; }
  spawnDebris(c, mesh) {
    const m = Models.debris(mesh); m.position.copy(c.pos); m.quaternion.copy(c.quat); this.scene.add(m);
    const side = mesh === c.model.userData.wingL ? -1 : 1, right = new V3(side * 8, 3, 0).applyQuaternion(c.quat);
    this.debris.push({ m, v: c.vel.clone().multiplyScalar(0.8).add(right), r: new V3(Math.random() * 3, 0, Math.random() * 3 + 2), t: 30 });
    FX.explosion(c.pos, 0.3);
  }
  // wrecks: destroyed aircraft fall, burning, until they hit the ground
  updateWrecks(dt) {
    for (const c of this.crafts) if (c.local && c.alive && c.wreck) { /* physics continues in Craft.update with no control */ }
  }
  // ---- damage routing
  hitCraft(c, hits, info) {
    if (!c.alive || this.time - c.spawnT < 3) return;
    const att = info.attacker, aid = att && !att.isAA ? att.id : 'aa';
    let sum = 0; for (const h of hits) sum += h.dmg;
    if (att && !att.isAA && att.stats) att.stats.damage += sum;
    if (att === this.player) this.hitMarker = this.time;
    if (c.local) this.applyHits(c, hits, Object.assign({}, info, { attacker: aid }));
    else this.send({ t: 'hit', to: c.id, h: hits.map(x => [x.ci, Math.round(x.dmg * 10) / 10]), a: aid, f: info.fire, p: info.pen, c: info.cal, b: info.fromBehind ? 1 : 0, k: info.kind }, c);
  }
  applyHits(c, hits, info) {
    if (!c.alive || !c.dm) return;
    const wasFire = c.dm.fires, wasDestroyed = c.dm.destroyed;
    Damage.apply(c.dm, hits, { attacker: info.attacker, time: this.time, fire: info.fire, pen: info.pen, cal: info.cal, fromBehind: info.fromBehind, kind: info.kind });
    c.lastHitT = this.time; c.lastAttacker = info.attacker;
    if (c.dm.fires > wasFire) this.creditFire(info.attacker);
    if (c === this.player) { this.hurtT = this.time; Sound.hit((info.cal || 8) > 15 || info.kind === 'missile' || info.kind === 'flak'); }
    c.processDamageEvents();
  }
  creditFire(aid) { const a = this.byId[aid]; if (a) { a.stats.fires++; if (a !== this.player && this.net && this.isHost && !a.local) this.send({ t: 'stat', id: aid, k: 'fires' }, a); } }
  onDamageEvent(c, e) {
    if (e === 'destroyed') { // shot down in the air: becomes a falling wreck; the kill is decided now
      c.wreck = true; c.ctl.throttle = 0;
      FX.explosion(c.pos, c.dm.destroyed === 'explode' ? 1.2 : 0.4);
      this.reportDeath(c, c.dm.destroyed);
    }
    if (c === this.player) this.events.push({ t: this.time, e });
  }
  onCrash(c, sea) {
    FX.explosion(c.pos, 1.5, true); if (sea) FX.puff('splash', c.pos, null, 4);
    Sound.boom(1.6, c.pos);
    const wasWreck = c.wreck;
    c.alive = false; c.wreck = false; c.model.visible = false;
    if (!wasWreck) this.reportDeath(c, 'crash');
    c.respawnAt = this.time + this.respawnDelay();
  }
  reportDeath(c, cause) {
    c.lives--; c.stats.deaths++;
    const log = {}; for (const k in c.dm.log) log[k] = [Math.round(c.dm.log[k].dmg * 100) / 100, Math.round(c.dm.log[k].t * 10) / 10, c.dm.log[k].kind];
    const info = { id: c.id, cause, log, frac: c.dm.frac, pos: [c.pos.x, c.pos.y, c.pos.z], wing: c.dm.wingOff[0] || c.dm.wingOff[1] ? 1 : 0, lives: c.lives };
    if (this.isHost) this.resolveKill(info); else this.send({ t: 'dead', d: info });
  }
  // ---- kill credit (host)
  //  shot down (crew killed / exploded): the enemy that did the most damage
  //  crashed: with >=10% damage, the enemy that did the most damage; with less, an enemy that hit it in
  //  the last 20 s, otherwise the enemy aircraft closest to the crash
  resolveKill(d) {
    const v = this.byId[d.id]; if (!v) return;
    if (!v.local) { v.lives = d.lives; v.stats.deaths++; }
    const ents = Object.entries(d.log).map(([k, x]) => ({ id: +k, dmg: x[0], t: x[1], kind: x[2] })).filter(e => { const a = this.byId[e.id]; return a && a.team !== v.team; });
    ents.sort((a, b) => b.dmg - a.dmg);
    let killer = null, how = d.cause;
    if (d.cause !== 'crash') killer = ents[0] ? this.byId[ents[0].id] : null;
    else if (d.frac >= 0.1 && ents[0]) killer = this.byId[ents[0].id];
    else {
      const recent = ents.filter(e => this.time - e.t <= 20);
      if (recent.length) killer = this.byId[recent[0].id];
      else { let bd = Infinity; const p = new V3(...d.pos); for (const c of this.crafts) if (c.alive && c.team !== v.team && !c.wreck) { const dd = c.pos.distanceTo(p); if (dd < bd) { bd = dd; killer = c; } } how = 'crash-near'; }
    }
    const kind = killer && ents.find(e => e.id === killer.id) ? ents.find(e => e.id === killer.id).kind : null;
    const assists = ents.filter(e => (!killer || e.id !== killer.id) && e.dmg > 0.08).map(e => e.id);
    this.applyKill({ v: v.id, k: killer ? killer.id : null, how, kind, wing: d.wing, assists, lives: d.lives });
    if (this.net) this.broadcast({ t: 'kill', d: { v: v.id, k: killer ? killer.id : null, how, kind, wing: d.wing, assists, lives: d.lives } });
  }
  applyKill(d) {
    const v = this.byId[d.v], k = d.k != null ? this.byId[d.k] : null; if (!v) return;
    if (!v.local) { v.lives = d.lives; if (!this.isHost) v.stats.deaths++; }
    if (k) {
      k.stats.kills++; k.stats.score += 3;
      if (d.how === 'crew') k.stats.crewKills++;
      if (d.wing) k.stats.wingKills++;
      if (d.how === 'crash' || d.how === 'crash-near') k.stats.crashKills++;
      if (d.kind === 'missile') k.stats.missileKills++;
      if (v.def.era >= k.def.era + 2) k.stats.giantKills++;
      if (this.mode === 'destroy' && this.isHost) this.scores[k.team] += 3;
      if (this.mode === 'dogfight' && this.isHost) this.scores[k.team] += 1;
    }
    // assists: personal score and rewards only - they never count towards the team score
    for (const a of d.assists || []) if (this.byId[a]) { this.byId[a].stats.assists++; this.byId[a].stats.score += 1; }
    const how = { crew: 'crew killed', explode: 'destroyed', crash: 'crashed', 'crash-near': 'crashed' }[d.how] || d.how;
    this.feed.push({ t: this.time, text: k ? `${k.name} (${k.def.name}) ⟶ ${v.name} (${v.def.name}) · ${how}` : `${v.name} ${how}`, team: k ? k.team : v.team, me: k === this.player || v === this.player });
    if (k === this.player) this.events.push({ t: this.time, e: 'kill', text: `+3  ${v.def.name} ${how}` });
    for (const a of d.assists || []) if (this.byId[a] === this.player) this.events.push({ t: this.time, e: 'assist', text: `+1  Assist: ${v.def.short}` });
  }
  // ---- ground damage (bases & AA); host applies
  groundHit(p, dmg, rad, owner, team, kind) {
    if (!this.isHost) { if (dmg > 2 || kind !== 'gun') this.send({ t: 'gh', p: [Math.round(p.x), Math.round(p.y), Math.round(p.z)], d: Math.round(dmg * 10) / 10, r: rad, a: owner ? owner.id : null, tm: team }); return; }
    if (kind !== 'gun') for (const v of this.vehicles.list) {
      if (v.dead || v.team === team) continue;
      const d = v.pos.distanceTo(p); if (d < rad + 4) this.vehicles.hit(v, dmg * (d < 4 ? 1 : 1 - (d - 4) / rad) * (kind === 'rocket' ? 1.3 : 1), owner);
    }
    for (const b of this.bases) {
      if (b.dead || b.team === team) continue;
      const dist = b.kind === 'balloon' ? b.pos.distanceTo(p) : Math.hypot(b.pos.x - p.x, b.pos.z - p.z) + Math.max(0, p.y - b.pos.y - 60);
      for (const a of b.aa) if (a.hp > 0 && a.pos.distanceTo(p) < rad + 3) { a.hp -= dmg * (kind === 'gun' ? 2 : 1); if (a.hp <= 0) { FX.explosion(a.pos, 0.5, true); a.mount.visible = false; } }
      if (dist > b.radius + rad) continue;
      const f = dist < b.radius ? 1 : 1 - (dist - b.radius) / rad;
      const d = dmg * f * (b.kind === 'balloon' && kind === 'rocket' ? 4 : 1);
      b.hp -= d; if (owner && owner.id != null) b.log[owner.id] = (b.log[owner.id] || 0) + d;
      if (b.hp <= 0) this.destroyBase(b);
    }
  }
  destroyBase(b, fromNet) {
    if (b.dead) return; b.dead = true; b.hp = 0;
    FX.explosion(b.pos, 3, true); for (let i = 0; i < 4; i++) FX.explosion(b.pos.clone().add(new V3((Math.random() - 0.5) * b.radius, 0, (Math.random() - 0.5) * b.radius)), 1.5, true);
    Sound.boom(2.5, b.pos);
    b.group.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(0x333333); } });
    b.group.scale.y = 0.35;
    for (const a of b.aa) { a.hp = 0; a.mount.visible = false; }
    b.smoke = true;
    let best = null, bd = 0; for (const k in b.log) if (b.log[k] > bd && this.byId[k] && this.byId[k].team !== b.team) { bd = b.log[k]; best = this.byId[k]; }
    const pts = BASE_PTS[b.size];
    if (this.isHost) {
      if (this.mode === 'destroy') this.scores[1 - b.team] += pts;
      if (this.net) this.broadcast({ t: 'base', id: b.idx, by: best ? best.id : null });
    }
    this.creditBase(b, best);
  }
  creditBase(b, by) {
    if (by) { by.stats.bases++; by.stats.basesDestroyed++; by.stats.basePoints += BASE_PTS[b.size]; by.stats.score += BASE_PTS[b.size]; if (b.size === 'big') by.stats.bigBases++; }
    const label = `${{ small: 'Small', medium: 'Medium', big: 'Big' }[b.size]} ${b.kind}`;
    this.feed.push({ t: this.time, text: `${by ? by.name : 'Team'} destroyed a ${label} base (+${BASE_PTS[b.size]})`, team: 1 - b.team, me: by === this.player });
    if (by === this.player) this.events.push({ t: this.time, e: 'base', text: `+${BASE_PTS[b.size]}  ${label} destroyed` });
  }
  // ---- anti-aircraft fire
  updateAA(dt) {
    for (const b of this.bases) {
      if (b.dead) continue;
      if (b.smoke && Math.random() < dt * 3) FX.puff('smoke', b.pos);
      for (const a of b.aa) {
        if (a.hp <= 0) continue;
        a.cd -= dt; a.retarget -= dt;
        const R = { mg: 600, light: 1200, archie: 3000, heavy: 5500, radar: 2200, sam: 9000 }[a.type];
        if (a.retarget <= 0) { a.retarget = 1 + Math.random(); a.target = this.nearestEnemy({ team: a.team, pos: a.pos }, R, c => c.pos.y - a.pos.y > 30); }
        const t = a.target; if (!t || !t.alive || t.wreck) { a.target = null; continue; }
        const d = t.pos.distanceTo(a.pos); if (d > R) continue;
        if (a.type === 'sam') {
          if (a.cd <= 0 && this.isHost && d > 1200) { a.cd = 14 + Math.random() * 6; this.combat.missile(a.pos.clone().add(new V3(0, 3, 0)), new V3(0, 40, 0), a, { name: 'SAM', seek: 'arh', range: R, speed: 900, g: 18, fov: 40, ccm: 0.95, life: 25, mass: 200 }, t, 'sam'); }
          continue;
        }
        if (a.type === 'heavy' || a.type === 'archie') {
          if (a.cd <= 0) { a.cd = a.type === 'archie' ? 3.5 : 2.2 + Math.random();
            const ms = 800, tof = d / ms, aim = t.pos.clone().addScaledVector(t.vel, tof).add(new V3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(50 + d / 30));
            const v = aim.clone().sub(a.pos).normalize().multiplyScalar(ms); v.y += 9.81 * tof * 0.5;
            this.combat.flak(a.pos, v, tof, a.type === 'archie' ? 80 : 120, a.type === 'archie' ? 14 : 18, a.team, a); }
          continue;
        }
        // guns: short bursts with lead
        const spec = { mg: [450, 800, 8, 0.05, 7.9], light: [240, 880, 40, 0.042, 20], radar: [600, 980, 50, 0.02, 23] }[a.type];
        if (a.burst <= 0 && Math.random() < dt * 1.5) a.burst = 0.8 + Math.random() * 1.5;
        if (a.burst > 0) { a.burst -= dt;
          while (a.cd <= 0) { a.cd += 60 / spec[0];
            const tof = d / spec[1], lead = t.pos.clone().addScaledVector(t.vel, tof);
            const dir = lead.sub(a.pos).normalize(); dir.y += 9.81 * tof * tof * 0.5 / d; const e = spec[3] * (1 + d / R);
            dir.add(new V3((Math.random() - 0.5) * e, (Math.random() - 0.5) * e, (Math.random() - 0.5) * e)).normalize();
            Sound.fire('aa' + b.idx + ':' + b.aa.indexOf(a), { rpm: spec[0], cal: spec[4] }, 1, a.pos, false);
            this.combat.bullet(a.pos, dir.multiplyScalar(spec[1]), a, { dmg: spec[2], pen: 1, fire: 1, he: spec[4] >= 20 ? 1.3 : 0, struct: 1, cal: spec[4] }, Math.random() < 0.5 ? [1, 0.6, 0.3] : null, R / spec[1] + 0.3, !this.isHost);
          }
        } else if (a.cd < 0) a.cd = 0;
      }
    }
  }
  // ---- rules, objectives and the end of the match (host)
  rules(dt) {
    const humans = this.crafts.filter(c => c.human);
    if (this.cfg.time && this.time >= this.cfg.time && this.mode !== 'missions') {
      if (this.mode === 'destroy') return this.end(this.scores[0] === this.scores[1] ? -1 : this.scores[0] > this.scores[1] ? 0 : 1, 'Time is up');
      if (this.mode === 'dogfight') { const lv = t => this.crafts.filter(c => c.team === t).reduce((a, c) => a + Math.max(0, c.lives) + (c.alive ? 1 : 0), 0); const a = lv(0), b = lv(1); return this.end(a === b ? (this.scores[0] === this.scores[1] ? -1 : this.scores[0] > this.scores[1] ? 0 : 1) : a > b ? 0 : 1, 'Time is up'); }
      if (this.mode === 'survival') return this.end(0, 'Time is up');
    }
    if (this.mode === 'destroy' && this.time > 5) for (const t of [0, 1]) {
      const own = this.bases.filter(b => b.team === t);
      if (own.length && own.every(b => b.dead)) return this.end(1 - t, t === 0 ? 'All our bases were destroyed' : 'All enemy bases destroyed');
      if (!this.airfieldsLeft(t) && !this.crafts.some(c => c.team === t && c.alive && !c.wreck)) return this.end(1 - t, t === 0 ? 'Our airfields are gone and every aircraft is down' : 'Enemy airfields destroyed and every enemy aircraft shot down');
    }
    if (this.mode === 'dogfight') {
      for (const t of [0, 1]) { const out = this.crafts.filter(c => c.team === t).every(c => !c.alive && c.lives <= 0); if (out && this.time > 3) return this.end(1 - t, 'Enemy team eliminated'); }
    }
    if (this.mode === 'missions') {
      const ms = this.mission, myBase = this.bases.find(b => b.id === 'T0');
      const enemiesLeft = this.crafts.filter(c => c.team === 1 && (c.alive || c.lives > 0)).length;
      const humansOut = humans.every(h => !h.alive && h.lives <= 0);
      if (humansOut) return this.end(1, 'All pilots lost');
      if (this.time > this.cfg.time) return this.end(1, 'Out of time');
      if (ms.type === 'sweep' && enemiesLeft === 0) return this.end(0, 'Airspace cleared');
      const raid = t => this.crafts.filter(c => c.team === t && c.spec.task === 'bomb' && c.alive && !c.wreck);
      if (ms.type === 'intercept') {
        if (myBase && myBase.dead) return this.end(1, 'The target was destroyed');
        const left = raid(1);
        if (!left.length) return this.end(0, 'Bombers stopped');
        if (this.time > 30 && left.every(c => c.count('b') === 0) && !this.combat.bombs.some(bm => bm.team === 1)) return this.end(0, 'The raid turned back — target saved');
      }
      if (ms.type === 'strike' || ms.type === 'escort') {
        const objs = this.bases.filter(b => b.team === 1 && b.objective);
        if (objs.length && objs.every(b => b.dead)) return this.end(0, 'Targets destroyed');
        if (ms.type === 'escort' && !raid(0).length && this.time > 5) return this.end(1, 'The bombers were lost');
        if (ms.type === 'escort' && this.time > 30 && raid(0).every(c => c.count('b') === 0) && !this.combat.bombs.some(bm => bm.team === 0) && objs.some(b => !b.dead)) return this.end(1, 'The bombs are gone and the target still stands');
      }
    }
    if (this.mode === 'survival') {
      const myBase = this.bases.find(b => b.id === 'T0');
      if (myBase && myBase.dead) return this.end(0, `Base lost on wave ${this.wave}`);
      if (humans.every(h => !h.alive && h.lives <= 0)) return this.end(0, `Shot down on wave ${this.wave}`);
      const left = this.crafts.filter(c => c.team === 1 && c.alive && !c.wreck).length;
      if (left === 0) { this.waveT -= dt; if (this.waveT <= 0) { this.nextWave(); this.waveT = 8; } }
    }
  }
  nextWave() {
    if (this.wave > 0) this.scores[0] = this.wave;
    this.wave++; const n = Math.min(22, 1 + Math.round(this.wave * 1.4)), bombers = this.wave % 3 === 0;
    const specs = [];
    for (let i = 0; i < n; i++) { const pl = Plan.pick(botPlanes(this.era)); specs.push(Plan.bot(this.nextId++, 1, pl.id, { skill: Math.min(0.95, 0.3 + this.wave * 0.05 + Math.random() * 0.2), extra: { lives: 1 } })); }
    if (bombers) for (let i = 0; i < 2 + Math.floor(this.wave / 3); i++) { const bp = Plan.pick(bomberPlanes(this.era)); specs.push(Plan.bot(this.nextId++, 1, bp.id, { task: 'bomb', extra: { lives: 1, targetBase: 'T0' } })); }
    // old wave aircraft are recycled out of the list to keep it small
    this.crafts = this.crafts.filter(c => !(c.team === 1 && !c.alive && c.lives <= 0 && (this.scene.remove(c.model), true)));
    specs.forEach((s, i) => { const c = this.addCraft(s); this.spawnCraft(c, i); });
    if (this.net) this.broadcast({ t: 'wave', w: this.wave, specs });
    this.events.push({ t: this.time, e: 'wave', text: `Wave ${this.wave}${bombers ? ' — bombers inbound!' : ''}` });
  }
  end(winner, reason) {
    if (this.over) return; this.over = true;
    this.result = { winner, reason, scores: this.scores.slice(), wave: this.wave, stats: this.crafts.map(c => ({ id: c.id, name: c.name, team: c.team, plane: c.def.id, bot: c.isBot, s: c.stats })) };
    if (this.net && this.isHost) this.broadcast({ t: 'end', r: this.result });
  }
  // ---- networking -----------------------------------------------------------
  send(msg, toCraft) {
    if (!this.net) return;
    if (this.isHost) { const owner = toCraft ? toCraft.spec.owner : null; if (owner && owner !== 'H') Net.sendTo(owner, msg); }
    else Net.send(msg);
  }
  broadcast(msg) { if (this.net && this.isHost) Net.broadcast(msg); }
  sendFx(msg) { if (!this.net) return; if (this.isHost) Net.broadcast(msg); else Net.send(msg); }
  netTick(dt) {
    this.snapT -= dt; this.stateT -= dt;
    if (this.isHost) {
      if (this.snapT <= 0) {
        this.snapT = 0.1;
        const st = [], dmg = {};
        for (const c of this.crafts) { if (!c.everSpawned && !c.net) continue; st.push(c.local ? c.packState() : c.lastState || c.packState());
          if (c.dm && c.dmgVer !== c.sentDmgVer) { dmg[c.id] = c.local ? Damage.pack(c.dm) : c.lastDmg; c.sentDmgVer = c.dmgVer; } }
        const msg = { t: 'snap', tm: Math.round(this.time * 100) / 100, s: st, d: dmg, sc: this.scores, w: this.wave };
        this.baseSnapT -= 0.1; if (this.baseSnapT <= 0) { this.baseSnapT = 0.5; msg.b = this.bases.map(b => Math.round(b.hp)); msg.v = this.vehicles.pack(); msg.aa = this.bases.map(b => b.aa.map(a => a.hp > 0 ? 1 : 0).join(''));
          msg.st = this.crafts.map(c => [c.id, c.stats.kills, c.stats.deaths, c.stats.score, c.lives === Infinity ? -1 : c.lives]); }
        Net.broadcast(msg);
      }
    } else if (this.player && this.stateT <= 0) {
      this.stateT = 1 / 15;
      const p = this.player, msg = { t: 'st', s: p.packState() };
      if (p.dm && p.dmgVer !== p.sentDmgVer) { msg.d = Damage.pack(p.dm); p.sentDmgVer = p.dmgVer; }
      Net.send(msg);
    }
  }
  onNet(from, m) {
    const H = this.isHost;
    switch (m.t) {
      case 'st': { // a client's own aircraft (host)
        const c = this.byId[m.s[0]]; if (!c || c.spec.owner !== from) return;
        c.lastState = m.s; c.applyState(m.s, this.time); if (m.d) { c.lastDmg = m.d; c.dmgVer++; this.unpackDmg(c, m.d); } break; }
      case 'snap': { if (H) return;
        if (Math.abs(this.time - m.tm) > 0.3) this.time = m.tm; this.scores = m.sc; this.wave = m.w || 0;
        for (const s of m.s) { const c = this.byId[s[0]]; if (!c || c.local) continue; c.applyState(s, this.time); }
        for (const id in m.d) { const c = this.byId[id]; if (c && !c.local && m.d[id]) this.unpackDmg(c, m.d[id]); }
        if (m.b) m.b.forEach((hp, i) => { const b = this.bases[i]; if (!b) return; b.hp = hp; if (hp <= 0 && !b.dead) this.destroyBase(b, true); });
        if (m.v) this.vehicles.unpack(m.v);
        if (m.aa) m.aa.forEach((s, i) => { const b = this.bases[i]; if (b) b.aa.forEach((a, k) => { if (s[k] === '0' && a.hp > 0) { a.hp = 0; a.mount.visible = false; } }); });
        if (m.st) for (const [id, k, d, sc, lv] of m.st) { const c = this.byId[id]; if (c && !c.local) { c.stats.kills = k; c.stats.deaths = d; c.stats.score = sc; c.lives = lv < 0 ? Infinity : lv; } else if (c && c.local) c.lives = lv < 0 ? Infinity : lv; }
        break; }
      case 'hit': { // a hit on an aircraft: apply if it is ours, else (host) forward to its owner
        const c = this.byId[m.to]; if (!c) return;
        const hits = m.h.map(([ci, dmg]) => ({ ci, dmg })), info = { attacker: m.a, fire: m.f, pen: m.p, cal: m.c, fromBehind: !!m.b, kind: m.k };
        if (c.local) { if (this.time - c.spawnT >= 3) this.applyHits(c, hits, info); }
        else if (H) Net.sendTo(c.spec.owner, m);
        if (H) { const a = this.byId[m.a]; if (a && !a.local) a.stats.damage += hits.reduce((x, h) => x + h.dmg, 0); }
        break; }
      case 'gh': if (H) this.groundHit(new V3(...m.p), m.d, m.r, this.byId[m.a] || null, m.tm, 'net'); break;
      case 'dead': if (H) { const c = this.byId[m.d.id]; if (c && c.spec.owner === from) this.resolveKill(m.d); } break;
      case 'kill': if (!H) this.applyKill(m.d); break;
      case 'vh': if (H) { const v = this.vehicles.list[m.i]; if (v) this.vehicles.hit(v, m.d, this.byId[m.a] || null); } break;
      case 'vk': if (!H) { const v = this.vehicles.list[m.i]; if (v) this.vehicles.destroy(v, m.by); } break;
      case 'stat': if (!H) { const c = this.byId[m.id]; if (c) c.stats[m.k]++; } break;
      case 'base': if (!H) { const b = this.bases[m.id]; if (b) { const by = this.byId[m.by] || null; if (!b.dead) { b.log = {}; if (by) b.log[by.id] = 1; this.destroyBaseRemote(b, by); } } } break;
      case 'wave': if (!H) { this.wave = m.w; this.crafts = this.crafts.filter(c => !(c.team === 1 && !c.alive && c.lives <= 0 && (this.scene.remove(c.model), true))); for (const s of m.specs) if (!this.byId[s.id]) this.addCraft(s); this.events.push({ t: this.time, e: 'wave', text: `Wave ${m.w}` }); } break;
      case 'end': if (!H) { this.over = true; this.result = m.r; } break;
      case 'k': case 'b': case 'r': case 'm': case 'f': this.cosmeticFx(m); if (H) for (const p of Net.peers()) if (p !== from) Net.sendTo(p, m); break;
    }
  }
  destroyBaseRemote(b, by) {
    b.dead = false; const realHost = this.isHost; this.isHost = false; this.destroyBase(b, true); this.isHost = realHost;
    // destroyBase found the attacker from the log we just set
  }
  unpackDmg(c, pack) {
    if (!c.dm) c.remoteSpawn();
    const before = c.dm.wingOff.slice(); Damage.unpack(c.dm, pack);
    const u = c.model.userData;
    if (c.dm.wingOff[0] && !before[0] && u.wingL.visible) { u.wingL.visible = false; this.spawnDebris(c, u.wingL); }
    if (c.dm.wingOff[1] && !before[1] && u.wingR.visible) { u.wingR.visible = false; this.spawnDebris(c, u.wingR); }
  }
  cosmeticFx(m) {
    const c = this.byId[m.id], V = a => new V3(a[0], a[1], a[2]);
    if (m.k === 'f' && c) this.combat.flare(c, true);
    if (m.k === 'b' && c) { const mesh = Models.bomb(STORES[m.s].mass); this.scene.add(mesh); this.combat.bombs.push({ p: V(m.p), v: V(m.v), owner: c, team: c.team, s: STORES[m.s], mesh, real: false }); }
    if (m.k === 'r' && c) { const mesh = Models.missile(1.6, 0.06); this.scene.add(mesh); this.combat.rockets.push({ p: V(m.p), prev: V(m.p), v: V(m.v).addScaledVector(V(m.d), 40), dir: V(m.d), owner: c, team: c.team, s: STORES[m.s], life: 6, t: 0, mesh, real: false }); }
    if (m.k === 'm') {
      const tg = this.byId[m.tg]; if (!tg) return;
      const owner = m.id === -1 ? (this.bases[m.aa] && this.bases[m.aa].aa[0]) : c; if (!owner) return;
      const s = m.s === 'sam' ? { name: 'SAM', seek: 'arh', range: 9000, speed: 900, g: 18, fov: 40, ccm: 0.95, life: 25, mass: 200 } : STORES[m.s];
      const mesh = Models.missile(2.8, 0.09); this.scene.add(mesh);
      const dir = V(m.v).lengthSq() > 1 ? V(m.v).normalize() : new V3(0, 1, 0);
      this.combat.missiles.push({ p: V(m.p), prev: V(m.p), v: V(m.v).addScaledVector(dir, 30), dir, owner, team: owner.team, s, target: tg, life: s.life, t: 0, mesh, real: false });
      if (tg.local) tg.missileWarn = 1;
    }
  }
  dispose() {
    this.combat.clear();
    for (const c of this.crafts) this.scene.remove(c.model);
    for (const b of this.bases) { this.scene.remove(b.group); for (const a of b.aa) this.scene.remove(a.mount); }
    for (const d of this.debris) this.scene.remove(d.m);
    this.vehicles.dispose();
    this.world.dispose(); this.scene.fog = null;
  }
}
