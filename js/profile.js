// ============================================================================
// Player profile: saved to localStorage. Levels, XP (spendable XP is separate
// from the XP total that sets the level), coins, owned aircraft, purchased
// modifications and loadouts, stats and achievements.
// ============================================================================
const Profile = (() => {
  const KEY = 'skyward-aces-profile-v1';
  let p = null;
  function fresh() {
    const owned = {}; for (const pl of PLANE_LIST) if (pl.starter) owned[pl.id] = true;
    return { v: 1, name: 'Pilot' + Math.floor(1000 + Math.random() * 9000), totalXp: 0, xp: 0, coins: 2500, owned, selected: 'camel', mods: {}, stats: {}, ach: {}, created: Date.now(), settings: { sens: 1, invert: false, volume: 0.7, quality: 1, cross: '#ffffff', binds: {}, assist: true, assistRange: 1 } };
  }
  function load() {
    try { const s = localStorage.getItem(KEY); if (s) p = JSON.parse(s); } catch (e) { p = null; }
    if (!p || p.v !== 1) p = fresh();
    const f = fresh(); for (const k in f) if (p[k] === undefined) p[k] = f[k];
    for (const k in f.settings) if (p.settings[k] === undefined) p.settings[k] = f.settings[k];
    for (const pl of PLANE_LIST) if (pl.starter) p.owned[pl.id] = true;
    if (!PLANES[p.selected] || !p.owned[p.selected]) p.selected = 'camel';
    return p;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }

  // ---- levels: each level needs 1.1x the XP of the one before
  const need = lvl => Math.round(1000 * Math.pow(1.1, lvl - 1));
  function levelInfo(total) {
    let lvl = 1, rest = total == null ? p.totalXp : total;
    while (rest >= need(lvl)) { rest -= need(lvl); lvl++; }
    return { level: lvl, into: rest, need: need(lvl), frac: rest / need(lvl) };
  }

  // ---- research: per nation, up to one era above the newest era owned in that nation
  function maxEra(nation) { let m = 0; for (const id in p.owned) { const pl = PLANES[id]; if (pl && pl.nation === nation) m = Math.max(m, pl.era); } return m; }
  function canResearch(planeId) {
    const pl = PLANES[planeId]; if (!pl || pl.aiOnly || p.owned[planeId]) return { ok: false, why: 'owned' };
    if (pl.era > maxEra(pl.nation) + 1) return { ok: false, why: `Own ${/^[AEIOU]/.test(ERAS[pl.era - 1].name) ? 'an' : 'a'} ${ERAS[pl.era - 1].name} ${NATIONS[pl.nation].name} aircraft first` };
    if (p.xp < pl.cost) return { ok: false, why: `Needs ${pl.cost.toLocaleString()} XP` };
    return { ok: true };
  }
  function research(planeId) {
    const c = canResearch(planeId); if (!c.ok) return c;
    p.xp -= PLANES[planeId].cost; p.owned[planeId] = true; save(); return { ok: true };
  }

  // ---- modifications
  function modsOf(planeId) {
    let m = p.mods[planeId];
    if (!m) m = p.mods[planeId] = { belts: {}, beltSel: {}, stores: {}, loadout: null, upg: {}, inst: {} };
    const pl = PLANES[planeId];
    if (!m.slots || m.slots.length !== Loadout.slots(pl).length) m.slots = Loadout.normalise(pl, m.loadout, false); // per pylon (older saves: per group)
    migrateBombs(pl, m);
    if (!m.liveries) m.liveries = {}; if (m.livery === undefined) m.livery = null;
    return m;
  }
  // the generic bombs of older versions (b50 .. b1000) become the named bomb of the nearest mass this aircraft carries
  function migrateBombs(pl, m) {
    const sl = Loadout.slots(pl), near = (kg, slot) => Object.keys(STORES).filter(id => STORES[id].kind === 'b' && (slot ? Loadout.allowed(pl, slot, id) : storesFor(pl).includes(id)))
      .sort((a, b) => Math.abs(STORES[a].mass - kg) - Math.abs(STORES[b].mass - kg))[0] || null;
    for (const old in OLD_BOMBS) if (m.stores[old]) { delete m.stores[old]; const n = near(OLD_BOMBS[old]); if (n) m.stores[n] = true; }
    m.slots = m.slots.map((id, i) => id && OLD_BOMBS[id] ? near(OLD_BOMBS[id], sl[i]) : id);
  }
  function gunsOf(pl) { const s = new Set(pl.guns.map(g => g[0])); return [...s]; }
  function buy(cost) { if (p.coins < cost) return false; p.coins -= cost; bump('modsBought', 1); return true; }
  function buyBelt(planeId, gunId, beltId) {
    const pl = PLANES[planeId], m = modsOf(planeId), cost = beltPrice(beltId, pl.era);
    (m.belts[gunId] = m.belts[gunId] || {});
    if (m.belts[gunId][beltId]) return true;
    if (!buy(cost)) return false; m.belts[gunId][beltId] = true; m.beltSel[gunId] = beltId; save(); return true;
  }
  function hasBelt(planeId, gunId, beltId) { if (beltId === 'std') return true; const m = modsOf(planeId); return !!(m.belts[gunId] && m.belts[gunId][beltId]); }
  function selectBelt(planeId, gunId, beltId) { if (!hasBelt(planeId, gunId, beltId)) return false; modsOf(planeId).beltSel[gunId] = beltId; save(); return true; }
  function buyStore(planeId, storeId) {
    const m = modsOf(planeId); if (m.stores[storeId]) return true;
    if (!buy(STORES[storeId].price)) return false; m.stores[storeId] = true; save(); return true;
  }
  function loadoutMass(planeId, lo) { const pl = PLANES[planeId]; return Loadout.mass(pl, lo || modsOf(planeId).slots); }
  // put a store on one pylon slot (null empties it); mirror: the same on the matching slot of the other wing.
  // Checks what the pylon can carry, its weight limit and the total payload.
  function setSlot(planeId, idx, storeId, mirror) {
    const pl = PLANES[planeId], m = modsOf(planeId), sl = Loadout.slots(pl), lo = m.slots.slice(), targets = [idx];
    if (mirror && sl[idx].mirror >= 0) targets.push(sl[idx].mirror);
    for (const i of targets) {
      if (storeId) { if (!m.stores[storeId]) return { ok: false, why: 'Buy it first' };
        if (!Loadout.allowed(pl, sl[i], storeId)) return { ok: false, why: `${sl[i].name} cannot carry that` }; }
      lo[i] = storeId || null; }
    if (Loadout.mass(pl, lo) > pl.payload) return { ok: false, why: `Over the ${pl.payload} kg payload limit` };
    m.slots = lo; save(); return { ok: true };
  }
  // older callers (per hardpoint group): fill every slot of that group
  function setStation(planeId, g, storeId) { const sl = Loadout.slots(PLANES[planeId]); let r = { ok: true };
    for (const s of sl) if (s.g === g && r.ok) r = setSlot(planeId, s.i, storeId, false); return r; }
  function buyLivery(planeId, id) {
    const pl = PLANES[planeId], m = modsOf(planeId); if (!LIVERY[id] || !LIVERY[id].planes.includes(planeId)) return false; if (m.liveries[id]) return true;
    if (!buy(liveryPrice(pl))) return false; m.liveries[id] = true; m.livery = id; save(); return true;
  }
  function setLivery(planeId, id) { const m = modsOf(planeId); if (id && !m.liveries[id]) return false; m.livery = id || null; save(); return true; }
  function buyUpgrade(planeId, modId) {
    const pl = PLANES[planeId], m = modsOf(planeId); if (m.upg[modId]) return true;
    if (!buy(MODS[modId].price(pl.era))) return false; m.upg[modId] = true; m.inst[modId] = true; save(); return true;
  }
  function toggleUpgrade(planeId, modId) { const m = modsOf(planeId); if (!m.upg[modId]) return; m.inst[modId] = !m.inst[modId]; save(); }
  function upgradesFor(pl) { return Object.keys(MODS).filter(k => pl.era >= MODS[k].minEra && (!MODS[k].needsRadar || pl.radar) && (k !== 'flares' || pl.flares > 0)); }
  // what actually flies: the loadout summary passed into a match (and over the network)
  function loadoutFor(planeId) {
    const pl = PLANES[planeId], m = modsOf(planeId), belts = {};
    for (const g of gunsOf(pl)) belts[g] = hasBelt(planeId, g, m.beltSel[g]) ? (m.beltSel[g] || 'std') : 'std';
    const inst = {}; for (const k in m.inst) if (m.inst[k] && m.upg[k]) inst[k] = true;
    return { belts, stores: m.slots.slice(), perSlot: true, mods: inst, livery: m.livery || null };
  }

  // ---- stats & achievements
  function bump(stat, n) { p.stats[stat] = (p.stats[stat] || 0) + n; }
  function maxStat(stat, v) { p.stats[stat] = Math.max(p.stats[stat] || 0, v); }
  function derived() {
    const owned = Object.keys(p.owned).map(id => PLANES[id]).filter(Boolean);
    p.stats.owned = owned.length; p.stats.jets = owned.filter(x => x.kind === 'jet').length; p.stats.modern = owned.filter(x => x.era === 7).length;
    p.stats.level = levelInfo().level; p.stats.nationsWon = Object.keys(p.stats.nationWins || {}).length;
  }
  function checkAchievements() {
    derived(); const got = [];
    for (const a of ACHIEVEMENTS) if (!p.ach[a.id] && (p.stats[a.stat] || 0) >= a.goal) { p.ach[a.id] = Date.now(); got.push(a); }
    save(); return got;
  }
  function progress(a) { derived(); return Math.min(1, (p.stats[a.stat] || 0) / a.goal); }

  // ---- end-of-battle rewards. r: { kills, assists, bases:{small,medium,big}, damage, deaths, won, era, mode, survivedWaves, missionWon }
  function rewards(r) {
    const mul = ERAS[r.era].xpMul;
    const perf = r.kills * 180 + r.assists * 90 + (r.tanks || 0) * 60 + r.basePoints * 90 + Math.round(r.damage * 0.25) + (r.score || 0) * 20 + (r.waves || 0) * 120;
    // the participation reward is only paid for staying to the end of the battle: leaving early earns just what you did
    const base = r.left ? 0 : 150 + Math.round(Math.min(r.minutes, 30) * 25);
    const winB = r.won ? 1.35 : 1;
    const xp = Math.round((base + perf) * mul * winB);
    const coins = Math.round((base * 1.6 + perf * 1.4) * mul * winB);
    return { xp, coins };
  }
  function applyBattle(r) {
    const before = levelInfo().level, rw = rewards(r);
    p.totalXp += rw.xp; p.xp += rw.xp; p.coins += rw.coins;
    bump('coinsEarned', rw.coins); bump('battles', 1); bump('kills', r.kills); bump('deaths', r.deaths); bump('assists', r.assists);
    bump('bases', r.basesDestroyed); bump('bigBases', r.bigBases); bump('crewKills', r.crewKills); bump('wingKills', r.wingKills); bump('fires', r.fires);
    bump('crashKills', r.crashKills); bump('tanks', r.tanks || 0); bump('missileKills', r.missileKills); bump('giantKills', r.giantKills); bump('flightTime', Math.round(r.minutes * 60));
    maxStat('bestKills', r.kills); if (r.waves) maxStat('bestWave', r.waves);
    if (r.won) { bump('wins', 1); if (r.mode === 'destroy') bump('destroyWins', 1); if (r.mode === 'dogfight') bump('dogfightWins', 1); if (r.mode === 'missions') bump('missions', 1);
      (p.stats.nationWins = p.stats.nationWins || {})[r.nation] = 1; }
    if (r.deaths === 0 && r.kills >= 3) bump('flawless', 1);
    const pu = p.stats.planeUse = p.stats.planeUse || {}; pu[r.plane] = (pu[r.plane] || 0) + 1;
    const after = levelInfo().level, ach = checkAchievements();
    return Object.assign(rw, { levelUp: after > before ? after : 0, achievements: ach });
  }
  function reset() { p = fresh(); save(); }
  load();
  return {
    get: () => p, save, load, reset, levelInfo, need, maxEra, canResearch, research, modsOf, gunsOf,
    buyBelt, hasBelt, selectBelt, buyStore, setStation, setSlot, buyLivery, setLivery, loadoutMass, buyUpgrade, toggleUpgrade, upgradesFor, loadoutFor,
    bump, checkAchievements, progress, rewards, applyBattle,
  };
})();
