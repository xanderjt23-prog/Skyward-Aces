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
    return { v: 1, name: 'Pilot' + Math.floor(1000 + Math.random() * 9000), totalXp: 0, xp: 0, coins: 2500, owned, selected: 'camel', mods: {}, stats: {}, ach: {}, achPaid: {}, tut: {}, board: {}, pilotId: newId(), created: Date.now(), settings: { sens: 1, invert: false, volume: 0.7, quality: 1, cross: '#ffffff', binds: {}, assist: true, assistRange: 1 } };
  }
  function load() {
    try { const s = localStorage.getItem(KEY); if (s) p = JSON.parse(s); } catch (e) { p = null; }
    if (!p || p.v !== 1) p = fresh();
    const f = fresh(); for (const k in f) if (p[k] === undefined) p[k] = f[k];
    for (const k in f.settings) if (p.settings[k] === undefined) p.settings[k] = f.settings[k];
    for (const pl of PLANE_LIST) if (pl.starter) p.owned[pl.id] = true;
    if (!PLANES[p.selected] || !p.owned[p.selected]) p.selected = 'camel';
    if (!p.achPaid) p.achPaid = {}; if (!p.tut) p.tut = {}; if (!p.board) p.board = {}; if (!p.pilotId) p.pilotId = newId();
    return p;
  }
  function newId() { return Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join(''); }
  // ---- leaderboard without a server: every pilot carries a card (name, level, multiplayer record). Cards are swapped in
  // multiplayer lobbies, together with the cards each player already knows, so the board spreads from player to player.
  // A card is only as honest as the game that sent it.
  const num = v => Math.max(0, Math.min(1e7, Math.floor(+v || 0)));
  // Elo rating from multiplayer battles against other people (bots never count): team average against team average,
  // K = 40 for the first 10 rated battles, 32 after; a draw is half a win
  function elo() { return Math.round(p.stats.elo || 1000); }
  function rateBattle(myTeam, enemy, score) {
    if (!enemy.length || !myTeam.length) return null;
    const avg = l => l.reduce((a, x) => a + x, 0) / l.length, E = 1 / (1 + Math.pow(10, (avg(enemy) - avg(myTeam)) / 400)), K = (p.stats.eloGames || 0) < 10 ? 40 : 32;
    const before = elo(), d = K * (score - E); p.stats.elo = Math.max(100, before + d); p.stats.eloGames = (p.stats.eloGames || 0) + 1; p.stats.eloPeak = Math.max(p.stats.eloPeak || 1000, p.stats.elo); save();
    return { before, after: elo(), delta: Math.round(d), expected: E };
  }
  function myCard() { const s = p.stats; return { id: p.pilotId, name: p.name, level: levelInfo().level, elo: elo(), eloGames: s.eloGames || 0, mpBattles: s.mpBattles || 0, mpWins: s.mpWins || 0, mpKills: s.mpKills || 0, mpDeaths: s.mpDeaths || 0, updated: Date.now() }; }
  function shareCards() { return [myCard()].concat(Object.values(p.board).sort((a, b) => b.updated - a.updated).slice(0, 100).map(c => { const o = Object.assign({}, c); delete o.met; return o; })); }
  // merge received cards (the newest card of each pilot wins); `metId`: the pilot who sent them, met in person
  function mergeCards(cards, metId) {
    if (!Array.isArray(cards)) return 0; let n = 0;
    for (const c of cards.slice(0, 101)) {
      if (!c || typeof c.id !== 'string' || !/^[a-z0-9]{8,32}$/.test(c.id) || c.id === p.pilotId) continue;
      const card = { id: c.id, name: String(c.name || 'Pilot').slice(0, 18), level: Math.min(999, num(c.level)), mpBattles: num(c.mpBattles), mpWins: Math.min(num(c.mpWins), num(c.mpBattles)), mpKills: num(c.mpKills), mpDeaths: num(c.mpDeaths), elo: Math.max(100, Math.min(4000, num(c.elo) || 1000)), eloGames: num(c.eloGames), updated: Math.min(Date.now(), Math.max(0, Math.floor(+c.updated || 0))) };
      const old = p.board[c.id]; if (old && old.updated >= card.updated) { if (c.id === metId) old.met = Date.now(); continue; }
      if (old && old.met) card.met = old.met; if (c.id === metId) card.met = Date.now(); p.board[c.id] = card; n++;
    }
    const ids = Object.keys(p.board); if (ids.length > 300) ids.sort((a, b) => p.board[a].updated - p.board[b].updated).slice(0, ids.length - 300).forEach(id => delete p.board[id]);
    save(); return n;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
  function tutorialDone(id) { if (!p.tut[id]) { p.tut[id] = Date.now(); save(); } return checkAchievements(); }

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
    { const sl = Loadout.slots(pl); m.slots = m.slots.map((id, i) => id && !Loadout.allowed(pl, sl[i], id) ? null : id); } // nothing the aircraft cannot really carry
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
  // weapon keys: put a weapon type on key k (0-7); whatever was on that key moves to the weapon's old key
  function setWeaponKey(planeId, storeId, k) {
    const m = modsOf(planeId), keys = m.keys || (m.keys = {}), old = keys[storeId];
    for (const id in keys) if (keys[id] === k && id !== storeId) { if (old != null) keys[id] = old; else delete keys[id]; }
    keys[storeId] = k; save();
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
    return { belts, stores: m.slots.slice(), perSlot: true, mods: inst, livery: m.livery || null, keys: Object.assign({}, m.keys || {}) };
  }

  // ---- stats & achievements
  function bump(stat, n) { p.stats[stat] = (p.stats[stat] || 0) + n; }
  function maxStat(stat, v) { p.stats[stat] = Math.max(p.stats[stat] || 0, v); }
  function derived() {
    const owned = Object.keys(p.owned).map(id => PLANES[id]).filter(Boolean);
    p.stats.owned = owned.length; p.stats.jets = owned.filter(x => x.kind === 'jet').length; p.stats.modern = owned.filter(x => x.era === 7).length;
    p.stats.level = levelInfo().level; p.stats.nationsWon = Object.keys(p.stats.nationWins || {}).length;
    p.stats.erasFlown = new Set(Object.keys(p.stats.planeUse || {}).map(id => PLANES[id] && PLANES[id].era).filter(Boolean)).size;
    if (typeof Tutorial !== 'undefined') { const t = p.tut || {}; for (const a of ACHIEVEMENTS) { if (a.id === 'tut_all') a.goal = Tutorial.LIST.length; if (a.id === 'tut_man') a.goal = Tutorial.LIST.filter(x => x.cat === 'man').length; } p.stats.tutorials = Tutorial.LIST.filter(x => t[x.id]).length; p.stats.maneuverTuts = Tutorial.LIST.filter(x => x.cat === 'man' && t[x.id]).length; }
  }
  // unlocking pays the achievement's reward (coins and XP); achievements unlocked before rewards existed are paid once
  function pay(a) { if (p.achPaid[a.id]) return; const r = ACH_REWARD[a.tier || 1]; p.coins += r.coins; p.xp += r.xp; p.totalXp += r.xp; p.achPaid[a.id] = Date.now(); }
  function checkAchievements() {
    derived(); const got = [];
    for (const a of ACHIEVEMENTS) if (!p.ach[a.id] && (p.stats[a.stat] || 0) >= a.goal) { p.ach[a.id] = Date.now(); got.push(a); }
    for (const a of ACHIEVEMENTS) if (p.ach[a.id]) pay(a);
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
    // K/D and win rate are multiplayer only (against bots they would say little); singleplayer is counted on its own
    if (r.online) { bump('mpBattles', 1); bump('mpKills', r.kills); bump('mpDeaths', r.deaths); if (r.won) bump('mpWins', 1); }
    else if (!r.left || r.minutes > 1) { bump('spBattles', 1); bump('spKills', r.kills); bump('spDeaths', r.deaths); if (r.won) bump('spWins', 1); }
    bump('evadedIR', r.evadedIR || 0); bump('evadedRadar', r.evadedRadar || 0); bump('bombKg', Math.round(r.bombKg || 0));
    if (r.oldSchool) bump('oldSchool', 1); if (r.size === 'massive' && !r.left) bump('massiveBattles', 1);
    if (r.won && r.night) bump('nightWins', 1); if (r.won && r.weather === 'storm') bump('stormWins', 1);
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
    buyBelt, hasBelt, selectBelt, buyStore, setWeaponKey, setStation, setSlot, buyLivery, setLivery, loadoutMass, buyUpgrade, toggleUpgrade, upgradesFor, loadoutFor,
    bump, checkAchievements, progress, rewards, applyBattle, tutorialDone, myCard, shareCards, mergeCards, elo, rateBattle,
  };
})();
