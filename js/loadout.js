// ============================================================================
// Per-pylon loadouts. An aircraft's hardpoint groups (planes.js: hp = [name, kinds, max kg per pylon, pylons]) are
// expanded into individual slots laid out by their real position: the centreline in the middle, fuselage stations
// next to it, then the wing pylons inboard to outboard and the wingtip rails outermost; pairs become a left and a
// right slot. Internal bomb bays stay one slot (a bay is loaded as a set). A loadout is one store id (or null) per
// slot, in this order. Used by the hangar diagram, the aircraft (craft.js), bots and the network.
// ============================================================================
const Loadout = (() => {
  const cache = {};
  // lateral band of a hardpoint group: 0 centre, 1 fuselage, 2 inner wing, 3 mid wing, 4 outer wing, 5 wingtip
  function band(name, count) {
    const n = name.toLowerCase();
    if (/bay|bays/.test(n)) return { band: 0, bay: true };
    if (count === 1) return { band: 0 };
    if (/tip/.test(n)) return { band: 5 };
    if (/outer/.test(n)) return { band: 4 };
    if (/mid/.test(n)) return { band: 3 };
    if (/centre|center|belly|fuselage|well|sparrow|cft|intake|nose|side/.test(n)) return { band: 1 };
    return { band: 2 }; // inner / glove / stub / wing racks / wing pylons / rails / struts / nacelles
  }
  function slots(pl) {
    if (cache[pl.id]) return cache[pl.id];
    const groups = pl.hp.map((h, g) => Object.assign({ g, name: h[0], kinds: h[1], maxKg: h[2], count: h[3] }, band(h[0], h[3])));
    groups.sort((a, b) => a.band - b.band || a.g - b.g); // stable: the aircraft's own order within a band
    const out = []; let rank = 0, wingRank = 0;
    for (const gr of groups) {
      if (gr.band === 0) { out.push({ g: gr.g, name: gr.name, kinds: gr.kinds, maxKg: gr.maxKg, pylons: gr.bay ? gr.count : 1, side: 0, rank: 0, band: 0, bay: !!gr.bay, wingRank: -1 }); continue; }
      const pairs = Math.max(1, Math.floor(gr.count / 2));
      for (let p = 0; p < pairs; p++) { rank++; const wr = gr.band >= 2 ? wingRank++ : -1;
        for (const side of [-1, 1]) out.push({ g: gr.g, name: gr.name, kinds: gr.kinds, maxKg: gr.maxKg, pylons: 1, side, rank, band: gr.band, bay: false, wingRank: wr }); }
    }
    out.forEach((s, i) => { s.i = i; });
    const wingRanks = Math.max(1, wingRank);
    for (const s of out) s.span = s.band === 5 ? 0.98 : s.wingRank >= 0 ? Math.min(0.9, 0.24 + 0.62 * s.wingRank / Math.max(1, wingRanks - (out.some(q => q.band === 5) ? 1 : 0))) : 0;
    // the mirror of each slot (same rank, other side) for symmetric loading and paired release
    for (const s of out) s.mirror = s.side ? out.findIndex(q => q.rank === s.rank && q.side === -s.side) : -1;
    return (cache[pl.id] = out);
  }
  // stores as one id per slot. perSlot false: an older loadout with one store per hardpoint group, spread over its slots
  function normalise(pl, stores, perSlot) {
    const sl = slots(pl);
    if (perSlot && Array.isArray(stores) && stores.length === sl.length) return stores.map(x => x || null);
    if (!perSlot && Array.isArray(stores) && stores.length === pl.hp.length) return sl.map(s => stores[s.g] || null);
    return sl.map(() => null);
  }
  // the stores a match flies with: lo is { stores, perSlot } from Profile.loadoutFor / a bot / the network
  const of = (pl, lo) => normalise(pl, lo && lo.stores, lo && lo.perSlot);
  const allowed = (pl, s, id) => !!id && storeAllowed(pl, id, [s.name, s.kinds, s.maxKg, s.pylons]);
  function mass(pl, stores) { const sl = slots(pl); let kg = 0; stores.forEach((id, i) => { if (id && STORES[id] && sl[i]) kg += STORES[id].mass * sl[i].pylons; }); return kg; }
  // where the store of a slot hangs, in aircraft coordinates
  function position(pl, s, k, mk) {
    const lay = Models.layout(pl), r = mk ? mk.userData.r : 0.2, len = mk ? mk.userData.len : 2;
    if (s.band === 0) return { x: 0, y: -lay.fr - r - 0.15, z: lay.wingZ - lay.chord * 0.2 + k * Math.max(1.5, len * 1.1), wing: false };
    if (s.band === 1) return { x: s.side * lay.fr * 0.6, y: -lay.fr * 0.75 - r - 0.1, z: lay.wingZ - lay.chord * 0.15 + (s.rank - 1) * Math.max(1.2, len * 0.9), wing: false };
    const f = s.span; return { x: s.side * (lay.fr * 0.5 + (lay.S / 2 - lay.fr * 0.5) * f), y: f > 0.95 ? lay.wingY : lay.wingY - 0.18 - r - (lay.jet ? 0.1 : 0.05), z: lay.wingZ + lay.sweep * f - (lay.chord * (1 - f) + lay.tipC * f) * 0.1, wing: true, tip: f > 0.95 };
  }
  return { slots, normalise, of, allowed, mass, position };
})();
