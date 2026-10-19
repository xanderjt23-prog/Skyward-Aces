// node tools/audit_specs.mjs [--write]  -  configuration audit of the airframe registry (js/airframe.js)
//   --write: (re)assigns every aircraft's fuselageArchitecture from its real engine / tail layout, then audits
//
// Cross-checks every aircraft against an INDEPENDENT reference table of its defining layout
// (from the types' published descriptions / three-views), then applies geometric rules to the
// resolved airframe (the same spec the game builds models from). Exit code 1 if anything is flagged.
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const load = () => { const src = ['js/data.js', 'js/planes.js', 'js/bombers.js', 'js/airframe.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n');
  const c = { console, Math, JSON, Object, Array, Set, Map, Number, String, Error }; vm.createContext(c);
  vm.runInContext(src + '\n;globalThis.__out = { PLANE_LIST, PLANES, Airframe };', c); return c.__out; };
let ctxOut = load();

// ---------------------------------------------------------------- reference: defining layout of each type
// wing: B biplane | L low | LM low-to-mid | M mid | S shoulder | H high
// tail: 1 single | 2s twin upright | 2c twin canted | T T-tail | E end-plate fins | BOOM twin booms
// htail: F on the fuselage | C part-way up the fin (cruciform) | T fin top | N none (tailless) | B between booms
// intake: none | nose | box (rectangular ramp) | chin | cheek (half / quarter-round side) | vent (under the LERX) | root (wing root) | nacelle
// canard: 0 / 1     planform: S straight | MS mildly swept (10-25 deg) | V variable sweep (at its spread setting) | E elliptical | W swept | D delta | X diamond | G gull | IG inverted gull | K cranked
const REF = {
  // USA
  spad13us: 'B 1 F none 0 S', n28: 'B 1 F none 0 S', p12: 'B 1 F none 0 S', p26: 'L 1 F none 0 S', p40e: 'L 1 F none 0 S', p51d: 'L 1 F none 0 S',
  p47d: 'L 1 F none 0 E', p38l: 'M BOOM B none 0 S', f4u1d: 'L 1 F none 0 IG', f80c: 'L 1 F cheek 0 S', f86f: 'L 1 F nose 0 W', f100d: 'L 1 F nose 0 W',
  f4e: 'L 1 F box 0 K', f15c: 'S 2s F box 0 W', f16c: 'M 1 F chin 0 W', fa18e: 'M 2c F box 0 W', f22a: 'S 2c F box 0 X', b17g: 'L 1 F none 0 S',
  b29: 'M 1 F none 0 S', f105: 'M 1 F root 0 W', a4: 'L 1 C cheek 0 D', f15e: 'S 2s F box 0 W', dh4: 'B 1 F none 0 S', b10: 'M 1 F none 0 S',
  sbd: 'L 1 F none 0 S', b25j: 'M E F none 0 K', a1h: 'L 1 F none 0 S', a10a: 'L E F nacelle 0 K', f111f: 'S 1 F cheek 0 V',
  // Germany
  albd3: 'B 1 F none 0 S', dr1: 'B 1 F none 0 S', fd7: 'B 1 F none 0 S', he51: 'B 1 F none 0 S', bf109e: 'L 1 F none 0 S', bf109g: 'L 1 F none 0 S',
  fw190a: 'L 1 F none 0 S', me262: 'L 1 C nacelle 0 MS', sabre6: 'L 1 F nose 0 W', f104g: 'M T T cheek 0 W', mig21mf: 'M 1 F nose 0 D',
  mig29g: 'M 2c F vent 0 W', ef2000g: 'LM 1 N chin 1 D', gotha: 'B 1 F none 0 S', he111: 'L 1 F none 0 E', ju87: 'L 1 F none 0 IG',
  hannover: 'B 1 F none 0 S', do17: 'S E F none 0 S', ju88: 'LM 1 F none 0 S', bf110: 'L E F none 0 S', ar234: 'H 1 F nacelle 0 S',
  g91: 'L 1 F nose 0 W', tornadoids: 'S 1 F box 0 V',
  // Britain
  camel: 'B 1 F none 0 S', se5a: 'B 1 F none 0 S', gladiator: 'B 1 F none 0 S', hurri1: 'L 1 F none 0 S', spit9: 'L 1 F none 0 E',
  typhoon1b: 'L 1 F none 0 S', meteor8: 'LM 1 C nacelle 0 S', hunter6: 'M 1 C root 0 W', lightning: 'M 1 F nose 0 D', tornadof3: 'S 1 F box 0 V',
  ef2000uk: 'LM 1 N chin 1 D', ho400: 'B E F none 0 S', dh9a: 'B 1 F none 0 S', hart: 'B 1 F none 0 S', blenheim: 'M 1 F none 0 S',
  mosquito: 'M 1 F none 0 S', lancaster: 'M E F none 0 S', canberra: 'M 1 F nacelle 0 S', buccaneer: 'M T T nacelle 0 W', tornadogr1: 'S 1 F box 0 V',
  // USSR / Russia
  n17ru: 'B 1 F none 0 S', i15: 'B 1 F none 0 G', i16: 'L 1 F none 0 S', yak3: 'L 1 F none 0 S', la5fn: 'L 1 F none 0 S', il2: 'L 1 F none 0 K',
  mig15: 'M 1 C nose 0 W', mig17: 'M 1 C nose 0 W', mig21bis: 'M 1 F nose 0 D', mig23: 'S 1 F box 0 V', mig29: 'M 2c F vent 0 W',
  su27: 'M 2s F vent 0 W', su35s: 'M 2s F vent 0 W', su57: 'M 2c F vent 0 X', pe2: 'L E F none 0 S', tu16: 'M 1 F nacelle 0 W',
  su24: 'S 1 F box 0 V', muromets: 'B 1 F none 0 S', tb3: 'L 1 F none 0 S', sb2: 'M 1 F none 0 S', tu2: 'M E F none 0 S',
  il28: 'S 1 F nacelle 0 S', su7b: 'M 1 F nose 0 W', su25: 'S 1 F nacelle 0 MS', su34: 'M 2s F vent 1 W',
  // Japan
  n24ko3: 'B 1 F none 0 S', ki10: 'B 1 F none 0 S', ki27: 'L 1 F none 0 E', a6m2: 'L 1 F none 0 S', ki43: 'L 1 F none 0 S',
  n1k2: 'L 1 F none 0 S', ki84: 'L 1 F none 0 S', f86fj: 'L 1 F nose 0 W', f104j: 'M T T cheek 0 W', f4ej: 'L 1 F box 0 K', f15j: 'S 2s F box 0 W',
  f2a: 'M 1 F chin 0 W', ki21: 'M 1 F none 0 S', d3a: 'L 1 F none 0 E', b5n: 'L 1 F none 0 S', g4m: 'M 1 F none 0 S', ki45: 'M 1 F none 0 S',
  f1j: 'S 1 F box 0 W',
  // France
  n17: 'B 1 F none 0 S', spad13: 'B 1 F none 0 S', br14: 'B 1 F none 0 S', d510: 'L 1 F none 0 E', ms406: 'L 1 F none 0 S', d520: 'L 1 F none 0 S',
  ouragan: 'M 1 C nose 0 S', mystere4: 'M 1 C nose 0 W', mirage3c: 'L 1 N cheek 0 D', m2000c: 'L 1 N cheek 0 D', rafalec: 'LM 1 N cheek 1 D',
  amiot143: 'H 1 F none 0 S', leo451: 'L E F none 0 S', vautour: 'M 1 C nacelle 0 W', jaguar: 'S 1 F box 0 W', m2000d: 'L 1 N cheek 0 D',
};
const WING = { L: [0, .25], LM: [0, .6], M: [.3, .7], S: [.6, .95], H: [.85, 1] };
const TAIL = { '1': ['single_vertical'], '2s': ['twin_vertical_straight'], '2c': ['twin_vertical_canted'], T: ['t_tail'], E: ['twin_endplate'], BOOM: ['twin_boom'] };
const HT = { F: 'fuselage', C: 'fin_mid', T: 'fin_top', N: 'none', B: 'boom' };
const INTAKE = { none: 'none', nose: 'nose_cone', box: 'side_box', chin: 'chin_scoop', cheek: 'cheek_crescent', vent: 'ventral_box', root: 'wing_root', nacelle: 'nacelle' };
const PLAN = { S: ['trapezoid'], MS: ['trapezoid'], V: ['trapezoid'], E: ['elliptical', 'trapezoid'], W: ['trapezoid', 'cranked', 'diamond'], D: ['delta'], X: ['diamond'], G: ['gull'], IG: ['inverted_gull'], K: ['cranked'] };

// ---------------------------------------------------------------- fuselage architecture from the real engine / tail layout
//   CHINED_STEALTH     5th-generation stealth designs (diamond planform with a chined, faceted body: F-22, Su-57)
//   TWIN_NACELLE_DECK  two engines carried in separate, wide-spaced tunnels with a twin vertical tail on them
//                      (F-15, F/A-18E, MiG-29, Su-27 family) - i.e. two engines AND twin vertical tails
//   SINGLE_TUBE        everything else: one central fuselage (single engines, twin engines side by side under a
//                      single fin like the F-4 / Tornado / Typhoon, nacelle and propeller aircraft)
function architectureOf(pl) {
  const [, tail, , , , plan] = REF[pl.id].split(' ');
  if (plan === 'X' && pl.era >= 7) return 'CHINED_STEALTH';
  if (pl.kind === 'jet' && pl.eng === 2 && (tail === '2s' || tail === '2c')) return 'TWIN_NACELLE_DECK';
  return 'SINGLE_TUBE';
}
if (process.argv.includes('--write')) {
  const file = path.join(root, 'js/airframe.js'); let txt = fs.readFileSync(file, 'utf8'), n = 0;
  for (const pl of ctxOut.PLANE_LIST) {
    const re = new RegExp('(\\n    ' + pl.id + ': \\{ dims: \\{[^}]*\\}, )(fuselageArchitecture: \'\\w+\', )?');
    if (!re.test(txt)) { console.log('cannot find the entry for ' + pl.id); continue; }
    txt = txt.replace(re, (m0, head) => head + "fuselageArchitecture: '" + architectureOf(pl) + "', "); n++;
  }
  fs.writeFileSync(file, txt); console.log('fuselageArchitecture written for ' + n + ' aircraft'); ctxOut = load();
}
const { PLANE_LIST, Airframe } = ctxOut;
const flags = {};
const flag = (id, msg) => (flags[id] = flags[id] || []).push(msg);
for (const pl of PLANE_LIST) {
  const id = pl.id, e = Airframe.REGISTRY[id], ref = REF[id];
  if (!ref) { flag(id, 'no reference layout in the audit table'); continue; }
  if (!e) { flag(id, 'no registry entry'); continue; }
  let sp; try { sp = Airframe.spec(pl); } catch (err) { flag(id, 'spec() throws: ' + err.message); continue; }
  const [wing, tail, ht, intake, canard, plan] = ref.split(' ');
  if (e.fuselageArchitecture !== architectureOf(pl)) flag(id, `fuselageArchitecture "${e.fuselageArchitecture}" should be "${architectureOf(pl)}" (run with --write)`);
  // ---- 1. layout facts
  if (wing === 'B') { if (!e.biplane) flag(id, 'is a biplane but has no biplane block'); }
  else { const [lo, hi] = WING[wing]; if (e.wing.wingMountHeight < lo || e.wing.wingMountHeight > hi) flag(id, `wingMountHeight ${e.wing.wingMountHeight} does not match a ${({ L: 'low', LM: 'low/mid', M: 'mid', S: 'shoulder', H: 'high' })[wing]} wing (${lo}..${hi})`); }
  if (!TAIL[tail].includes(e.tailConfiguration)) flag(id, `tailConfiguration "${e.tailConfiguration}" should be "${TAIL[tail][0]}"`);
  if (e.horizontalTail !== HT[ht]) flag(id, `horizontalTail "${e.horizontalTail}" should be "${HT[ht]}"`);
  if (e.intakeProfile !== INTAKE[intake]) flag(id, `intakeProfile "${e.intakeProfile}" should be "${INTAKE[intake]}"`);
  if (e.canardPresence !== (canard === '1')) flag(id, `canardPresence ${e.canardPresence} should be ${canard === '1'}`);
  if (!PLAN[plan].includes(e.wing.planform)) flag(id, `wing planform "${e.wing.planform}" does not match a ${({ S: 'straight', MS: 'mildly swept', V: 'variable-sweep', E: 'elliptical', W: 'swept', D: 'delta', X: 'diamond', G: 'gull', IG: 'inverted-gull', K: 'cranked' })[plan]} wing`);
  if (plan === 'W' && e.wing.sweepLE < 25) flag(id, `swept wing with only ${e.wing.sweepLE} deg of leading-edge sweep`);
  if ((plan === 'S' || plan === 'E') && e.wing.sweepLE > 15) flag(id, `straight wing with ${e.wing.sweepLE} deg of sweep`);
  if (plan === 'MS' && (e.wing.sweepLE < 10 || e.wing.sweepLE > 25)) flag(id, `mildly swept wing with ${e.wing.sweepLE} deg`);
  if (plan === 'V' && (e.wing.sweepLE < 12 || e.wing.sweepLE > 30)) flag(id, `variable-sweep wing should be modelled at its spread setting (12..30 deg), not ${e.wing.sweepLE}`);
  if (plan === 'D' && e.wing.sweepLE < 30) flag(id, `delta with only ${e.wing.sweepLE} deg of sweep`);
  // ---- 2. geometry of the resolved airframe
  const R = sp.R, W = sp.W;
  if (e.fuselageArchitecture === 'TWIN_NACELLE_DECK') {
    const zf = sp.fins[0].zLE + sp.fins[0].rc * 0.4, tu = sp.tunnel.at(zf);
    if (Math.abs(Math.abs(sp.fins[0].x) - tu.x) > 0.05) flag(id, `deck fins at +/-${Math.abs(sp.fins[0].x).toFixed(2)} m are not on the tunnel centre lines (+/-${tu.x.toFixed(2)} m)`);
    if (Math.abs(sp.fins[0].base - (tu.y + tu.h)) > 0.15) flag(id, 'deck fins do not stand on the tunnel tops');
    if (tu.x - tu.w < sp.R * 0.5) flag(id, 'engine tunnels overlap the cockpit pod: they must be distinct, wide-spaced tunnels');
  } else if (e.fuselageArchitecture === 'CHINED_STEALTH') {
    const s0 = sp.at(sp.wing.rootZ + sp.wing.rc / 2), chineY = s0.y + e.chine.chineLevel * s0.h;
    if (Math.abs(sp.wing.y - chineY) > 0.05) flag(id, 'stealth wing root is not on the chine line');
    if (!(e.chine.topRatio < 0.7 && e.chine.bottomRatio < 0.8)) flag(id, 'chine section is not faceted (top / bottom faces too wide)');
  } else if (sp.fins.length === 2 && /^twin_vertical/.test(e.tailConfiguration)) {
    const fx = Math.abs(sp.fins[0].x), zf = sp.fins[0].zLE + sp.fins[0].rc * 0.4, local = sp.at(zf).w;
    const eng = sp.engines.filter(g => g.jet), outer = Math.max(...eng.map(g => Math.abs(g.x) + g.r * 0.5));
    if (fx < outer) flag(id, `twin fins at Â+/-${fx.toFixed(2)} m sit inboard of the engines (outer engine edge Â+/-${outer.toFixed(2)} m): they belong on the outer engine-bay edges / tail booms`);
    if (fx < local * 0.62) flag(id, `twin fins at Â+/-${fx.toFixed(2)} m are squeezed toward the spine (rear body half-width ${local.toFixed(2)} m): they belong near its outer edges`);
  }
  if (e.intakeProfile === 'side_box' || e.intakeProfile === 'cheek_crescent') {
    const zi = -pl.len / 2 + e.intake.at * pl.len, tr = sp.trunks(zi), outer = tr.length ? Math.max(...tr.map(p => Math.abs(p.x) + p.w)) : sp.at(zi).w; // the trunks exactly as the builder lofts them
    if (e.intakeProfile === 'side_box' && outer > W / 2 * 1.05) flag(id, `box intakes stick out to Â+/-${outer.toFixed(2)} m, beyond the body width Â+/-${(W / 2).toFixed(2)} m: the trunks should form the body sides`);
    if (e.intake.height < 0.5 && e.intakeProfile === 'side_box') flag(id, `box intake mouth only ${e.intake.height} m tall`);
  }
  if (!sp.bi) {
    const s0 = sp.at(sp.wing.rootZ + sp.wing.rc / 2), rel = (sp.wing.y - s0.y) / s0.h;
    if (wing === 'L' && rel > -0.3) flag(id, `low wing joins the body at ${(rel * 100).toFixed(0)}% of its half-depth (should be in the lower part)`);
    if ((wing === 'S' || wing === 'H') && rel < 0.3) flag(id, `${wing === 'S' ? 'shoulder' : 'high'} wing joins the body at ${(rel * 100).toFixed(0)}% of its half-depth (should be near the top)`);
  }
  // ---- 3. the 4-stage manufacturing pipeline (aircraft3d.js) fed by this entry
  const rng = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
  const inside = (q, x, y, m) => Math.pow(Math.abs((x - q.x) / (q.w * (m || 1))), q.n) + Math.pow(Math.abs((y - q.y) / (q.h * (m || 1))), q.n) <= 1;
  // stage 1: the deck / stealth centre is solid from the intakes to the tail
  if (e.fuselageArchitecture === 'TWIN_NACELLE_DECK') for (const z of rng(sp.tunnel.zA + 0.05, sp.tunnel.zB, 12)) {
    const pr = sp.section(z).prims, br = pr.find(p => p.part === 'bridge'), tu = pr.filter(p => p.part === 'tunnel');
    if (!br) { flag(id, `no bridging deck at z ${z.toFixed(1)} m: hollow gap between the tunnels`); break; }
    if (!tu.every(t => inside(t, Math.sign(t.x) * br.w * 0.98, br.y))) { flag(id, `bridging deck does not reach into the tunnels at z ${z.toFixed(1)} m`); break; }
  }
  if (e.fuselageArchitecture === 'CHINED_STEALTH') {
    for (const z of rng(-pl.len / 2 + 0.5, pl.len / 2, 20)) if (sp.chineW(z) < sp.at(z).w - 1e-6) { flag(id, 'chine narrower than the body at z ' + z.toFixed(1)); break; }
    if (sp.wing.x0 > sp.chineW(sp.wing.rootZ + sp.wing.rc / 2)) flag(id, 'wing root outside the chine: the chine must run into the wing');
  }
  // stage 2: blunt exhaust plane, every nozzle enclosed and open, side-by-side nozzles not overlapping, boom clear of the jets
  const fj = sp.engines.filter(g => g.kind === 'fus' || g.kind === 'tunnel');
  if (pl.kind === 'jet' && fj.length) {
    const pr = sp.section(sp.nozzleZ).prims;
    for (const g of fj) { const sx = g.rect ? 1.25 : 1, sy = g.rect ? 0.62 : 1, pts = [[g.x, g.y + g.r * sy], [g.x, g.y - g.r * sy], [g.x + g.r * sx, g.y], [g.x - g.r * sx, g.y]];
      if (!pts.every(([x, y]) => pr.some(q => inside(q, x, y, 1.001)))) flag(id, `nozzle at (${g.x.toFixed(2)}, ${g.y.toFixed(2)}) is not enclosed by the body at the exhaust plane`); }
    if (fj.length === 2) { const g = fj[0], gap = Math.hypot(fj[0].x - fj[1].x, fj[0].y - fj[1].y), need = 2 * g.r * (fj[0].x !== fj[1].x ? (g.rect ? 1.25 : 1) : (g.rect ? 0.62 : 1));
      if (gap < need - 1e-6) flag(id, `the two exhaust nozzles overlap (${gap.toFixed(2)} m apart, need ${need.toFixed(2)} m)`); }
    if (sp.boom) for (const z of rng(sp.nozzleZ + 0.05, pl.len / 2, 8)) { const b = sp.boom(z); if (b.y - b.h < Math.max(...fj.map(g => g.y + g.r)) - 1e-6) { flag(id, 'tail boom hangs down into the exhausts at z ' + z.toFixed(1)); break; } }
    // everything aft of the exhaust plane must still be carried: a central fin root by the fairing above the jets, fuselage tailplanes by side strakes
    if (e.fuselageArchitecture === 'SINGLE_TUBE' && sp.engines.some(g => g.kind === 'fus')) {
      for (const f of sp.fins) if (Math.abs(f.x) < 0.5 && f.zLE + f.rc > sp.nozzleZ + 0.15 && !(sp.boom && sp.boomEnd >= f.zLE + f.rc)) flag(id, 'fin root overhangs the exhausts with nothing under it');
      if (sp.stab && e.horizontalTail === 'fuselage' && sp.stab.zLE + sp.stab.rc * 0.5 > sp.nozzleZ && !sp.strakes) flag(id, 'tailplane root aft of the exhaust plane with nothing to carry it');
      if (sp.nozzleZ + Math.max(...fj.map(g => g.nl || 0)) > pl.len / 2 + 0.05) flag(id, 'nozzles stick out past the published overall length'); }
  }
  // stage 3: intake trunks sink back into the core where they end (no step); cranked outer panels really bent
  if (sp.intakeZ !== null && sp.trunks(sp.intakeZ).length) {
    const zEnd = sp.intakeZ + e.intake.length * pl.len + 0.12 * pl.len - 0.01, s = sp.at(zEnd);
    if (sp.trunks(zEnd).some(p => Math.abs(p.x) + p.w > s.w * 1.001)) flag(id, 'intake trunks do not sink into the fuselage where they end');
  }
  if (e.wing.outerWingDihedral !== null) { const a = sp.wingAt(e.wing.kinkSpan), b = sp.wingAt(1), want = Math.tan(e.wing.outerWingDihedral * Math.PI / 180) * (b.x - a.x);
    if (Math.abs((b.y - a.y) - want) > 0.02) flag(id, `outer wing panel rises ${(b.y - a.y).toFixed(2)} m, not the ${want.toFixed(2)} m of its ${e.wing.outerWingDihedral} deg outerWingDihedral`); }
  if (e.canardPresence && !(e.canardLength > 0.8 && e.canardLength < 3)) flag(id, `canard semi-span ${e.canardLength} m is implausible`);
  if (e.tailConfiguration === 'twin_vertical_canted' && !(e.finCantDeg >= 5 && e.finCantDeg <= 35)) flag(id, `fin cant ${e.finCantDeg} deg outside the real-world 5..35 deg range`);
}
const ids = Object.keys(flags);
console.log(`audited ${PLANE_LIST.length} aircraft against the reference layouts, geometry rules and 4-stage pipeline checks: ${ids.length} flagged\n`);
for (const id of ids) console.log(`${id} (${ctxOut.PLANES[id] ? ctxOut.PLANES[id].name : '?'}):\n  - ` + flags[id].join('\n  - '));
process.exitCode = ids.length ? 1 : 0;
