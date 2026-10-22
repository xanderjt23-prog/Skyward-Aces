// ============================================================================
// Menus and battle overlays.
// ============================================================================
const UI = (() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString();
  let panel = null, hangarNation = null, hangarSel = null, researchNation = null, modsPlane = null, modsTab = 'ammo';
  const play = { step: 'type', sp: true, mode: 'destroy', settings: defaults('destroy') };
  let lobby = null; // multiplayer lobby state
  function defaults(mode) {
    return { destroy: { mode, teamSize: [12, 12], time: 600, map: '', fill: true }, dogfight: { mode, teamSize: [4, 4], respawns: 3, time: 900, map: '', fill: true },
      missions: { mode, mission: null, fill: true }, survival: { mode, respawns: 3, time: 0, map: '', fill: true } }[mode];
  }
  const P = () => Profile.get();
  // national flags as small inline SVGs (flag emoji don't render on Windows)
  let flagN = 0;
  function flag(n) {
    const box = inner => `<svg class="flag" viewBox="0 0 60 40" width="24" height="16" aria-label="${NATIONS[n].name} flag">${inner}</svg>`;
    if (n === 'usa') {
      let st = ''; for (let i = 0; i < 13; i++) st += `<rect y="${i * 40 / 13}" width="60" height="${40 / 13 + 0.05}" fill="${i % 2 ? '#fff' : '#b22234'}"/>`;
      let stars = ''; for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) stars += `<circle cx="${2.5 + c * 4.4 + (r % 2) * 2.2}" cy="${2.4 + r * 4.2}" r="0.9" fill="#fff"/>`;
      return box(st + `<rect width="26" height="21.5" fill="#3c3b6e"/>` + stars);
    }
    if (n === 'ger') return box('<rect width="60" height="13.4" fill="#000"/><rect y="13.3" width="60" height="13.4" fill="#dd0000"/><rect y="26.6" width="60" height="13.4" fill="#ffce00"/>');
    if (n === 'uk') { const id = 'uj' + (++flagN);
      return box(`<clipPath id="${id}"><path d="M30,20 h30 v20 z v20 h-30 z h-30 v-20 z v-20 h30 z"/></clipPath><rect width="60" height="40" fill="#012169"/><path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" stroke-width="8"/><path d="M0,0 L60,40 M60,0 L0,40" clip-path="url(#${id})" stroke="#c8102e" stroke-width="4"/><path d="M30,0 v40 M0,20 h60" stroke="#fff" stroke-width="12"/><path d="M30,0 v40 M0,20 h60" stroke="#c8102e" stroke-width="7"/>`); }
    if (n === 'ussr') return box('<rect width="60" height="40" fill="#cc0000"/><path d="M10,3 l1.2,3.6 h3.8 l-3.1,2.2 1.2,3.6 -3.1,-2.2 -3.1,2.2 1.2,-3.6 -3.1,-2.2 h3.8 z" fill="none" stroke="#ffd700" stroke-width="0.8"/><path d="M7,22 l7,-7 m-3,-1 l4,4" stroke="#ffd700" stroke-width="1.8" stroke-linecap="round"/><path d="M6.5,17 a6,6 0 1 0 9,-3" fill="none" stroke="#ffd700" stroke-width="1.6"/>');
    if (n === 'jpn') return box('<rect width="60" height="40" fill="#fff"/><circle cx="30" cy="20" r="12" fill="#bc002d"/>');
    if (n === 'fra') return box('<rect width="20" height="40" fill="#0055a4"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ef4135"/>');
    return '';
  }
  const an = w => (/^[AEIOU]/i.test(w) ? 'an ' : 'a ') + w;
  const cur = () => PLANES[P().selected];

  function init() {
    Game.init(); HUD.init();
    $$('#mainmenu button').forEach(b => b.onclick = () => open(b.dataset.panel));
    $('#panel-close').onclick = close; $('#tb-profile').onclick = () => open('profile');
    $('#pause-resume').onclick = () => { Game.requestLock(); };
    $('#pause-leave').onclick = () => { $('#pause').classList.add('hidden'); Game.leave(); };
    Net.on('message', onNet); Net.on('join', () => {}); Net.on('leave', onLeave); Net.on('closed', onClosed); Net.on('error', e => { toastMenu(e); if (lobby && !lobby.started) { lobby = null; play.step = 'mp'; if (panel === 'play') renderPlay(); } });
    Net.on('joinFailed', e => toastMenu(e));
    refresh(); Game.showPlane(P().selected);
  }
  function refresh() {
    const p = P(), li = Profile.levelInfo();
    $('#tb-xp').textContent = fmt(p.xp); $('#tb-coins').textContent = fmt(p.coins); $('#tb-name').textContent = p.name; $('#tb-avatar').textContent = (p.name[0] || 'P').toUpperCase();
    $('#tb-level').textContent = li.level; $('#tb-lvlfill').style.width = (li.frac * 100).toFixed(1) + '%';
    $('#tb-profile').title = `${fmt(li.into)} / ${fmt(li.need)} XP to level ${li.level + 1}`;
    const pl = cur(); $('#current-plane').innerHTML = `<div class="nm">${esc(pl.name)}</div><div class="sub">${flag(pl.nation)} ${NATIONS[pl.nation].name} · ${ERAS[pl.era].name} · ${pl.year}</div>`;
  }
  function open(name) {
    panel = name; $('#panel').classList.remove('hidden');
    $('#side').classList.add('hidden'); $('#panel').classList.remove('narrow'); Game.menuView = 'default';
    $$('#mainmenu button').forEach(b => b.classList.toggle('sel', b.dataset.panel === name));
    ({ play: renderPlay, hangar: renderHangar, achievements: renderAch, mods: renderMods, research: renderResearch, profile: renderProfile, board: renderBoard })[name]();
  }
  function close() { panel = null; $('#panel').classList.add('hidden'); $('#side').classList.add('hidden'); $('#panel').classList.remove('narrow'); Game.menuView = 'default'; $$('#mainmenu button').forEach(b => b.classList.remove('sel')); Game.showPlane(P().selected); }
  const body = html => { $('#panel-body').innerHTML = html; };
  function toastMenu(t) { const el = $('#toast'); el.textContent = t; el.style.opacity = 1; el.style.zIndex = 30; clearTimeout(toastMenu.t); toastMenu.t = setTimeout(() => el.style.opacity = 0, 3500); }

  // ---------------------------------------------------------------- stats text
  function planeStats(pl) {
    const guns = pl.guns.map(([g, n]) => `${n}× ${GUNS[g].name}`).join('<br>') || '—';
    const tur = pl.turrets.map(([g, n, arc]) => `${n}× ${GUNS[g].name} (${arc})`).join('<br>');
    const hp = pl.hp.map(st => `${esc(st[0])}: ${st[3]}× ${st[1].split('').map(k => KIND_NAMES[k]).join('/')} ≤${st[2]} kg`).join('<br>') || 'None';
    const eng = `${pl.eng}× ${pl.kind === 'jet' ? (pl.ab ? 'turbojet with afterburner' : 'turbojet') : 'piston'}`;
    const rows = [['Type', esc(pl.type)], ['Era', `${ERAS[pl.era].name} (${pl.year})`], ['Top speed', `${pl.spd} km/h`], ['Climb rate', `${pl.clb} m/s`], ['Turn time', `${pl.turn} s`], ['Roll rate', `${pl.roll} °/s`],
      ['G limit', `${pl.g} G`], ['Weight', `${fmt(pl.mass)} kg`], ['Span / length', `${pl.span} / ${pl.len} m`], ['Engines', eng], ['Crew', pl.crew.join(', ')], ['Guns', guns]];
    if (tur) rows.push(['Defensive guns', tur]);
    rows.push(['Hardpoints', hp], ['Max payload', `${fmt(pl.payload)} kg`]);
    if (pl.radar) rows.push(['Radar', 'Yes']); if (pl.flares) rows.push(['Countermeasures', `${pl.flares} flares`]);
    return rows.map(([a, b]) => `<div class="stat"><span>${a}</span><span style="text-align:right">${b}</span></div>`).join('');
  }
  function nationTabs(sel, cb) { return `<div class="tabs">${NATION_ORDER.map(n => `<button class="tab ${n === sel ? 'sel' : ''}" data-nat="${n}">${flag(n)} ${NATIONS[n].name}</button>`).join('')}</div>`; }
  function bindTabs(cb) { $$('[data-nat]').forEach(b => b.onclick = () => cb(b.dataset.nat)); }

  // ---------------------------------------------------------------- hangar
  // real photographs (Wikimedia Commons, js/photocredits.js): the image with its credit, or null when there is none
  const photoOf = (kind, id) => (typeof PHOTO_CREDITS !== 'undefined' && PHOTO_CREDITS[kind + '/' + id]) || null;
  const credit = c => `Photo: ${String(c.author).replace(/^(.+?)\1$/, '$1')} · ${c.licence} · Wikimedia Commons`;
  const photoTag = (kind, id, cls) => { const c = photoOf(kind, id); return c ? `<img class="${cls || 'photo'}" src="${c.src}" loading="lazy" alt="" title="${esc(credit(c))}">` : ''; };
  function renderHangar() {
    hangarNation = hangarNation || cur().nation; const p = P();
    if (!hangarSel || PLANES[hangarSel].nation !== hangarNation) hangarSel = PLANES[p.selected].nation === hangarNation ? p.selected : planesOf(hangarNation)[0].id;
    let h = `<h2>Hangar</h2>${nationTabs(hangarNation)}<div>`;
    for (let e = 1; e <= MAX_ERA; e++) {
      const list = planesOf(hangarNation).filter(x => x.era === e); if (!list.length) continue;
      h += `<div class="era-sec"><div class="era-h">${ERAS[e].name} <small>${ERAS[e].years}</small></div><div class="planes">`;
      for (const pl of list) { const owned = p.owned[pl.id], flying = p.selected === pl.id;
        h += `<div class="pc ${owned ? 'owned' : 'locked'} ${flying ? 'flying' : ''} ${hangarSel === pl.id ? 'sel' : ''}" data-pid="${pl.id}"><div class="n" title="${esc(pl.name)}">${esc(pl.short)}</div>${photoTag('planes', pl.id, 'thumb photo') || Thumbs.tag(pl.id)}<div class="ty">${esc(pl.type)}</div><div class="y">${pl.year} · ${pl.spd} km/h</div><span class="badge">${flying ? 'Flying' : owned ? 'Owned' : 'Locked'}</span></div>`; }
      h += `</div></div>`;
    }
    const pl = PLANES[hangarSel], owned = p.owned[pl.id];
    h += `</div>`;
    const ph = photoOf('planes', pl.id);
    let side = `<div class="card"><h3>${esc(pl.name)}</h3>${ph ? `<img class="side-photo" src="${ph.src}" alt=""><div class="credit"><a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(credit(ph))}</a></div>` : ''}<p class="muted small">${esc(pl.desc || '')}</p>${planeStats(pl)}<div class="row" style="margin-top:12px">`;
    side += owned ? (p.selected === pl.id ? `<button disabled>Selected</button>` : `<button class="primary" id="h-select">Fly this aircraft</button>`) + ` <button id="h-mods">Modifications</button>` : `<button id="h-research">Research (${fmt(pl.cost)} XP)</button>`;
    side += `</div></div>`;
    $('#side').innerHTML = side; $('#side').classList.remove('hidden'); $('#panel').classList.add('narrow'); Game.menuView = 'side';
    body(h); Thumbs.fill($('#panel-body')); bindTabs(n => { hangarNation = n; hangarSel = null; renderHangar(); });
    $$('[data-pid]').forEach(el => el.onclick = () => { hangarSel = el.dataset.pid; Game.showPlane(hangarSel); renderHangar(); });
    if ($('#h-select')) $('#h-select').onclick = () => { p.selected = pl.id; Profile.save(); refresh(); renderHangar(); };
    if ($('#h-mods')) $('#h-mods').onclick = () => { modsPlane = pl.id; open('mods'); };
    if ($('#h-research')) $('#h-research').onclick = () => { researchNation = pl.nation; open('research'); };
    Game.showPlane(hangarSel);
  }
  // ---------------------------------------------------------------- research
  function renderResearch() {
    researchNation = researchNation || cur().nation; const p = P(), me = Profile.maxEra(researchNation);
    let h = `<h2>Research</h2><p class="muted">Spend XP on new aircraft. Spending XP never lowers your level. In each nation you can research aircraft up to <b>one era above</b> the newest era you own there.</p>${nationTabs(researchNation)}`;
    h += `<div class="row" style="margin-bottom:12px"><span class="pill">Available XP: <b>${fmt(p.xp)}</b></span><span class="pill">Newest ${NATIONS[researchNation].name} era owned: <b>${me ? ERAS[me].name : '—'}</b></span></div>`;
    for (let e = 1; e <= MAX_ERA; e++) {
      const list = planesOf(researchNation).filter(x => x.era === e); if (!list.length) continue;
      const reach = e <= me + 1;
      h += `<div class="era-sec"><div class="era-h">${ERAS[e].name} <small>${ERAS[e].years}${reach ? '' : ' · locked: own ' + an(ERAS[e - 1].name) + ' aircraft of this nation first'}</small></div><div class="planes">`;
      for (const pl of list) {
        const owned = p.owned[pl.id], c = Profile.canResearch(pl.id);
        h += `<div class="pc ${owned ? 'owned' : reach ? '' : 'locked'}" data-rid="${pl.id}"><div class="n" title="${esc(pl.name)}">${esc(pl.short)}</div>${Thumbs.tag(pl.id)}<div class="ty">${esc(pl.type)}</div><div class="y">${pl.year} · ${owned ? 'Owned' : fmt(pl.cost) + ' XP'}</div>
          <div style="margin-top:8px">${owned ? '<span class="pill ok">Owned</span>' : c.ok ? `<button class="primary" data-buy="${pl.id}">Research</button>` : `<span class="small muted">${esc(c.why)}</span>`}</div></div>`;
      }
      h += `</div></div>`;
    }
    body(h); Thumbs.fill($('#panel-body')); bindTabs(n => { researchNation = n; renderResearch(); });
    $$('[data-rid]').forEach(el => el.onclick = e => { if (e.target.dataset.buy) return; Game.showPlane(el.dataset.rid); });
    $$('[data-buy]').forEach(b => b.onclick = () => { const r = Profile.research(b.dataset.buy); if (r.ok) { Profile.checkAchievements(); toastMenu(`${PLANES[b.dataset.buy].name} researched!`); refresh(); renderResearch(); } else toastMenu(r.why); });
  }
  // ---------------------------------------------------------------- modifications
  // ---- pylon diagram (War Thunder style): the aircraft from above, one box per pylon from the left wingtip to the right one,
  // the centreline in the middle. Click a box, then pick what hangs on it.
  let loSel = null, loMirror = true;
  const KIND_ICON = { b: '💣', r: '🚀', m: '🎯', g: '🔫' };
  function pylonOrder(pl) { return Loadout.slots(pl).slice().sort((a, b) => a.side * a.rank - b.side * b.rank || a.i - b.i); }
  function pylonDiagram(pl, m) {
    const order = pylonOrder(pl), n = order.length, W = 100 / n;
    // a schematic top view: the boxes sit under the wing positions they stand for
    let h = `<div class="pylons"><svg class="pylon-plane" viewBox="0 0 100 34" preserveAspectRatio="none"><path d="M50 1 L52.4 9 L52.4 13 L97 19 L97 22 L52.4 21 L51.6 30 L58 33 L42 33 L48.4 30 L47.6 21 L3 22 L3 19 L47.6 13 L47.6 9 Z" /></svg><div class="pylon-row">`;
    order.forEach((s, k) => { const id = m.slots[s.i], st = id && STORES[id], num = k + 1;
      h += `<div class="pylon ${loSel === s.i ? 'sel' : ''} ${st ? 'full' : ''}" data-slot="${s.i}" style="width:${W}%" title="${esc(s.name)}">
        <div class="pn">${num}</div><div class="pk">${s.kinds.split('').map(x => KIND_ICON[x]).join('')}</div>
        <div class="ps">${st ? esc(shortStore(st)) : '—'}</div><div class="pm">${st ? fmt(st.mass * s.pylons) + ' kg' : '≤' + fmt(s.maxKg) + ' kg'}</div>
        <div class="pg">${esc(s.bay ? s.name + ' ×' + s.pylons : s.name)}</div></div>`; });
    return h + `</div></div>`;
  }
  const shortStore = st => st.name.replace(/ \(.*\)$/, '').replace(/^(Bomb|bomb) /, '');
  function pylonPicker(pl, m) {
    const sl = Loadout.slots(pl), s = loSel != null ? sl[loSel] : null;
    if (!s) return `<p class="muted small" style="margin-top:8px">Click a pylon to choose what it carries.</p>`;
    const num = pylonOrder(pl).indexOf(s) + 1, opts = Object.keys(STORES).filter(id => Loadout.allowed(pl, s, id)), cur = m.slots[s.i];
    let h = `<div class="picker"><div class="row sp"><b>Pylon ${num} — ${esc(s.name)}${s.bay ? ' (internal, ' + s.pylons + ' stations)' : ''}</b>
      ${s.mirror >= 0 ? `<label class="small"><input type="checkbox" id="lo-mirror" ${loMirror ? 'checked' : ''}> Same on the other wing (pylon ${pylonOrder(pl).indexOf(sl[s.mirror]) + 1})</label>` : ''}</div>
      <div class="small muted">Carries ${s.kinds.split('').map(k => KIND_NAMES[k].toLowerCase()).join(', ')} · up to ${fmt(s.maxKg)} kg${s.bay ? ' per station' : ''}</div><div class="pick-list">
      <button data-fit="" class="${!cur ? 'sel' : ''}">— Empty —</button>`;
    for (const id of opts) { const st = STORES[id], own = m.stores[id];
      h += own ? `<button data-fit="${id}" class="${cur === id ? 'sel' : ''}">${KIND_ICON[st.kind]} ${esc(st.name)} <span class="muted">${fmt(st.mass * s.pylons)} kg</span></button>`
        : `<button data-buystore="${id}" class="ghost">${KIND_ICON[st.kind]} ${esc(st.name)} <span class="muted">· buy ◎${fmt(st.price)}</span></button>`; }
    return h + `</div><div class="row" style="margin-top:8px"><button id="lo-clear">Empty every pylon</button></div></div>`;
  }
  let keyPick = null; // the weapon picked in Modifications -> Weapon keys, waiting for its key
  function renderMods() {
    const p = P(); modsPlane = modsPlane && p.owned[modsPlane] ? modsPlane : p.selected;
    const pl = PLANES[modsPlane], m = Profile.modsOf(pl.id);
    let h = `<h2>Modifications</h2><div class="row" style="margin-bottom:12px"><select id="mods-plane">${Object.keys(p.owned).map(id => PLANES[id]).filter(Boolean).sort((a, b) => a.nation.localeCompare(b.nation) || a.era - b.era).map(x => `<option value="${x.id}" ${x.id === pl.id ? 'selected' : ''}>${esc(x.name)} (${ERAS[x.era].name})</option>`).join('')}</select>
      <span class="pill">Coins: <b>${fmt(p.coins)}</b></span></div>
      <div class="tabs">${[['ammo', 'Gun ammunition'], ['loadout', 'Ordnance & loadout'], ['upg', 'Airframe upgrades'], ['paint', 'Paint schemes']].map(([k, n]) => `<button class="tab ${modsTab === k ? 'sel' : ''}" data-mt="${k}">${n}</button>`).join('')}</div>`;
    if (modsTab === 'ammo') {
      if (pl.guns.some(g => g[2] === 'wing')) { const cv = Craft.convOf(pl, { conv: m.conv });
        h += `<div class="card" style="margin-bottom:10px"><h3>Gun convergence: <span id="conv-v">${cv}</span> m</h3><p class="small muted">The wing guns are angled in so their fire meets at this distance; closer than that the streams pass either side of the target, much further and they have crossed. Pilots set it to suit their tactics: Allied fighters often 230-370 m (250-400 yd), aces closer.</p><input type="range" id="conv" min="150" max="800" step="10" value="${cv}"></div>`; }
      for (const gid of Profile.gunsOf(pl)) {
        const sel = Profile.loadoutFor(pl.id).belts[gid];
        h += `<div class="card" style="margin-bottom:10px"><h3>${GUNS[gid].name}</h3>`;
        for (const b of beltsForGun(gid, pl.era)) {
          const own = Profile.hasBelt(pl.id, gid, b), price = beltPrice(b, pl.era);
          h += `<div class="shop-item"><div><b>${BELTS[b].name}</b> <div class="d">${BELTS[b].desc}</div></div><div>${sel === b ? '<span class="pill ok">Equipped</span>' : own ? `<button data-belt="${gid}|${b}">Equip</button>` : `<button class="primary" data-buybelt="${gid}|${b}">Buy ◎${fmt(price)}</button>`}</div></div>`;
        }
        h += `</div>`;
      }
      if (!pl.guns.length) h += `<p class="muted">This aircraft has no forward guns.</p>`;
    } else if (modsTab === 'loadout') {
      const kg = Profile.loadoutMass(pl.id), sl = Loadout.slots(pl);
      h += `<div class="card" style="margin-bottom:12px"><div class="row sp"><h3 style="margin:0">Loadout</h3><span>Payload <b>${fmt(kg)}</b> / ${fmt(pl.payload)} kg</span></div><div class="bar"><i style="width:${pl.payload ? Math.min(100, kg / pl.payload * 100) : 0}%"></i></div>`;
      if (!sl.length) h += `<p class="muted">This aircraft has no hardpoints: it cannot carry bombs, rockets, missiles or gun pods.</p>`;
      else h += pylonDiagram(pl, m);
      if (sl.length) h += pylonPicker(pl, m);
      // weapon keys: click a weapon, then the key to fire it with
      if (sl.length) {
        const fake = { stations: Loadout.of(pl, { stores: m.slots, perSlot: true }).map((id, i) => id && { id, s: STORES[id] }).filter(Boolean), lo: { keys: m.keys || {} } };
        const slots = Craft.prototype.weaponSlots.call(fake);
        const used = [...new Set(fake.stations.map(s => s.id))].filter(id => STORES[id].kind !== 'g');
        h += `<div class="card" style="margin-top:10px"><h3 style="margin-top:0">Weapon keys</h3>${used.length ? `<p class="small muted">Click a weapon, then the key you want to fire it with.</p>
          <div class="row">${used.map(id => `<button class="${keyPick === id ? 'primary' : ''}" data-kw="${id}">${esc(STORES[id].name)}</button>`).join('')}</div>
          <div class="row" style="margin-top:8px">${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<button class="keycap ${keyPick ? 'click' : ''}" data-kk="${k}"><kbd>${esc(Input.label(Input.bind('weapon' + (k + 1))))}</kbd><span class="small">${slots[k] ? esc(STORES[slots[k]].name.replace(/ \(.*\)$/, '')) : '—'}</span></button>`).join('')}</div>`
          : '<p class="small muted">Fit some weapons above, then choose their keys here.</p>'}</div>`;
      }
      h += `</div><h3>Ordnance for this aircraft</h3><p class="muted small">Only weapons that fit this aircraft's hardpoints, era and nation are listed. Buy them once, then fit them above.</p>`;
      const avail = storesFor(pl);
      for (const k of ['b', 'r', 'm', 'g']) {
        const l = avail.filter(id => STORES[id].kind === k); if (!l.length) continue;
        h += `<div class="card" style="margin-bottom:10px"><h3>${KIND_NAMES[k]}</h3>`;
        for (const id of l) { const s = STORES[id]; let d = `${s.mass} kg`;
          if (k === 'b') d += ` · blast ${s.rad} m${s.guided ? ' · laser guided' : ''}`; if (k === 'r') d += ` · ${s.count} rockets`;
          if (k === 'm') d += ` · ${s.seek === 'ir' ? 'infrared' + (s.rear ? ', rear aspect' : ', all aspect') : s.seek === 'sarh' ? 'semi-active radar' : 'active radar'} · ${(s.range / 1000).toFixed(1)} km · ${s.g} G`;
          if (k === 'g') d += ` · ${s.guns}× ${GUNS[s.gun].name}`;
          h += `<div class="shop-item">${photoTag('stores', id, 'store-photo') || '<span class="store-photo none"></span>'}<div style="flex:1"><b>${esc(s.name)}</b><div class="d">${d}</div></div><div>${m.stores[id] ? '<span class="pill ok">Owned</span>' : `<button class="primary" data-buystore="${id}">Buy ◎${fmt(s.price)}</button>`}</div></div>`; }
        h += `</div>`;
      }
      if (!avail.length && pl.hp.length) h += `<p class="muted">No ordnance of this era fits.</p>`;
    } else if (modsTab === 'paint') {
      const list = liveriesFor(pl.id), price = liveryPrice(pl), sw = cs => cs.map(c => `<i style="display:inline-block;width:16px;height:16px;border-radius:3px;margin-right:3px;border:1px solid rgba(0,0,0,0.4);background:#${c.toString(16).padStart(6, '0')}"></i>`).join('');
      h += `<p class="muted">Paint schemes this aircraft really wore in service. Buy a scheme once, then switch freely; other players see it too.</p>`;
      h += `<div class="shop-item"><div><b>Standard scheme</b><div class="d">The aircraft's usual camouflage.</div></div><div>${!m.livery ? '<span class="pill ok">Applied</span>' : '<button data-livery="">Apply</button>'}</div></div>`;
      for (const l of list) { const own = m.liveries[l.id];
        h += `<div class="shop-item"><div><div class="row">${sw(l.pattern ? [l.top].concat(l.c) : [l.top, l.bot])}<b>${esc(l.name)}</b></div><div class="d">${esc(l.desc)}</div></div><div>${m.livery === l.id ? '<span class="pill ok">Applied</span>' : own ? `<button data-livery="${l.id}">Apply</button>` : `<button class="primary" data-buylivery="${l.id}">Buy ◎${fmt(price)}</button>`}</div></div>`; }
      if (!list.length) h += `<p class="muted">No alternative schemes are recorded for this aircraft yet.</p>`;
    } else {
      for (const k of Profile.upgradesFor(pl)) {
        const mo = MODS[k], own = m.upg[k], on = m.inst[k];
        h += `<div class="shop-item"><div><b>${mo.name}</b><div class="d">${mo.desc}</div></div><div>${own ? `<button data-toggle="${k}" class="${on ? 'sel' : ''}">${on ? 'Installed — remove' : 'Removed — install'}</button>` : `<button class="primary" data-buyupg="${k}">Buy ◎${fmt(mo.price(pl.era))}</button>`}</div></div>`;
      }
    }
    body(h);
    $('#mods-plane').onchange = e => { modsPlane = e.target.value; loSel = null; Game.showPlane(modsPlane); renderMods(); };
    $$('[data-mt]').forEach(b => b.onclick = () => { modsTab = b.dataset.mt; renderMods(); });
    const after = ok => { if (!ok) toastMenu('Not enough coins'); Profile.checkAchievements(); refresh(); renderMods(); };
    $$('[data-buybelt]').forEach(b => b.onclick = () => { const [g, k] = b.dataset.buybelt.split('|'); after(Profile.buyBelt(pl.id, g, k)); });
    $$('[data-belt]').forEach(b => b.onclick = () => { const [g, k] = b.dataset.belt.split('|'); Profile.selectBelt(pl.id, g, k); renderMods(); });
    if ($('#conv')) { $('#conv').oninput = e => { $('#conv-v').textContent = e.target.value; }; $('#conv').onchange = e => { Profile.modsOf(pl.id).conv = +e.target.value; Profile.save(); }; }
    $$('[data-buystore]').forEach(b => b.onclick = () => after(Profile.buyStore(pl.id, b.dataset.buystore)));
    $$('[data-kw]').forEach(b => b.onclick = () => { keyPick = keyPick === b.dataset.kw ? null : b.dataset.kw; renderMods(); });
    $$('[data-kk]').forEach(b => b.onclick = () => { if (!keyPick) return toastMenu('Click a weapon first'); Profile.setWeaponKey(pl.id, keyPick, +b.dataset.kk); keyPick = null; renderMods(); });
    $$('[data-buyupg]').forEach(b => b.onclick = () => after(Profile.buyUpgrade(pl.id, b.dataset.buyupg)));
    $$('[data-buylivery]').forEach(b => b.onclick = () => after(Profile.buyLivery(pl.id, b.dataset.buylivery)));
    $$('[data-livery]').forEach(b => b.onclick = () => { Profile.setLivery(pl.id, b.dataset.livery || null); renderMods(); });
    $$('[data-toggle]').forEach(b => b.onclick = () => { Profile.toggleUpgrade(pl.id, b.dataset.toggle); renderMods(); });
    $$('[data-slot]').forEach(b => b.onclick = () => { loSel = +b.dataset.slot; renderMods(); });
    $$('[data-fit]').forEach(b => b.onclick = () => { const r = Profile.setSlot(pl.id, loSel, b.dataset.fit || null, loMirror); if (!r.ok) toastMenu(r.why); renderMods(); });
    const mi = $('#lo-mirror'); if (mi) mi.onchange = e => { loMirror = e.target.checked; };
    const lc = $('#lo-clear'); if (lc) lc.onclick = () => { for (const s of Loadout.slots(pl)) Profile.setSlot(pl.id, s.i, null, false); renderMods(); };
    Game.showPlane(pl.id);
  }
  // ---------------------------------------------------------------- achievements & profile
  function renderAch() {
    const p = P(); const done = ACHIEVEMENTS.filter(a => p.ach[a.id]).length;
    let h = `<h2>Achievements</h2><p class="muted">${done} / ${ACHIEVEMENTS.length} unlocked</p><div class="grid c2">`;
    for (const a of ACHIEVEMENTS) { const pr = Profile.progress(a), got = !!p.ach[a.id], val = Math.min(a.goal, Math.floor(p.stats[a.stat] || 0));
      h += `<div class="card ach ${got ? 'done' : ''}"><div class="ic">${a.icon}</div><div style="flex:1"><div class="t">${a.name}</div><div class="small muted">${a.desc}</div><div class="bar"><i style="width:${pr * 100}%"></i></div><div class="small muted">${got ? 'Unlocked ' + new Date(p.ach[a.id]).toLocaleDateString() : fmt(val) + ' / ' + fmt(a.goal)} · reward ${fmt(ACH_REWARD[a.tier || 1].coins)} coins, ${fmt(ACH_REWARD[a.tier || 1].xp)} XP</div></div></div>`; }
    body(h + '</div>');
  }
  // ---- leaderboard: you and every pilot whose card reached you through multiplayer lobbies (no server needed)
  let boardSort = 'elo';
  function renderBoard() {
    const p = P(), me = Object.assign(Profile.myCard(), { you: true }), rows = Object.values(p.board || {}).concat([me]);
    const kd = r => r.mpKills / Math.max(1, r.mpDeaths), wr = r => r.mpBattles ? r.mpWins / r.mpBattles : 0;
    const key = { elo: r => r.eloGames ? r.elo : -1, mpWins: r => r.mpWins, mpKills: r => r.mpKills, kd: r => r.mpBattles >= 5 ? kd(r) : -1, wr: r => r.mpBattles >= 5 ? wr(r) : -1, level: r => r.level }[boardSort];
    rows.sort((a, b) => key(b) - key(a) || b.level - a.level);
    const opts = [['elo', 'Elo rating'], ['mpWins', 'Multiplayer wins'], ['mpKills', 'Multiplayer kills'], ['kd', 'K/D (5+ battles)'], ['wr', 'Win rate (5+ battles)'], ['level', 'Level']];
    body(`<h2>Leaderboard</h2>
      <div class="row" style="margin-bottom:10px"><label class="small">Rank by</label><select id="lb-sort">${opts.map(([k, n]) => `<option value="${k}" ${k === boardSort ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="small muted">${rows.length - 1} other pilot${rows.length === 2 ? '' : 's'} known</span></div>
      <table class="board"><tr><th>#</th><th>Pilot</th><th>Elo</th><th>Level</th><th>Battles</th><th>Wins</th><th>Win rate</th><th>Kills</th><th>K/D</th><th></th></tr>
      ${rows.map((r, i) => `<tr class="${r.you ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${r.you ? ' <span class="pill">you</span>' : ''}</td><td><b>${r.eloGames ? r.elo : '—'}</b>${r.eloGames && r.eloGames < 10 ? '<span class="small muted"> (prov.)</span>' : ''}</td><td>${r.level}</td><td>${fmt(r.mpBattles)}</td><td>${fmt(r.mpWins)}</td><td>${r.mpBattles ? Math.round(wr(r) * 100) + '%' : '—'}</td><td>${fmt(r.mpKills)}</td><td>${r.mpBattles ? kd(r).toFixed(2) : '—'}</td>
        <td class="small muted">${r.you ? '' : r.met ? 'met ' + new Date(r.met).toLocaleDateString() : 'via other pilots'}</td></tr>`).join('')}</table>
      ${rows.length === 1 ? '<p class="muted" style="margin-top:12px">Nobody else yet: play a multiplayer game and the pilots you meet (and the ones they have met) appear here.</p>' : ''}`);
    $('#lb-sort').onchange = e => { boardSort = e.target.value; renderBoard(); };
  }
  function renderProfile() {
    const p = P(), s = p.stats, li = Profile.levelInfo();
    // K/D and win rate count multiplayer battles only; singleplayer has its own lines
    const kd = (s.mpKills || 0) / Math.max(1, s.mpDeaths || 0), fav = Object.entries(s.planeUse || {}).sort((a, b) => b[1] - a[1])[0];
    const rows = [['Level', li.level], ['XP to next level', `${fmt(li.into)} / ${fmt(li.need)}`], ['Total XP earned', fmt(p.totalXp)], ['Battles (all)', fmt(s.battles || 0)],
      ['Multiplayer battles', fmt(s.mpBattles || 0)], ['Multiplayer victories', fmt(s.mpWins || 0)], ['Win rate (multiplayer)', s.mpBattles ? ((s.mpWins || 0) / s.mpBattles * 100).toFixed(0) + '%' : '—'],
      ['K/D ratio (multiplayer)', s.mpBattles ? kd.toFixed(2) : '—'], ['Elo rating (multiplayer vs people)', s.eloGames ? `${Math.round(s.elo)} (peak ${Math.round(s.eloPeak || s.elo)}, ${s.eloGames} rated)` : '1000 (unrated)'], ['Multiplayer kills / deaths', `${fmt(s.mpKills || 0)} / ${fmt(s.mpDeaths || 0)}`],
      ['Singleplayer battles / victories', `${fmt(s.spBattles || 0)} / ${fmt(s.spWins || 0)}`], ['Singleplayer kills / deaths', `${fmt(s.spKills || 0)} / ${fmt(s.spDeaths || 0)}`],
      ['Aircraft shot down (all)', fmt(s.kills || 0)], ['Times shot down (all)', fmt(s.deaths || 0)], ['Missiles defeated', fmt((s.evadedIR || 0) + (s.evadedRadar || 0))], ['Bombs dropped', fmt(Math.round((s.bombKg || 0) / 1000)) + ' t'], ['Assists', fmt(s.assists || 0)], ['Bases destroyed', fmt(s.bases || 0)], ['Missions completed', fmt(s.missions || 0)],
      ['Flight time', `${Math.floor((s.flightTime || 0) / 3600)} h ${Math.floor((s.flightTime || 0) % 3600 / 60)} min`], ['Aircraft owned', Object.keys(p.owned).length], ['Favourite aircraft', fav && PLANES[fav[0]] ? PLANES[fav[0]].name : '—'], ['Achievements', `${Object.keys(p.ach).length} / ${ACHIEVEMENTS.length}`], ['Coins earned', fmt(s.coinsEarned || 0)]];
    const st = p.settings;
    body(`<h2>Pilot profile</h2><div class="split"><div class="card"><div class="field"><label>Username</label><div class="row"><input id="pf-name" maxlength="18" value="${esc(p.name)}"><button id="pf-save">Save</button></div></div>
      ${rows.map(([a, b]) => `<div class="stat"><span>${a}</span><span>${b}</span></div>`).join('')}</div>
      <div class="card"><h3>Settings</h3>
      <div class="field"><label>Mouse sensitivity: <span id="pf-sv">${st.sens.toFixed(2)}</span></label><input type="range" id="pf-sens" min="0.3" max="2.5" step="0.05" value="${st.sens}"></div>
      <div class="field"><label>Volume</label><input type="range" id="pf-vol" min="0" max="1" step="0.05" value="${st.volume}"></div>
      <div class="field"><label><input type="checkbox" id="pf-inv" ${st.invert ? 'checked' : ''}> Invert mouse Y</label></div>
      <div class="field"><label><input type="checkbox" id="pf-assist" ${st.assist !== false ? 'checked' : ''}> Gunnery assist — when your aim circle is on the red lead marker, the instructor tracks it for you</label></div>
      <div class="field"><label>Gunnery assist range: <span id="pf-arv">${Math.round((st.assistRange == null ? 1 : st.assistRange) * 100)}%</span> <span class="small muted">(100% = from 1.2 km, 0% = never)</span></label><input type="range" id="pf-arange" min="0" max="1" step="0.05" value="${st.assistRange == null ? 1 : st.assistRange}"></div>
      <div class="field"><label>Crosshair colour</label><div class="row"><input type="color" id="pf-cross" value="${st.cross || '#ffffff'}"><span class="small muted">Pick a colour that stands out against snow, sea or sky.</span></div></div>
      <h3 style="margin-top:18px">Controls</h3><p class="small muted">Mouse moves the aim circle and the aircraft follows it. Click a binding, then press a key or mouse button (Esc cancels).</p>
      <div id="binds">${Input.ACTIONS.filter(([id]) => !/^weapon\d/.test(id)).map(([id, name]) => `<div class="stat"><span>${name}</span><button class="bind" data-bind="${id}">${esc(Input.label(Input.bind(id)))}</button></div>`).join('')}</div>
      <button id="pf-binds-reset" style="margin-top:8px">Reset controls to defaults</button><br>
      <button class="danger" id="pf-reset" style="margin-top:18px">Reset all progress</button></div></div>
      <div class="card" style="margin-top:14px"><h3>Photo credits</h3><p class="small muted">The aircraft and weapon photographs are the lead images of their Wikipedia articles, from Wikimedia Commons.</p>
      <details><summary class="small">Show all ${typeof PHOTO_CREDITS !== 'undefined' ? Object.keys(PHOTO_CREDITS).length : 0} photo credits</summary>${typeof PHOTO_CREDITS !== 'undefined' ? Object.entries(PHOTO_CREDITS).map(([k, c]) => `<div class="small" style="margin:3px 0"><b>${esc(k.startsWith('planes/') ? (PLANES[k.slice(7)] || {}).name || k : (STORES[k.slice(7)] || {}).name || k)}</b> — <a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.file)}</a> by ${esc(c.author)}, ${esc(c.licence)}</div>`).join('') : ''}</details></div>
      <div class="card" style="margin-top:14px"><h3>Sound credits</h3><p class="small muted">The engines, guns, explosions and fly-bys use these real recordings (public domain and Creative Commons).</p>
      ${(typeof SOUND_CREDITS !== 'undefined' ? SOUND_CREDITS : []).map(c => `<div class="small" style="margin:3px 0"><b>${esc(c.use)}</b> — <a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.title)}</a> by ${esc(c.author)}, ${esc(c.licence)}${c.note ? ' (' + esc(c.note) + ')' : ''}</div>`).join('')}</div>`);
    $('#pf-save').onclick = () => { const v = $('#pf-name').value.trim().slice(0, 18); if (v) { p.name = v; Profile.save(); refresh(); toastMenu('Saved'); } };
    $('#pf-sens').oninput = e => { st.sens = +e.target.value; $('#pf-sv').textContent = st.sens.toFixed(2); Profile.save(); };
    $('#pf-vol').oninput = e => { st.volume = +e.target.value; Sound.setVolume(st.volume); Profile.save(); };
    $('#pf-inv').onchange = e => { st.invert = e.target.checked; Profile.save(); };
    $('#pf-cross').oninput = e => { st.cross = e.target.value; Profile.save(); };
    $('#pf-assist').onchange = e => { st.assist = e.target.checked; Profile.save(); };
    $('#pf-arange').oninput = e => { st.assistRange = +e.target.value; $('#pf-arv').textContent = Math.round(st.assistRange * 100) + '%'; Profile.save(); };
    $('#pf-binds-reset').onclick = () => { Input.reset(); renderProfile(); };
    $$('[data-bind]').forEach(b => b.onclick = () => captureBind(b));
    $('#pf-reset').onclick = () => { if (confirm('Reset all progress? This cannot be undone.')) { Profile.reset(); refresh(); renderProfile(); Game.showPlane(P().selected); } };
  }
  // wait for the next key / mouse button and bind it to the action
  let capturing = false;
  function captureBind(btn) {
    if (capturing) return; capturing = true; const act = btn.dataset.bind; btn.textContent = 'Press a key…'; btn.classList.add('sel');
    const done = code => { capturing = false; removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true); if (code) Input.setBind(act, code); renderProfile(); };
    const onKey = e => { e.preventDefault(); e.stopPropagation(); done(e.code === 'Escape' ? null : e.code); };
    const onMouse = e => { if (e.target === btn && e.button === 0) return; e.preventDefault(); e.stopPropagation(); done('Mouse' + e.button); };
    setTimeout(() => { addEventListener('keydown', onKey, true); addEventListener('mousedown', onMouse, true); }, 0);
  }
  // ---------------------------------------------------------------- play
  const MODE_INFO = {
    destroy: { ic: '💥', desc: 'Two teams of up to 60. Kills score 3, bases 2 / 3 / 5. Most points when the time runs out wins.' },
    dogfight: { ic: '🤺', desc: '1v1 up to 8v8 with a set number of respawns. The last team flying wins.' },
    missions: { ic: '📜', desc: 'Historical missions for your aircraft\'s nation and era.' },
    survival: { ic: '🌊', desc: 'Co-op: hold out against ever-larger waves of enemy aircraft and bombers.' },
  };
  const MAPS_OPT = [['', 'Random'], ...Object.entries(World.MAPS).map(([k, v]) => [k, v.name])];
  const SIZE_OPT = Object.entries(World.SIZES).map(([k, v]) => [k, v.name]);
  const WX_OPT = [['random', 'Random'], ...Object.entries(World.WEATHER).map(([k, v]) => [k, v.name])];
  function settingsForm(s, editable) {
    const dis = editable ? '' : 'disabled';
    const realistic = `<label class="row realistic"><input type="checkbox" id="s-real" ${s.realistic ? 'checked' : ''} ${dis}> <b>Realistic Mode</b> <span class="small muted">— take off from your team's airfield runway, land on it to refuel, rearm and repair. If a team's airfields are destroyed, it can no longer take off.</span></label>`;
    const sel = (id, opts, v) => `<select id="${id}" ${dis}>${opts.map(([k, n]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    let h = '';
    if (s.mode === 'destroy') {
      h += `<div class="grid c2"><div class="field"><label>Team 1 (blue) size: <b id="sz0v">${s.teamSize[0]}</b></label><input type="range" id="sz0" min="1" max="60" value="${s.teamSize[0]}" ${dis}></div>
        <div class="field"><label>Team 2 (red) size: <b id="sz1v">${s.teamSize[1]}</b></label><input type="range" id="sz1" min="1" max="60" value="${s.teamSize[1]}" ${dis}></div></div>
        <div class="grid c2"><div class="field"><label>Match length</label>${sel('s-time', [2, 3, 5, 10, 15, 20, 30, 45, 60].map(x => [x * 60, x + ' minutes']), s.time)}</div><div class="field"><label>Map</label>${sel('s-map', MAPS_OPT, s.map)}</div></div>`;
    } else if (s.mode === 'dogfight') {
      h += `<div class="grid c2"><div class="field"><label>Size</label>${sel('s-size', [1, 2, 3, 4, 5, 6, 7, 8].map(x => [x, `${x} v ${x}`]), s.teamSize[0])}</div>
        <div class="field"><label>Respawns per pilot: <b id="rsv">${s.respawns}</b></label><input type="range" id="s-resp" min="0" max="12" value="${s.respawns}" ${dis}></div></div>
        <div class="grid c2"><div class="field"><label>Time limit</label>${sel('s-time', [[0, 'None'], [300, '5 minutes'], [600, '10 minutes'], [900, '15 minutes'], [1200, '20 minutes'], [1800, '30 minutes']], s.time)}</div><div class="field"><label>Map</label>${sel('s-map', MAPS_OPT, s.map)}</div></div>`;
    } else if (s.mode === 'survival') {
      h += `<div class="grid c2"><div class="field"><label>Respawns per pilot: <b id="rsv">${s.respawns}</b></label><input type="range" id="s-resp" min="0" max="12" value="${s.respawns}" ${dis}></div><div class="field"><label>Map</label>${sel('s-map', MAPS_OPT, s.map)}</div></div>`;
    }
    if (s.mode === 'missions') {
      const lead = editable ? cur() : (lobby && lobby.hostPlane ? PLANES[lobby.hostPlane] : cur());
      const ms = missionsFor(lead); if (!s.mission || !ms.find(x => x.id === s.mission)) s.mission = ms[0] && ms[0].id;
      h += `<p class="muted small">Missions for ${flag(lead.nation)} ${NATIONS[lead.nation].name}, closest to the ${ERAS[lead.era].name} era of the ${esc(lead.name)} first.</p><div class="grid c2">`;
      for (const m of ms) h += `<div class="card ${editable ? 'click' : ''} ${s.mission === m.id ? 'sel' : ''}" data-mis="${m.id}"><div class="row sp"><b style="font-family:var(--head);font-size:19px">${esc(m.name)}</b><span class="pill">${ERAS[m.era].name} · ${m.year}</span></div>
        <div class="small muted" style="margin:6px 0">${esc(m.brief)}</div><span class="pill">${{ sweep: 'Fighter sweep', intercept: 'Intercept bombers', strike: 'Ground strike', escort: 'Bomber escort' }[m.type]}</span> <span class="pill">vs ${NATIONS[m.enemy].name}</span></div>`;
      h += `</div>`;
    }
    // map size, weather and time of day: every mode (missions keep their historical map)
    h += `<div class="grid c3"><div class="field"><label>Map size</label>${sel('s-msize', SIZE_OPT, s.size || 'medium')}</div><div class="field"><label>Weather</label>${sel('s-wx', WX_OPT, s.weather || 'random')}</div>
      <div class="field"><label>Time of day</label><label class="row"><input type="checkbox" id="s-night" ${s.night ? 'checked' : ''} ${dis}> Night</label></div></div>
      <div class="field"><label>Bot skill</label>${sel('s-diff', [['rookie', 'Rookie'], ['regular', 'Regular'], ['veteran', 'Veteran'], ['ace', 'Ace']], s.difficulty || 'regular')}</div>`;
    return realistic + h;
  }
  function bindSettings(s, onChange) {
    const on = (id, ev, f) => { const el = $('#' + id); if (el) el[ev] = e => { f(e.target.value); onChange && onChange(); }; };
    on('sz0', 'oninput', v => { s.teamSize[0] = +v; $('#sz0v').textContent = v; }); on('sz1', 'oninput', v => { s.teamSize[1] = +v; $('#sz1v').textContent = v; });
    on('s-time', 'onchange', v => s.time = +v); on('s-map', 'onchange', v => s.map = v);
    on('s-size', 'onchange', v => s.teamSize = [+v, +v]);
    const re = $('#s-real'); if (re) re.onchange = e => { s.realistic = e.target.checked; onChange && onChange(); };
    on('s-msize', 'onchange', v => s.size = v); on('s-diff', 'onchange', v => s.difficulty = v); on('s-wx', 'onchange', v => s.weather = v);
    const ni = $('#s-night'); if (ni) ni.onchange = e => { s.night = e.target.checked; onChange && onChange(); }; on('s-resp', 'oninput', v => { s.respawns = +v; $('#rsv').textContent = v; });
    $$('[data-mis]').forEach(c => c.onclick = () => { s.mission = c.dataset.mis; onChange && onChange(true); });
  }
  function modeCards(selMode) {
    return `<div class="grid c4">${Object.keys(MODE_NAMES).map(k => `<div class="card click mode-card ${selMode === k ? 'sel' : ''}" data-mode="${k}"><div class="ic">${MODE_INFO[k].ic}</div><h3>${MODE_NAMES[k]}</h3><div class="small muted">${MODE_INFO[k].desc}</div></div>`).join('')}</div>`;
  }
  function renderPlay() {
    if (lobby) return renderLobby();
    const pl = cur();
    let h = `<h2>Play</h2><p class="muted">Flying: <b>${esc(pl.name)}</b> (${NATIONS[pl.nation].name}, ${ERAS[pl.era].name}). Change it in the Hangar.</p>`;
    if (play.step === 'type') {
      h += `<div class="grid c2"><div class="card click mode-card" id="p-sp"><div class="ic">🎯</div><h3>Singleplayer</h3><div class="small muted">Fight alongside and against bots flying aircraft of your era.</div></div>
        <div class="card click mode-card" id="p-mp"><div class="ic">🌐</div><h3>Multiplayer</h3><div class="small muted">Host a game and share its join code, or join a friend's game with theirs. Empty slots can be filled with bots flying the average era of the human players.</div></div></div>
        <div class="card click mode-card" id="p-tut" style="margin-top:12px"><div class="ic">🎓</div><h3>Tutorials</h3><div class="small muted">Basic game mechanics (controls, guns, bombs, rockets, missiles, countermeasures) and basic flight maneuvers (take-off, landing, turns, rolls, the loop, the Immelmann and the split-S).</div></div>`;
      body(h); $('#p-sp').onclick = () => { play.sp = true; play.step = 'modes'; renderPlay(); }; $('#p-mp').onclick = () => { play.sp = false; play.step = 'mp'; renderPlay(); };
      $('#p-tut').onclick = () => { play.step = 'tutorials'; renderPlay(); }; return;
    }
    if (play.step === 'tutorials') {
      h = `<h2>Tutorials</h2><p class="muted">Each tutorial gives you an aircraft suited to the lesson (you do not need to own it) and talks you through it step by step. Nothing is lost or earned. Once you have completed one, you can fly it again with any aircraft you own that can do it.</p>`;
      const done = P().tut || {};
      for (const [cat, title, sub] of Tutorial.CATS) {
        h += `<h3 style="margin-top:16px">${esc(title)}</h3><p class="small muted">${esc(sub)}</p><div class="grid c2">`;
        for (const t of Tutorial.LIST.filter(x => x.cat === cat)) { const pl = PLANES[t.plane], own = done[t.id] ? Object.keys(P().owned).filter(id => id !== t.plane && Tutorial.fits(t, PLANES[id])) : [];
          h += `<div class="card mode-card"><div class="click" data-tut="${t.id}"><div class="ic">${t.icon}</div><h3>${esc(t.name)}${done[t.id] ? ' <span class="pill ok">✓ Completed</span>' : ''}</h3><div class="small muted">${esc(t.desc)}</div>
            <div class="small" style="margin-top:6px">✈ ${esc(pl.name)}${t.realistic ? ' · <span class="pill">Realistic</span>' : ''} · ${t.steps.length} steps</div></div>
            ${own.length ? `<div class="row small" style="margin-top:8px">Fly again with <select data-tut-plane="${t.id}">${own.map(id => `<option value="${id}">${esc(PLANES[id].name)}</option>`).join('')}</select><button data-tut-go="${t.id}">Fly</button></div>` : ''}</div>`; }
        h += `</div>`;
      }
      h += `<div class="row" style="margin-top:14px"><button id="p-back">← Back</button></div>`;
      body(h); $('#p-back').onclick = () => { play.step = 'type'; renderPlay(); };
      $$('[data-tut]').forEach(c => c.onclick = () => startTutorial(c.dataset.tut));
      $$('[data-tut-go]').forEach(b => b.onclick = () => startTutorial(b.dataset.tutGo, $(`[data-tut-plane="${b.dataset.tutGo}"]`).value)); return;
    }
    if (play.step === 'mp') {
      h += `<div class="grid c2"><div class="card"><h3>Host a game</h3><p class="small muted">You choose the mode and settings, and get a join code to give to the other players.</p><button class="primary" id="mp-host">Generate join code</button></div>
        <div class="card"><h3>Join a game</h3><p class="small muted">Enter the code the host gave you.</p><div class="row"><input id="join-code" placeholder="e.g. K7Q2XM" maxlength="9" style="text-transform:uppercase;width:160px"><button class="primary" id="mp-join">Join</button></div></div></div>
        <p class="small muted" style="margin-top:12px">Online play connects the players' browsers directly (WebRTC). Some networks (mobile data, school or office networks) block direct connections; then a relay (TURN) server is needed, ${Net.relayConfigured() ? 'and one is set up' : 'which can be added for free in <code>js/netconfig.js</code>'}. The game traffic is encrypted end to end either way: a relay only passes it on.</p>
        <button id="p-back">← Back</button>`;
      body(h); $('#p-back').onclick = () => { play.step = 'type'; renderPlay(); };
      $('#mp-host').onclick = hostGame; $('#mp-join').onclick = () => joinGame($('#join-code').value); return;
    }
    if (play.step === 'modes') {
      h += `<h3>Choose a game mode</h3>${modeCards(play.mode)}<div class="card" style="margin-top:14px">${settingsForm(play.settings, true)}</div>
        <div class="row" style="margin-top:14px"><button id="p-back">← Back</button><button class="primary" id="p-start" style="font-size:20px;padding:10px 30px">Take off</button></div>`;
      body(h);
      $$('[data-mode]').forEach(c => c.onclick = () => { const keep = ['realistic', 'size', 'weather', 'night', 'difficulty'].map(k => [k, play.settings[k]]); play.mode = c.dataset.mode; play.settings = defaults(play.mode); for (const [k, v] of keep) play.settings[k] = v; renderPlay(); });
      bindSettings(play.settings, re => { if (re) renderPlay(); });
      $('#p-back').onclick = () => { play.step = 'type'; renderPlay(); };
      $('#p-start').onclick = startSingle;
    }
  }
  function me() { const p = P(); return { name: p.name, plane: p.selected, loadout: Profile.loadoutFor(p.selected), level: Profile.levelInfo().level, pid: p.pilotId, elo: Profile.elo() }; }
  function startSingle() {
    const s = JSON.parse(JSON.stringify(play.settings));
    const cfg = Plan.build(s, [Object.assign(me(), { owner: 'H', team: 0 })]);
    const pid = cfg.roster.find(r => r.owner === 'H' && !r.bot).id;
    launch(cfg, { playerId: pid, isHost: true, net: false });
  }
  function startTutorial(id, plane) {
    const t = Tutorial.byId(id), cfg = Plan.build({ mode: 'tutorial', tutorial: id }, [{ name: P().name, plane: plane || t.plane, owner: 'H', team: 0 }]);
    launch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true, net: false });
  }
  function launch(cfg, opt) { close(); Game.startMatch(cfg, opt); }

  // ---------------------------------------------------------------- multiplayer lobby
  function hostGame() {
    if (!Net.available()) return toastMenu('The networking library could not load (offline?).');
    lobby = { host: true, code: null, settings: defaults('destroy'), players: [Object.assign(me(), { peer: 'H', team: 0 })], started: false };
    lobby.settings.fill = true; renderLobby();
    Net.host(code => { lobby.code = code; renderLobby(); });
  }
  function joinGame(code) {
    if (!Net.available()) return toastMenu('The networking library could not load (offline?).');
    code = Net.cleanCode(code); if (code.length < 4) return toastMenu('Enter the join code');
    lobby = { host: false, code, settings: null, players: [], started: false, connecting: true }; renderLobby();
    Net.join(code, () => { lobby.connecting = false; Net.send(Object.assign({ t: 'hello', cards: Profile.shareCards() }, me())); renderLobby(); });
  }
  function lobbySync() { if (!lobby || !lobby.host) return; Net.broadcast({ t: 'lobby', settings: lobby.settings, players: lobby.players, hostPlane: P().selected, cards: Profile.shareCards() }); }
  function renderLobby() {
    if (panel !== 'play') return;
    const L = lobby, s = L.settings;
    let h = `<h2>Multiplayer lobby</h2>`;
    if (L.host) h += `<div class="card" style="margin-bottom:12px"><div class="row sp"><div><div class="muted small">JOIN CODE — give this to the other players</div><div class="code">${L.code || '······'}</div></div><div class="row"><button id="lb-copy" ${L.code ? '' : 'disabled'}>Copy code</button><button class="danger" id="lb-leave">Close lobby</button></div></div>${L.code ? '' : '<div class="muted small">Contacting the matchmaking server…</div>'}</div>`;
    else h += `<div class="card" style="margin-bottom:12px"><div class="row sp"><div><div class="muted small">GAME</div><div class="code">${esc(L.code)}</div></div><button class="danger" id="lb-leave">Leave</button></div>${L.connecting ? '<div class="muted">Connecting to the host…</div>' : !s ? '<div class="muted">Waiting for the host…</div>' : ''}</div>`;
    if (s) {
      if (L.host) h += `<h3>Game mode</h3>${modeCards(s.mode)}`; else h += `<h3>Mode: ${MODE_NAMES[s.mode]}</h3>`;
      h += `<div class="card" style="margin:12px 0">${settingsForm(s, L.host)}${L.host ? `<label class="row" style="margin-top:6px"><input type="checkbox" id="fill-bots" ${s.fill ? 'checked' : ''}> Fill empty slots with bots (they fly the average era of the human players)</label>` : `<div class="small muted">${s.fill ? 'Empty slots are filled with bots.' : 'No bots.'}</div>`}</div>`;
      const teams = s.mode === 'destroy' || s.mode === 'dogfight';
      h += `<h3>Pilots (${L.players.length})</h3><div class="grid ${teams ? 'c2' : 'c1'}">`;
      const row = pl => `<div class="pl"><span>${esc(pl.name)} <span class="muted small">Lv ${pl.level}</span></span><span class="small">${esc(PLANES[pl.plane] ? PLANES[pl.plane].name : pl.plane)} · ${PLANES[pl.plane] ? ERAS[PLANES[pl.plane].era].name : ''}${L.host && teams && pl.peer !== 'H' ? ` <button data-mv="${pl.peer}" style="padding:1px 8px;font-size:12px">⇄</button>` : ''}</span></div>`;
      if (teams) for (const t of [0, 1]) h += `<div><div class="team${t}" style="font-family:var(--head);font-size:18px;margin-bottom:6px">Team ${t + 1} ${s.mode === 'destroy' ? `(${s.teamSize[t]} slots)` : ''}</div>${L.players.filter(p => p.team === t).map(row).join('') || '<div class="muted small">—</div>'}</div>`;
      else h += `<div>${L.players.map(row).join('')}</div>`;
      h += `</div>`;
      if (!L.host && teams) h += `<button id="lb-team" style="margin-top:8px">Switch team</button>`;
      h += `<div class="row" style="margin-top:10px">${!L.host ? `<button id="lb-plane">Use my selected aircraft (${esc(cur().name)})</button>` : ''}${L.host ? `<button class="primary" id="lobby-start" style="font-size:20px;padding:10px 30px">Start battle</button>` : '<span class="muted">The host will start the battle.</span>'}</div>`;
    }
    body(h);
    $('#lb-leave').onclick = () => { Net.close(); lobby = null; play.step = 'mp'; renderPlay(); };
    if ($('#lb-copy')) $('#lb-copy').onclick = () => { try { navigator.clipboard.writeText(L.code); toastMenu('Copied'); } catch (e) {} };
    if (!s) return;
    if (L.host) {
      $$('[data-mode]').forEach(c => c.onclick = () => { const keep = ['fill', 'realistic', 'size', 'weather', 'night', 'difficulty'].map(k => [k, s[k]]); L.settings = defaults(c.dataset.mode); for (const [k, v] of keep) L.settings[k] = v; lobbySync(); renderLobby(); });
      bindSettings(s, re => { lobbySync(); if (re) renderLobby(); });
      $('#fill-bots').onchange = e => { s.fill = e.target.checked; lobbySync(); };
      $$('[data-mv]').forEach(b => b.onclick = () => { const p = L.players.find(x => x.peer === b.dataset.mv); if (p) { p.team = 1 - p.team; lobbySync(); renderLobby(); } });
      $('#lobby-start').onclick = startMulti;
    } else {
      if ($('#lb-team')) $('#lb-team').onclick = () => Net.send({ t: 'team' });
      $('#lb-plane').onclick = () => Net.send(Object.assign({ t: 'hello' }, me()));
    }
  }
  function startMulti() {
    const L = lobby; if (!L || !L.host) return;
    const s = JSON.parse(JSON.stringify(L.settings));
    L.players[0] = Object.assign(L.players[0], me());
    const humans = L.players.map(p => ({ name: p.name, plane: p.plane, loadout: p.loadout, owner: p.peer, team: p.team, level: p.level, pid: p.pid, elo: p.elo }));
    const cfg = Plan.build(s, humans);
    L.started = true;
    Net.broadcast({ t: 'start', cfg });
    launch(cfg, { playerId: cfg.roster.find(r => r.owner === 'H' && !r.bot).id, isHost: true, net: true, myPeer: 'H' });
  }
  function onNet(from, msg) {
    // updated pilot cards after a battle: merge them; the host passes on what was new to everyone
    if (msg.t === 'cards') { const n = Profile.mergeCards(msg.cards, msg.cards && msg.cards[0] && msg.cards[0].id); if (n && Net.role === 'host') Net.broadcast({ t: 'cards', cards: Profile.shareCards() }); return; }
    if (Game.match && Game.running) { Game.match.onNet(from, msg); return; }
    const L = lobby; if (!L) return;
    if (L.host) {
      if (msg.t === 'hello') {
        if (msg.cards) Profile.mergeCards(msg.cards, msg.cards[0] && msg.cards[0].id);
        let p = L.players.find(x => x.peer === from);
        const valid = PLANES[msg.plane] && !PLANES[msg.plane].aiOnly;
        if (!p) { const t0 = L.players.filter(x => x.team === 0).length, t1 = L.players.length - t0; p = { peer: from, team: t1 < t0 ? 1 : 0 }; L.players.push(p); toastMenu(`${msg.name} joined`); }
        Object.assign(p, { name: String(msg.name || 'Pilot').slice(0, 18), plane: valid ? msg.plane : 'camel', loadout: msg.loadout || { belts: {}, stores: [], mods: {} }, level: msg.level | 0, pid: /^[a-z0-9]{8,32}$/.test(msg.pid || '') ? msg.pid : null, elo: Math.max(100, Math.min(4000, +msg.elo || 1000)) });
        lobbySync(); renderLobby();
      }
      if (msg.t === 'team') { const p = L.players.find(x => x.peer === from); if (p) { p.team = 1 - p.team; lobbySync(); renderLobby(); } }
    } else {
      if (msg.t === 'lobby') { L.settings = msg.settings; L.players = msg.players; L.hostPlane = msg.hostPlane; if (msg.cards && !L.gotCards) { Profile.mergeCards(msg.cards, msg.cards[0] && msg.cards[0].id); L.gotCards = true; } renderLobby(); }
      if (msg.t === 'start') { L.started = true; const mine = msg.cfg.roster.find(r => r.owner === Net.myId); if (!mine) return toastMenu('The host did not include you'); launch(msg.cfg, { playerId: mine.id, isHost: false, net: true, myPeer: Net.myId }); }
    }
  }
  function onLeave(peer) {
    const m = Game.match;
    if (m && Game.running) { // a player dropped mid-battle: a bot takes over their aircraft
      for (const c of m.crafts) if (c.spec.owner === peer) { c.spec.owner = 'H'; c.local = true; c.isBot = true; c.name += ' (bot)'; c.ai = new BotBrain(c, 0.6); if (c.alive && !c.dm) c.remoteSpawn(); if (c.alive && c.dm) c.perf = Flight.perf(c.def, c.lo.mods, c.def.mass); c.fuel = c.fuel || 1; c.endurance = c.endurance || 1200; c.stations = c.stations || []; c.flares = c.flares || 0; }
      toastBattle('A player left — a bot took over their aircraft'); return;
    }
    if (lobby && lobby.host) { const p = lobby.players.find(x => x.peer === peer); lobby.players = lobby.players.filter(x => x.peer !== peer); if (p) toastMenu(`${p.name} left`); lobbySync(); renderLobby(); }
  }
  function onClosed(why) {
    if (Game.match && Game.running && !Game.match.over) { toastBattle(why); Game.match.over = true; Game.match.result = { winner: -2, reason: 'The host left the game' }; return; }
    if (lobby) { toastMenu(why); lobby = null; play.step = 'mp'; if (panel === 'play') renderPlay(); }
  }

  // ---------------------------------------------------------------- battle overlays
  let feedN = 0, evN = 0;
  function enterBattle(m) {
    $('#menu-ui').classList.add('hidden'); $('#battle-ui').classList.remove('hidden'); $('#results').classList.add('hidden');
    $('#feed').innerHTML = ''; $('#msgs').innerHTML = ''; feedN = 0; evN = 0; $('#pause').classList.add('hidden'); $('#respawn').classList.add('hidden');
    $('#pause-note').textContent = m.net ? 'Multiplayer: the battle keeps going while paused.' : 'Click Resume to recapture the mouse.';
    if (m.mode === 'missions') msg(m.mission.name + ': ' + m.mission.brief.split('.')[0] + '.');
    else if (m.mode === 'tutorial') msg('Tutorial: ' + Tutorial.byId(m.cfg.tutorial).name);
    else msg(MODE_NAMES[m.mode] + (m.mode === 'destroy' ? ' — destroy enemy aircraft and bases' : m.mode === 'dogfight' ? ' — last team flying wins' : ' — survive the waves'));
  }
  function msg(t) { const d = document.createElement('div'); d.textContent = t; $('#msgs').appendChild(d); setTimeout(() => d.remove(), 2300); }
  function toastBattle(t) { msg(t); }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.opacity = 0, 1400); }
  const EV_TEXT = { fire: 'You are on fire!', engine: 'Engine knocked out', wingL: 'Left wing torn off!', wingR: 'Right wing torn off!', tailH: 'Tailplane shot away', tailV: 'Fin shot away', pilot: 'Pilot hit!', crew: 'Crewman killed', extinguished: 'Fire out' };
  function battleTick(m, dt) {
    while (feedN < m.feed.length) { const f = m.feed[feedN++]; const d = document.createElement('div'); d.textContent = f.text; d.className = (f.me ? 'me ' : '') + 'team' + (m.player && f.team === m.player.team ? 0 : 1); $('#feed').prepend(d); setTimeout(() => d.remove(), 9000); }
    while ($('#feed').children.length > 7) $('#feed').lastChild.remove();
    while (evN < m.events.length) { const e = m.events[evN++]; if (e.text) msg(e.text); else if (EV_TEXT[e.e]) msg(EV_TEXT[e.e]); }
    const p = m.player, rp = $('#respawn');
    // G effects: grey tunnel vision closing in, black at G-LOC; red-out under negative G
    const gx = $('#gfx');
    if (p && p.alive && !p.wreck && (p.glocT > 0 || Math.abs(p.gVision || 0) > 0.02)) {
      const v = p.glocT > 0 ? 1 : Math.abs(p.gVision), red = (p.gVision || 0) < 0 && !(p.glocT > 0), inner = Math.max(0, 60 - v * 75), col = red ? '120,0,0' : p.glocT > 0 ? '0,0,0' : '20,20,22';
      gx.style.opacity = 1; gx.style.background = p.glocT > 0 ? '#000' : `radial-gradient(circle at 50% 50%, rgba(${col},${v * 0.35}) ${inner}%, rgba(${col},${Math.min(1, 0.4 + v * 0.65)}) ${inner + 35}%)`;
    } else gx.style.opacity = 0;
    // respawn panel
    if (p && !p.alive && p.everSpawned && !m.over) {
      const can = m.canRespawn(p), wait = Math.max(0, Math.ceil(p.respawnAt - m.time));
      const lives = p.lives === Infinity ? '' : `<div class="muted">Respawns left: ${Math.max(0, p.lives)}</div>`;
      const html = `<h2>Shot down</h2>${lives}${can ? (wait > 0 ? `<div>Respawn in ${wait}…</div>` : `<div><b>Click</b> or press <kbd>Space</kbd> to take off again</div>`) : `<div class="muted">${(m.mode === 'destroy' && !m.airfieldsLeft(p.team)) || (m.groundTeam(p.team) && !m.homes(p.team).length) ? 'Your team’s airfields are destroyed — nobody can take off again' : 'Out of respawns'} — spectating</div><button id="rs-leave" style="margin-top:8px">Leave battle</button>`}`;
      if (rp.dataset.h !== html) { rp.innerHTML = html; rp.dataset.h = html; const lb = $('#rs-leave'); if (lb) lb.onclick = () => Game.leave(); }
      rp.classList.remove('hidden');
    } else rp.classList.add('hidden');
    if (!$('#scoreboard').classList.contains('hidden')) scoreboard(true);
  }
  function tryRespawn() {
    const m = Game.match, p = m && m.player; if (!p || p.alive || m.over) return;
    if (m.canRespawn(p) && m.time >= p.respawnAt) { m.spawnCraft(p); Game.aimReset && Game.aimReset(); }
  }
  function scoreboard(show) {
    const sb = $('#scoreboard'); if (!show) { sb.classList.add('hidden'); return; }
    const m = Game.match; if (!m) return; sb.classList.remove('hidden');
    const my = m.player ? m.player.team : 0;
    const table = t => { const l = m.crafts.filter(c => c.team === t).sort((a, b) => b.stats.score - a.stats.score);
      return `<table><tr><th>Pilot</th><th>Aircraft</th><th>Kills</th><th>Deaths</th><th>Bases</th><th>Score</th></tr>${l.map(c => `<tr class="${c === m.player ? 'me' : ''}"><td>${esc(c.name)}${c.isBot ? ' <span class="muted small">bot</span>' : ''}${c.alive ? '' : ' ✝'}</td><td>${esc(c.def.name)}</td><td>${c.stats.kills}</td><td>${c.stats.deaths}</td><td>${c.stats.bases}</td><td>${c.stats.score}</td></tr>`).join('')}</table>`; };
    sb.innerHTML = `<div class="grid c2"><div><h3 class="team0">Your team ${m.mode === 'destroy' || m.mode === 'dogfight' ? '· ' + m.scores[my] : ''}</h3>${table(my)}</div><div><h3 class="team1">Enemy ${m.mode === 'destroy' || m.mode === 'dogfight' ? '· ' + m.scores[1 - my] : ''}</h3>${table(1 - my)}</div></div>`;
  }
  function pause(show) {
    const m = Game.match; if (show && m && m.player && !m.player.alive) { Game.paused = false; return; }
    if (show) $('#pause .controls').innerHTML = `<div><b>Mouse</b>: aim — the aircraft flies towards the circle · <kbd>Esc</kbd> pause</div>` + Input.ACTIONS.map(([id, name]) => `<span style="display:inline-block;min-width:46%"><kbd>${esc(Input.label(Input.bind(id)))}</kbd> ${name}</span>`).join(' ') + `<div class="small">Change these in Profile → Controls.</div>`;
    $('#pause').classList.toggle('hidden', !show);
  }
  function showResults(m, info) {
    const p = m.player, r = m.result || {}, s = p.stats, rw = info.reward;
    const title = m.mode === 'tutorial' ? (info.won ? 'TUTORIAL COMPLETE' : 'TUTORIAL ENDED') : info.left ? 'LEFT BATTLE' : m.mode === 'survival' ? `WAVE ${Math.max(0, m.wave - 1)} SURVIVED` : r.winner === -1 ? 'DRAW' : info.won ? 'VICTORY' : 'DEFEAT';
    const cls = info.won ? 'win' : info.left || r.winner === -1 ? '' : 'loss';
    const my = p.team;
    const table = t => { const l = m.crafts.filter(c => c.team === t).sort((a, b) => b.stats.score - a.stats.score);
      return `<table><tr><th>Pilot</th><th>Aircraft</th><th>K</th><th>D</th><th>Bases</th><th>Score</th></tr>${l.slice(0, 20).map(c => `<tr class="${c === p ? 'me' : ''}"><td>${esc(c.name)}</td><td>${esc(c.def.name)}</td><td>${c.stats.kills}</td><td>${c.stats.deaths}</td><td>${c.stats.bases}</td><td>${c.stats.score}</td></tr>`).join('')}${l.length > 20 ? `<tr><td colspan="6" class="muted">+${l.length - 20} more</td></tr>` : ''}</table>`; };
    const teams = m.mode === 'destroy' || m.mode === 'dogfight';
    $('#results').innerHTML = `<div class="card"><div class="big-result ${cls}">${title}</div><div class="muted">${esc(info.reason || r.reason || '')}${teams ? ` · ${m.scores[my]} – ${m.scores[1 - my]}` : ''}</div>
      <div class="rewards"><div class="card"><span class="muted small">XP EARNED</span><b>+${fmt(rw.xp)}</b></div><div class="card"><span class="muted small">COINS EARNED</span><b>+${fmt(rw.coins)}</b></div><div class="card"><span class="muted small">ERA BONUS</span><b>×${ERAS[p.def.era].xpMul}</b></div></div>
      ${rw.levelUp ? `<h3>🎉 Level up! You are now level ${rw.levelUp}</h3>` : ''}
      ${rw.rating ? `<div class="row" style="margin:6px 0"><span class="pill">Elo ${rw.rating.before} → <b>${rw.rating.after}</b> (${rw.rating.delta >= 0 ? '+' : ''}${rw.rating.delta}) · win chance was ${Math.round(rw.rating.expected * 100)}%</span></div>` : ''}
      ${rw.achievements.length ? `<h3>Achievements unlocked</h3><div class="row">${rw.achievements.map(a => `<span class="pill ok">${a.icon} ${a.name} · +${fmt(ACH_REWARD[a.tier || 1].coins)} coins, +${fmt(ACH_REWARD[a.tier || 1].xp)} XP</span>`).join(' ')}</div>` : ''}
      <div class="row" style="margin:12px 0"><span class="pill">Kills ${s.kills}</span><span class="pill">Assists ${s.assists}</span><span class="pill">Deaths ${s.deaths}</span><span class="pill">Bases ${s.bases}</span><span class="pill">Tanks ${s.tanks || 0}</span><span class="pill">Damage dealt ${fmt(s.damage)}</span>${m.mode === 'survival' ? `<span class="pill">Waves ${Math.max(0, m.wave - 1)}</span>` : ''}</div>
      ${teams ? `<div class="grid c2"><div><h3 class="team0">Your team</h3>${table(my)}</div><div><h3 class="team1">Enemy team</h3>${table(1 - my)}</div></div>` : table(my)}
      <div class="row" style="margin-top:16px"><button class="primary" id="res-ok" style="font-size:20px;padding:10px 30px">Continue</button></div></div>`;
    $('#results').classList.remove('hidden'); $('#pause').classList.add('hidden');
    $('#res-ok').onclick = () => {
      $('#results').classList.add('hidden'); Game.stopMatch();
      if (m.net) { Net.close(); lobby = null; play.step = 'mp'; }
      $('#battle-ui').classList.add('hidden'); $('#menu-ui').classList.remove('hidden'); HUD.clear(); refresh(); Game.showPlane(P().selected);
    };
  }
  window.addEventListener('DOMContentLoaded', init);
  return { get capturing() { return capturing; }, refresh, open, close, enterBattle, battleTick, tryRespawn, scoreboard, pause, showResults, toast, get game() { return Game; }, get lobby() { return lobby; } };
})();
