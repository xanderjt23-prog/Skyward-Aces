// ============================================================================
// Static game data: eras, nations, guns, ammunition belts, ordnance (bombs,
// rockets, missiles, gun pods) and airframe upgrades. Units: metres, seconds,
// kilograms; speeds in the tables are km/h unless named *Ms.
// ============================================================================
const ERAS = [
  null,
  { id: 1, name: 'WW1', years: '1914-1918', xpMul: 1.0 },
  { id: 2, name: 'Interwar', years: '1919-1938', xpMul: 1.3 },
  { id: 3, name: 'WW2', years: '1939-1945', xpMul: 1.7 },
  { id: 4, name: 'Early Jet', years: '1946-1955', xpMul: 2.1 },
  { id: 5, name: 'Cold War', years: '1956-1975', xpMul: 2.6 },
  { id: 6, name: 'Late Cold War', years: '1976-1995', xpMul: 3.1 },
  { id: 7, name: 'Modern', years: '1996+', xpMul: 3.7 },
];
const MAX_ERA = 7;

const NATIONS = {
  usa: { id: 'usa', name: 'USA', flag: '🇺🇸', colors: [0x5b6b4a, 0x9aa7b0], roundel: [0x1c2f6e, 0xffffff, 0xb22234], bloc: 'west' },
  ger: { id: 'ger', name: 'Germany', flag: '🇩🇪', colors: [0x6f7863, 0x9fb0bf], roundel: [0x111111, 0xffffff, 0x111111], bloc: 'west' },
  uk:  { id: 'uk',  name: 'Britain', flag: '🇬🇧', colors: [0x5d5a3f, 0x8e8a6a], roundel: [0xc8102e, 0xffffff, 0x1c2f6e], bloc: 'west' }, // roundel: centre, middle, outer ring
  ussr:{ id: 'ussr',name: 'USSR / Russia', flag: '🇷🇺', colors: [0x52623d, 0x8fa7b8], roundel: [0xcc1111, 0xffffff, 0xcc1111], bloc: 'east' },
  jpn: { id: 'jpn', name: 'Japan', flag: '🇯🇵', colors: [0x4f5d3a, 0xb9b7a4], roundel: [0xffffff, 0xc8102e, 0xc8102e], bloc: 'west' },
  fra: { id: 'fra', name: 'France', flag: '🇫🇷', colors: [0x6b6a52, 0x9aa6ad], roundel: [0x0055a4, 0xffffff, 0xef4135], bloc: 'west' },
};
const NATION_ORDER = ['usa', 'ger', 'uk', 'ussr', 'jpn', 'fra'];

// ---- Guns. dmg = damage of a default round, ms = muzzle velocity m/s
const GUNS = {
  vickers:  { name: '.303 Vickers', cal: 7.7, rpm: 450, ms: 744, dmg: 8, ammo: 500 },
  lewis:    { name: '.303 Lewis', cal: 7.7, rpm: 550, ms: 740, dmg: 8, ammo: 291 },
  spandau:  { name: '7.92 mm LMG 08/15', cal: 7.92, rpm: 450, ms: 870, dmg: 8.5, ammo: 500 },
  parab:    { name: '7.92 mm Parabellum MG14', cal: 7.92, rpm: 650, ms: 870, dmg: 8.5, ammo: 500 },
  pv1:      { name: '7.62 mm PV-1', cal: 7.62, rpm: 750, ms: 830, dmg: 8, ammo: 750 },
  shkas:    { name: '7.62 mm ShKAS', cal: 7.62, rpm: 1800, ms: 825, dmg: 7.5, ammo: 650 },
  browning303: { name: '.303 Browning', cal: 7.7, rpm: 1150, ms: 744, dmg: 8, ammo: 330 },
  m1919:    { name: '.30 M1919', cal: 7.62, rpm: 1200, ms: 850, dmg: 8, ammo: 500 },
  mg17:     { name: '7.92 mm MG 17', cal: 7.92, rpm: 1200, ms: 905, dmg: 8.5, ammo: 1000 },
  mg15:     { name: '7.92 mm MG 15', cal: 7.92, rpm: 1000, ms: 755, dmg: 8.5, ammo: 600 },
  type89:   { name: '7.7 mm Type 89', cal: 7.7, rpm: 900, ms: 750, dmg: 8, ammo: 600 },
  type92:   { name: '7.7 mm Type 92', cal: 7.7, rpm: 600, ms: 750, dmg: 8, ammo: 600 },
  mac34:    { name: '7.5 mm MAC 1934', cal: 7.5, rpm: 1200, ms: 830, dmg: 7.5, ammo: 500 },
  m2:       { name: '.50 M2 Browning', cal: 12.7, rpm: 800, ms: 870, dmg: 21, ammo: 400 },
  m3:       { name: '.50 M3 Browning', cal: 12.7, rpm: 1200, ms: 870, dmg: 21, ammo: 300 },
  mg131:    { name: '13 mm MG 131', cal: 13, rpm: 900, ms: 750, dmg: 22, ammo: 300 },
  ubs:      { name: '12.7 mm UBS', cal: 12.7, rpm: 1000, ms: 860, dmg: 22, ammo: 220 },
  ho103:    { name: '12.7 mm Ho-103', cal: 12.7, rpm: 900, ms: 780, dmg: 20, ammo: 300 },
  mgff:     { name: '20 mm MG FF/M', cal: 20, rpm: 540, ms: 700, dmg: 55, ammo: 60, he: true },
  mg151:    { name: '20 mm MG 151/20', cal: 20, rpm: 750, ms: 805, dmg: 60, ammo: 200, he: true },
  mk108:    { name: '30 mm MK 108', cal: 30, rpm: 600, ms: 540, dmg: 170, ammo: 60, he: true },
  hispano:  { name: '20 mm Hispano', cal: 20, rpm: 750, ms: 880, dmg: 62, ammo: 150, he: true },
  hs404:    { name: '20 mm HS.404', cal: 20, rpm: 700, ms: 880, dmg: 62, ammo: 60, he: true },
  shvak:    { name: '20 mm ShVAK', cal: 20, rpm: 800, ms: 790, dmg: 55, ammo: 150, he: true },
  vya23:    { name: '23 mm VYa-23', cal: 23, rpm: 600, ms: 900, dmg: 80, ammo: 150, he: true },
  type99:   { name: '20 mm Type 99', cal: 20, rpm: 520, ms: 600, dmg: 55, ammo: 60, he: true },
  ho5:      { name: '20 mm Ho-5', cal: 20, rpm: 850, ms: 750, dmg: 55, ammo: 150, he: true },
  m3cannon: { name: '20 mm M3 cannon', cal: 20, rpm: 800, ms: 860, dmg: 62, ammo: 150, he: true },
  n37:      { name: '37 mm N-37', cal: 37, rpm: 400, ms: 690, dmg: 260, ammo: 40, he: true },
  nr23:     { name: '23 mm NR-23', cal: 23, rpm: 850, ms: 680, dmg: 85, ammo: 80, he: true },
  nr30:     { name: '30 mm NR-30', cal: 30, rpm: 900, ms: 780, dmg: 150, ammo: 70, he: true },
  m39:      { name: '20 mm M39', cal: 20, rpm: 1500, ms: 1030, dmg: 65, ammo: 200, he: true },
  aden:     { name: '30 mm ADEN', cal: 30, rpm: 1300, ms: 790, dmg: 150, ammo: 120, he: true },
  defa:     { name: '30 mm DEFA', cal: 30, rpm: 1300, ms: 815, dmg: 150, ammo: 125, he: true },
  m61:      { name: '20 mm M61 Vulcan', cal: 20, rpm: 6000, ms: 1050, dmg: 65, ammo: 940, he: true },
  gsh23:    { name: '23 mm GSh-23L', cal: 23, rpm: 3400, ms: 715, dmg: 85, ammo: 200, he: true },
  gsh30:    { name: '30 mm GSh-30-1', cal: 30, rpm: 1500, ms: 860, dmg: 160, ammo: 150, he: true },
  bk27:     { name: '27 mm Mauser BK-27', cal: 27, rpm: 1700, ms: 1025, dmg: 120, ammo: 150, he: true },
  giat30:   { name: '30 mm GIAT 30M791', cal: 30, rpm: 2500, ms: 1025, dmg: 160, ammo: 125, he: true },
  gau8:     { name: '30 mm GAU-8/A Avenger', cal: 30, rpm: 3900, ms: 1010, dmg: 170, ammo: 1150, he: true },
  // gun-pod guns
  gau13:    { name: '30 mm GAU-13/A', cal: 30, rpm: 2400, ms: 1013, dmg: 160, ammo: 353, he: true },
};

// ---- Ammunition belts. Every gun has the 'std' belt; others are bought per aircraft.
// Multipliers: dmg (vs aircraft), pen (vs armour), fire (fire chance), he (splash), struct (vs ground), tracer
const BELTS = {
  std:   { name: 'Default', desc: 'Standard mixed belt.', dmg: 1, pen: 1, fire: 1, he: 1, struct: 1, tracer: 1, price: 0 },
  ap:    { name: 'Armour-piercing', desc: 'Hardened cores that punch through armour plates and engine blocks. Few fires.', dmg: 0.95, pen: 1.8, fire: 0.5, he: 0.4, struct: 1.2, tracer: 0.5, price: 1 },
  inc:   { name: 'Incendiary', desc: 'Sets fuel tanks and engines alight far more often.', dmg: 0.9, pen: 0.7, fire: 3.0, he: 1, struct: 0.9, tracer: 0.6, price: 1, maxCal: 15 },
  api:   { name: 'API-T', desc: 'Armour-piercing incendiary with tracer: penetration and fires.', dmg: 1.05, pen: 1.5, fire: 2.2, he: 0.6, struct: 1.1, tracer: 1, price: 1.6, minEra: 3 },
  hei:   { name: 'HEI', desc: 'High-explosive incendiary: big holes in structure, wings and tails.', dmg: 1.25, pen: 0.6, fire: 1.8, he: 1.8, struct: 1.4, tracer: 0.5, price: 1.6, minCal: 20 },
  mine:  { name: 'Minengeschoss', desc: 'Thin-walled mine shells packed with explosive. Devastating to airframes.', dmg: 1.55, pen: 0.4, fire: 1.4, he: 2.4, struct: 1.6, tracer: 0.5, price: 2.2, minCal: 20, minEra: 3 },
  stealth: { name: 'Stealth', desc: 'No tracers: the target will not see where it is coming from.', dmg: 1.0, pen: 1.1, fire: 1.2, he: 1, struct: 1, tracer: 0, price: 1.3 },
};
function beltsForGun(gunId, era) {
  const g = GUNS[gunId], out = ['std'];
  for (const k in BELTS) { if (k === 'std') continue; const b = BELTS[k];
    if (b.maxCal && g.cal > b.maxCal) continue; if (b.minCal && g.cal < b.minCal) continue; if (b.minEra && era < b.minEra) continue;
    if (k === 'hei' && !g.he) continue; if (k === 'mine' && !g.he) continue; if (k === 'inc' && era >= 5) continue;
    out.push(k); }
  return out;
}
const beltPrice = (beltId, era) => Math.round(BELTS[beltId].price * (300 + era * era * 160) / 10) * 10;

// ---- Ordnance carried on hardpoints. kind: b=bomb r=rocket m=missile g=gun pod
// eras: [min,max]; bloc/nat limit who can mount it.
const STORES = {
  // bombs: see BOMB_LIST below (real designations per nation and period; damage and blast radius scale with the mass)
  // rockets (count = rockets per station)
  leprieur:{ kind: 'r', name: 'Le Prieur rockets (x4)', mass: 12, count: 4, eras: [1, 1], dmg: 90, rad: 8, speed: 120, airDmg: 70, price: 250 },
  rs82:    { kind: 'r', name: 'RS-82 rockets (x4)', mass: 28, count: 4, eras: [2, 3], dmg: 240, rad: 12, speed: 340, airDmg: 160, price: 500, bloc: 'east' },
  hvar:    { kind: 'r', name: 'HVAR 5-inch rockets (x3)', mass: 192, count: 3, eras: [3, 4], dmg: 650, rad: 18, speed: 420, airDmg: 300, price: 900 },
  rp3:     { kind: 'r', name: 'RP-3 60 lb rockets (x4)', mass: 136, count: 4, eras: [3, 4], dmg: 600, rad: 17, speed: 360, airDmg: 280, price: 800, nat: ['uk', 'usa', 'fra'] },
  r4m:     { kind: 'r', name: 'R4M air-to-air rockets (x12)', mass: 48, count: 12, eras: [3, 4], dmg: 220, rad: 10, speed: 525, airDmg: 260, price: 1200, nat: ['ger'] },
  ffar:    { kind: 'r', name: 'FFAR 2.75" pod (x7)', mass: 160, count: 7, eras: [4, 6], dmg: 420, rad: 15, speed: 700, airDmg: 220, price: 1400, bloc: 'west' },
  s5:      { kind: 'r', name: 'UB-16 pod, S-5 rockets (x8)', mass: 250, count: 8, eras: [5, 6], dmg: 380, rad: 14, speed: 650, airDmg: 200, price: 1400, bloc: 'east' },
  zuni:    { kind: 'r', name: 'Zuni 5-inch pod (x4)', mass: 250, count: 4, eras: [5, 6], dmg: 900, rad: 22, speed: 720, airDmg: 320, price: 2000, bloc: 'west' },
  hydra:   { kind: 'r', name: 'Hydra 70 pod (x7)', mass: 160, count: 7, eras: [6, 7], dmg: 520, rad: 16, speed: 740, airDmg: 240, price: 2400, bloc: 'west' },
  s8:      { kind: 'r', name: 'B-8 pod, S-8 rockets (x10)', mass: 360, count: 10, eras: [6, 7], dmg: 560, rad: 17, speed: 610, airDmg: 260, price: 2400, bloc: 'east' },
  tinytim: { kind: 'r', name: '11.75 in Tiny Tim rocket', mass: 581, count: 1, eras: [3, 4], dmg: 3200, rad: 40, speed: 250, airDmg: 600, price: 2400, nat: ['usa'] },
  rs132:   { kind: 'r', name: 'RS-132 rockets (x2)', mass: 46, count: 2, eras: [3, 4], dmg: 520, rad: 16, speed: 350, airDmg: 260, price: 800, nat: ['ussr'] },
  wgr21:   { kind: 'r', name: 'Werfer-Granate 21 (x1)', mass: 112, count: 1, eras: [3, 4], dmg: 700, rad: 25, speed: 320, airDmg: 900, price: 1300, nat: ['ger'] },
  s24:     { kind: 'r', name: 'S-24 240 mm rocket', mass: 235, count: 1, eras: [5, 7], dmg: 2400, rad: 34, speed: 600, airDmg: 400, price: 2600, bloc: 'east' },
  s13:     { kind: 'r', name: 'B-13L pod, S-13 rockets (x5)', mass: 505, count: 5, eras: [6, 7], dmg: 900, rad: 20, speed: 650, airDmg: 300, price: 3200, bloc: 'east' },
  sneb:    { kind: 'r', name: 'Matra F4 pod, SNEB 68 mm (x18)', mass: 225, count: 18, eras: [5, 7], dmg: 330, rad: 13, speed: 700, airDmg: 200, price: 2200, nat: ['fra', 'uk'] },
  crv7:    { kind: 'r', name: 'LAU-5003 pod, CRV7 70 mm (x19)', mass: 230, count: 19, eras: [6, 7], dmg: 380, rad: 14, speed: 1100, airDmg: 260, price: 3000, nat: ['uk'] },
  // missiles. seek: ir (heat) | sarh (needs the launcher radar on the target) | arh (own radar)
  // range m, speed m/s, g = max manoeuvre, fov = seeker half-angle deg, rear = rear-aspect only, ccm = flare resistance 0..1
  aim9b:   { kind: 'm', name: 'AIM-9B Sidewinder', mass: 75, eras: [4, 5], seek: 'ir', range: 3500, speed: 750, g: 11, fov: 12, rear: true, ccm: 0.1, life: 12, price: 2400, bloc: 'west' },
  r3s:     { kind: 'm', name: 'R-3S (K-13)', mass: 75, eras: [5, 5], seek: 'ir', range: 3200, speed: 720, g: 10, fov: 12, rear: true, ccm: 0.1, life: 12, price: 2400, bloc: 'east' },
  firestreak: { kind: 'm', name: 'Firestreak', mass: 136, eras: [5, 5], seek: 'ir', range: 4000, speed: 800, g: 9, fov: 14, rear: true, ccm: 0.15, life: 12, price: 2600, nat: ['uk'] },
  redtop:  { kind: 'm', name: 'Red Top', mass: 150, eras: [5, 6], seek: 'ir', range: 6000, speed: 900, g: 12, fov: 20, rear: false, ccm: 0.25, life: 14, price: 4200, nat: ['uk'] },
  aim9d:   { kind: 'm', name: 'AIM-9D/G Sidewinder', mass: 88, eras: [5, 5], seek: 'ir', range: 5000, speed: 800, g: 16, fov: 18, rear: true, ccm: 0.25, life: 14, price: 3800, bloc: 'west' },
  aim7e:   { kind: 'm', name: 'AIM-7E Sparrow', mass: 197, eras: [5, 6], seek: 'sarh', range: 12000, speed: 1000, g: 12, fov: 30, ccm: 0.6, life: 20, price: 5200, bloc: 'west', radar: true },
  r530:    { kind: 'm', name: 'Matra R.530', mass: 195, eras: [5, 6], seek: 'sarh', range: 10000, speed: 950, g: 10, fov: 30, ccm: 0.5, life: 20, price: 4800, nat: ['fra'], radar: true },
  r60:     { kind: 'm', name: 'R-60', mass: 44, eras: [6, 7], seek: 'ir', range: 4000, speed: 850, g: 30, fov: 25, rear: false, ccm: 0.35, life: 12, price: 5500, bloc: 'east' },
  aim9l:   { kind: 'm', name: 'AIM-9L/M Sidewinder', mass: 86, eras: [6, 7], seek: 'ir', range: 8000, speed: 900, g: 30, fov: 27, rear: false, ccm: 0.55, life: 16, price: 7000, bloc: 'west' },
  magic2:  { kind: 'm', name: 'R.550 Magic 2', mass: 89, eras: [6, 7], seek: 'ir', range: 7000, speed: 900, g: 35, fov: 30, rear: false, ccm: 0.5, life: 14, price: 7000, nat: ['fra'] },
  r73:     { kind: 'm', name: 'R-73', mass: 105, eras: [6, 7], seek: 'ir', range: 9000, speed: 900, g: 40, fov: 45, rear: false, ccm: 0.6, life: 16, price: 9000, bloc: 'east' },
  aim7m:   { kind: 'm', name: 'AIM-7M Sparrow', mass: 231, eras: [6, 7], seek: 'sarh', range: 22000, speed: 1100, g: 20, fov: 35, ccm: 0.8, life: 28, price: 9000, bloc: 'west', radar: true },
  skyflash:{ kind: 'm', name: 'Skyflash', mass: 193, eras: [6, 6], seek: 'sarh', range: 20000, speed: 1100, g: 20, fov: 35, ccm: 0.8, life: 26, price: 8500, nat: ['uk'], radar: true },
  s530d:   { kind: 'm', name: 'Super 530D', mass: 270, eras: [6, 7], seek: 'sarh', range: 22000, speed: 1200, g: 20, fov: 35, ccm: 0.8, life: 28, price: 9000, nat: ['fra'], radar: true },
  r27r:    { kind: 'm', name: 'R-27R', mass: 253, eras: [6, 7], seek: 'sarh', range: 22000, speed: 1100, g: 22, fov: 35, ccm: 0.75, life: 28, price: 9000, bloc: 'east', radar: true },
  aam3:    { kind: 'm', name: 'AAM-3', mass: 91, eras: [6, 7], seek: 'ir', range: 8000, speed: 900, g: 40, fov: 40, rear: false, ccm: 0.65, life: 16, price: 9000, nat: ['jpn'] },
  aim120:  { kind: 'm', name: 'AIM-120C AMRAAM', mass: 152, eras: [6, 7], seek: 'arh', range: 30000, speed: 1250, g: 30, fov: 40, ccm: 0.85, life: 34, price: 14000, bloc: 'west', radar: true },
  r77:     { kind: 'm', name: 'R-77', mass: 175, eras: [7, 7], seek: 'arh', range: 30000, speed: 1200, g: 35, fov: 40, ccm: 0.85, life: 34, price: 14000, bloc: 'east', radar: true },
  aim9x:   { kind: 'm', name: 'AIM-9X Sidewinder', mass: 85, eras: [7, 7], seek: 'ir', range: 10000, speed: 950, g: 50, fov: 90, rear: false, ccm: 0.85, life: 18, price: 16000, bloc: 'west' },
  irist:   { kind: 'm', name: 'IRIS-T', mass: 87, eras: [7, 7], seek: 'ir', range: 10000, speed: 950, g: 55, fov: 90, rear: false, ccm: 0.85, life: 18, price: 16000, nat: ['ger', 'uk'] },
  micair:  { kind: 'm', name: 'MICA IR', mass: 112, eras: [7, 7], seek: 'ir', range: 12000, speed: 1000, g: 50, fov: 60, rear: false, ccm: 0.8, life: 20, price: 15000, nat: ['fra'] },
  r74:     { kind: 'm', name: 'R-74M', mass: 105, eras: [7, 7], seek: 'ir', range: 10000, speed: 950, g: 50, fov: 75, rear: false, ccm: 0.8, life: 18, price: 15000, bloc: 'east' },
  aam4:    { kind: 'm', name: 'AAM-4', mass: 222, eras: [7, 7], seek: 'arh', range: 30000, speed: 1250, g: 30, fov: 40, ccm: 0.85, life: 34, price: 14000, nat: ['jpn'], radar: true },
  meteor:  { kind: 'm', name: 'MBDA Meteor', mass: 190, eras: [7, 7], seek: 'arh', range: 40000, speed: 1300, g: 30, fov: 40, ccm: 0.9, life: 45, price: 22000, nat: ['uk', 'fra', 'ger'], radar: true },
  aim4d:   { kind: 'm', name: 'AIM-4D Falcon', mass: 61, eras: [5, 5], seek: 'ir', range: 5000, speed: 850, g: 10, fov: 10, rear: true, ccm: 0.15, life: 12, price: 2600, nat: ['usa'] },
  aim9p:   { kind: 'm', name: 'AIM-9P Sidewinder', mass: 82, eras: [5, 6], seek: 'ir', range: 6000, speed: 850, g: 20, fov: 20, rear: true, ccm: 0.35, life: 14, price: 4800, bloc: 'west' },
  aim7f:   { kind: 'm', name: 'AIM-7F Sparrow', mass: 231, eras: [6, 6], seek: 'sarh', range: 18000, speed: 1050, g: 16, fov: 30, ccm: 0.7, life: 26, price: 7500, bloc: 'west', radar: true },
  r13m:    { kind: 'm', name: 'R-13M', mass: 90, eras: [5, 6], seek: 'ir', range: 5000, speed: 800, g: 15, fov: 18, rear: true, ccm: 0.3, life: 14, price: 4200, bloc: 'east' },
  r40t:    { kind: 'm', name: 'R-40TD', mass: 475, eras: [5, 6], seek: 'ir', range: 15000, speed: 1100, g: 8, fov: 20, rear: false, ccm: 0.3, life: 24, price: 6500, bloc: 'east' },
  r40r:    { kind: 'm', name: 'R-40RD', mass: 475, eras: [5, 6], seek: 'sarh', range: 30000, speed: 1100, g: 8, fov: 30, ccm: 0.55, life: 34, price: 7500, bloc: 'east', radar: true },
  r27et:   { kind: 'm', name: 'R-27ET (long-range heat seeker)', mass: 343, eras: [6, 7], seek: 'ir', range: 14000, speed: 1150, g: 25, fov: 35, rear: false, ccm: 0.6, life: 26, price: 11000, bloc: 'east' },
  r27er:   { kind: 'm', name: 'R-27ER', mass: 350, eras: [6, 7], seek: 'sarh', range: 30000, speed: 1200, g: 24, fov: 35, ccm: 0.8, life: 36, price: 12000, bloc: 'east', radar: true },
  r771:    { kind: 'm', name: 'R-77-1', mass: 190, eras: [7, 7], seek: 'arh', range: 35000, speed: 1250, g: 38, fov: 45, ccm: 0.9, life: 38, price: 18000, bloc: 'east', radar: true },
  magic1:  { kind: 'm', name: 'Matra R.550 Magic 1', mass: 89, eras: [5, 6], seek: 'ir', range: 5000, speed: 850, g: 25, fov: 25, rear: true, ccm: 0.3, life: 12, price: 4800, nat: ['fra'] },
  s530f:   { kind: 'm', name: 'Super 530F', mass: 245, eras: [6, 6], seek: 'sarh', range: 20000, speed: 1150, g: 20, fov: 35, ccm: 0.75, life: 26, price: 8500, nat: ['fra'], radar: true },
  micaem:  { kind: 'm', name: 'MICA EM', mass: 112, eras: [7, 7], seek: 'arh', range: 30000, speed: 1200, g: 50, fov: 50, ccm: 0.85, life: 30, price: 16000, nat: ['fra'], radar: true },
  asraam:  { kind: 'm', name: 'AIM-132 ASRAAM', mass: 88, eras: [7, 7], seek: 'ir', range: 12000, speed: 1050, g: 50, fov: 90, rear: false, ccm: 0.85, life: 18, price: 16000, nat: ['uk'] },
  aim120d: { kind: 'm', name: 'AIM-120D AMRAAM', mass: 161, eras: [7, 7], seek: 'arh', range: 45000, speed: 1300, g: 32, fov: 45, ccm: 0.9, life: 45, price: 22000, nat: ['usa'], radar: true },
  // gun pods
  gp_lewis:{ kind: 'g', name: 'Foster-mount Lewis gun', mass: 13, eras: [1, 1], gun: 'lewis', guns: 1, price: 400, nat: ['uk', 'fra', 'usa', 'ussr'] },
  gp_mg151:{ kind: 'g', name: 'Rüstsatz gondola (MG 151/20)', mass: 135, eras: [3, 3], gun: 'mg151', guns: 1, price: 1500, nat: ['ger'] },
  gp_m2:   { kind: 'g', name: 'Twin .50 gun pod', mass: 120, eras: [3, 4], gun: 'm2', guns: 2, price: 1200, bloc: 'west' },
  gp_upk23:{ kind: 'g', name: 'UPK-23-250 gun pod', mass: 218, eras: [5, 7], gun: 'gsh23', guns: 1, price: 4000, bloc: 'east' },
  gp_suu23:{ kind: 'g', name: 'SUU-23/A gun pod (M61)', mass: 780, eras: [5, 6], gun: 'm61', guns: 1, price: 4000, bloc: 'west' },
  gp_gpu5: { kind: 'g', name: 'GPU-5/A gun pod (30 mm)', mass: 860, eras: [6, 7], gun: 'gau13', guns: 1, price: 6000, bloc: 'west' },
};
// ---- Bombs by their real designations. [id, name, kg, [first era, last era], who carries it, type]
// who: a nation list, or 'west' / 'east'. type: gp general purpose | hc high capacity (thin case, big blast) | ap armour
// piercing / semi-armour piercing (smaller blast) | cl cluster (wide spread of small bomblets) | rt retarded (parachute /
// Snakeye fins: safe low-level release) | lgb laser-guided | gps satellite-guided. Damage and blast radius follow the mass.
const BOMB_LIST = [
  // ---- WW1
  ['cooper', 'Cooper 20 lb bomb', 9, [1, 2], ['uk', 'usa', 'fra', 'ussr'], 'gp'],
  ['rl112', '112 lb RL bomb', 51, [1, 2], ['uk', 'usa'], 'gp'], ['rl230', '230 lb RL bomb', 104, [1, 2], ['uk'], 'gp'],
  ['puw12', 'P.u.W. 12.5 kg bomb', 12.5, [1, 2], ['ger'], 'gp'], ['puw50', 'P.u.W. 50 kg bomb', 50, [1, 2], ['ger'], 'gp'], ['puw100', 'P.u.W. 100 kg bomb', 100, [1, 2], ['ger'], 'gp'], ['puw300', 'P.u.W. 300 kg bomb', 300, [1, 1], ['ger'], 'gp'],
  ['ga10', 'Gros-Andreau 10 kg bomb', 10, [1, 2], ['fra'], 'gp'], ['ga50', 'Gros-Andreau 50 kg bomb', 50, [1, 2], ['fra'], 'gp'],
  ['pood', '1 pood (16 kg) bomb', 16, [1, 2], ['ussr'], 'gp'], ['pood5', '5 pood (82 kg) bomb', 82, [1, 2], ['ussr'], 'gp'],
  // ---- between the wars
  ['m30', 'M30 100 lb GP bomb', 45, [2, 2], ['usa'], 'gp'], ['m31', 'M31 300 lb GP bomb', 136, [2, 2], ['usa'], 'gp'], ['m32', 'M32 600 lb GP bomb', 272, [2, 2], ['usa'], 'gp'], ['m33', 'M33 1100 lb GP bomb', 499, [2, 2], ['usa'], 'gp'],
  ['fra50', '50 kg G.P. bomb (French 1930s)', 50, [2, 3], ['fra'], 'gp'], ['fra200', '200 kg G.P. bomb (French 1930s)', 200, [2, 3], ['fra'], 'gp'], ['fra500', '500 kg G.P. bomb (French 1930s)', 500, [2, 3], ['fra'], 'gp'],
  ['type94_60', 'Type 97 No. 6 (60 kg)', 60, [2, 3], ['jpn'], 'gp'],
  // ---- WW2
  ['an_m30', 'AN-M30 100 lb GP bomb', 45, [3, 4], ['usa'], 'gp'], ['an_m57', 'AN-M57 250 lb GP bomb', 113, [3, 4], ['usa'], 'gp'], ['an_m64', 'AN-M64 500 lb GP bomb', 227, [3, 4], ['usa'], 'gp'],
  ['an_m65', 'AN-M65 1000 lb GP bomb', 454, [3, 4], ['usa'], 'gp'], ['an_m66', 'AN-M66 2000 lb GP bomb', 907, [3, 4], ['usa'], 'gp'], ['an_m1a2', 'AN-M1A2 cluster (6 x 20 lb frag)', 57, [3, 4], ['usa'], 'cl'],
  ['sc50', 'SC 50 bomb', 50, [2, 3], ['ger'], 'gp'], ['sc250', 'SC 250 bomb', 250, [2, 4], ['ger'], 'gp'], ['sc500', 'SC 500 bomb', 500, [3, 4], ['ger'], 'gp'], ['sd250', 'SD 250 fragmentation bomb', 250, [3, 4], ['ger'], 'ap'],
  ['sc1000', 'SC 1000 "Hermann"', 1000, [3, 4], ['ger'], 'gp'], ['sc1800', 'SC 1800 "Satan"', 1800, [3, 4], ['ger'], 'gp'], ['ab250', 'AB 250 container (SD 2 bomblets)', 250, [3, 4], ['ger'], 'cl'],
  ['gp250', '250 lb GP Mk IV', 113, [2, 4], ['uk'], 'gp'], ['mc500', '500 lb MC Mk II', 227, [3, 4], ['uk'], 'gp'], ['mc1000', '1000 lb MC Mk I', 454, [3, 4], ['uk'], 'gp'],
  ['hc4000', '4000 lb HC "Cookie"', 1810, [3, 4], ['uk'], 'hc'],
  ['fab50', 'FAB-50', 50, [2, 4], ['ussr'], 'gp'], ['fab100', 'FAB-100', 100, [2, 4], ['ussr'], 'gp'], ['fab250', 'FAB-250', 250, [2, 4], ['ussr'], 'gp'], ['fab500', 'FAB-500', 500, [3, 4], ['ussr'], 'gp'],
  ['fab1000', 'FAB-1000', 1000, [3, 4], ['ussr'], 'gp'], ['ptab', 'PTAB-2.5-1.5 cassettes (anti-tank)', 90, [3, 4], ['ussr'], 'cl'],
  ['t99_25', 'Type 98 No. 25 (250 kg)', 250, [3, 4], ['jpn'], 'gp'], ['t99_25ap', 'Type 99 No. 25 (250 kg SAP)', 250, [3, 4], ['jpn'], 'ap'], ['t99_80', 'Type 99 No. 80 (800 kg AP)', 800, [3, 3], ['jpn'], 'ap'], ['t92_50', 'Type 92 50 kg', 50, [3, 4], ['jpn'], 'gp'],
  // ---- Cold War and modern
  ['m117', 'M117 750 lb bomb', 340, [4, 6], ['usa'], 'gp'], ['mk81', 'Mk 81 250 lb', 119, [5, 7], 'west', 'gp'], ['mk82', 'Mk 82 500 lb', 241, [5, 7], 'west', 'gp'], ['mk82se', 'Mk 82 Snakeye (retarded)', 252, [5, 7], 'west', 'rt'],
  ['mk83', 'Mk 83 1000 lb', 447, [5, 7], 'west', 'gp'], ['mk84', 'Mk 84 2000 lb', 925, [5, 7], 'west', 'gp'], ['cbu87', 'CBU-87 Combined Effects Munition', 430, [6, 7], ['usa', 'uk', 'ger', 'jpn'], 'cl'],
  ['gbu12', 'GBU-12 Paveway II (500 lb laser-guided)', 277, [6, 7], 'west', 'lgb'], ['gbu10', 'GBU-10 Paveway II (2000 lb laser-guided)', 934, [6, 7], ['usa', 'uk'], 'lgb'],
  ['gbu38', 'GBU-38 JDAM (500 lb GPS-guided)', 253, [7, 7], ['usa', 'jpn'], 'gps'], ['gbu31', 'GBU-31 JDAM (2000 lb GPS-guided)', 934, [7, 7], ['usa'], 'gps'],
  ['uk1000', '1000 lb GP Mk 20', 454, [5, 7], ['uk'], 'gp'], ['bl755', 'BL755 cluster bomb', 277, [5, 7], ['uk', 'ger'], 'cl'], ['pw1000', 'Paveway II 1000 lb (laser-guided)', 450, [6, 7], ['uk'], 'lgb'],
  ['samp250', 'SAMP 250 kg bomb', 250, [5, 7], ['fra'], 'gp'], ['samp400', 'SAMP 400 kg bomb', 400, [5, 7], ['fra'], 'gp'], ['bap100', 'BAP 100 runway-cratering bomb', 32, [6, 7], ['fra'], 'ap'],
  ['belouga', 'BLG 66 Belouga cluster bomb', 305, [6, 7], ['fra'], 'cl'], ['aasm', 'AASM Hammer (250 kg guided)', 340, [7, 7], ['fra'], 'gps'],
  ['fab250m54', 'FAB-250M54', 268, [5, 6], ['ussr'], 'gp'], ['fab500m62', 'FAB-500M62', 500, [5, 7], ['ussr'], 'gp'], ['ofab250', 'OFAB-250-270', 266, [5, 7], ['ussr'], 'gp'],
  ['fab1500', 'FAB-1500M54', 1550, [5, 6], ['ussr'], 'gp'], ['rbk500', 'RBK-500 cluster bomb', 500, [6, 7], ['ussr'], 'cl'], ['kab500', 'KAB-500L (laser-guided)', 525, [6, 7], ['ussr'], 'lgb'], ['kab500s', 'KAB-500S (satellite-guided)', 560, [7, 7], ['ussr'], 'gps'],
];
for (const [id, name, kg, eras, who, type] of BOMB_LIST) {
  // blast: ~420 damage and 22 m at 50 kg, ~4300 and 62 m at 1000 kg; thin-cased HC bombs blast further, AP bombs less
  const k = { gp: [1, 1], hc: [1.45, 1.3], ap: [0.85, 0.7], cl: [0.75, 1.6], rt: [1, 1], lgb: [1.05, 1], gps: [1.05, 1] }[type];
  STORES[id] = { kind: 'b', name, mass: kg, eras, dmg: Math.round(420 * Math.pow(kg / 50, 0.777) * k[0]), rad: Math.round(8 * Math.pow(kg, 0.3) * k[1]), type,
    guided: type === 'lgb' || type === 'gps', price: Math.round(55 * Math.pow(kg, 0.55) * (1 + (eras[0] - 1) * 0.3) * (type === 'lgb' || type === 'gps' ? 2.4 : type === 'cl' ? 1.4 : 1) / 10) * 10,
    ...(Array.isArray(who) ? { nat: who } : { bloc: who }) };
}
// saves from before the named bombs: each old generic bomb becomes the nearest bomb by mass that the aircraft can carry
const OLD_BOMBS = { b50: 50, b100: 100, b250: 250, b500: 500, b1000: 1000 };
const KIND_NAMES = { b: 'Bombs', r: 'Rockets', m: 'Missiles', g: 'Gun pods' };

// ---- Airframe upgrades. Bought once per aircraft, then installed / removed freely.
const MODS = {
  engine:  { name: 'Engine overhaul', desc: '+7% engine power / thrust.', minEra: 1, price: e => 400 + e * e * 180 },
  airframe:{ name: 'Reinforced airframe', desc: '+15% structural strength, +0.6 G limit.', minEra: 1, price: e => 350 + e * e * 160 },
  armor:   { name: 'Pilot armour plate', desc: 'Steel plate behind the pilot stops most rifle-calibre rounds. +40 kg.', minEra: 2, price: e => 300 + e * e * 120 },
  sealing: { name: 'Self-sealing fuel tanks', desc: 'Rubber-lined tanks close bullet holes: leaks stop quickly.', minEra: 3, price: e => 500 + e * e * 140 },
  extinguisher: { name: 'Fire extinguisher', desc: 'Automatically tries to put out an engine fire (one charge).', minEra: 3, price: e => 500 + e * e * 120 },
  flares:  { name: 'Countermeasure dispenser', desc: 'Doubles the flare load (X to release).', minEra: 5, price: e => 1500 + e * e * 200 },
  radar:   { name: 'Improved radar', desc: '+25% missile lock range.', minEra: 5, price: e => 2000 + e * e * 250, needsRadar: true },
};
