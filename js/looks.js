// ============================================================================
// What each aircraft actually looks like: the features that distinguish the
// real types, as tokens read by the model builder (aircraft3d.js) and by the
// shared layout (wing position, engine pods, tailplanes).
//   cockpit:  open | framed | razor (framed + razorback spine) | bubble | greenhouse (long framed) | sbs (side-by-side jet)
//   wing:     lowwing | midwing | shoulder | highwing ; ellip | invgull | gull | sesqui (small lower wing) | wire (wire-braced)
//   tail:     twinfin | ttail | cruciform | deltatail (delta wing that still has a tailplane) | f4 (anhedral tail, dihedral tips)
//   intakes:  noseint | chinint | sideint | rootint | ventint (under the wings) | pods (engines high on the rear fuselage)
//   other:    dorsal (fin fillet) | spats | tiptanks | hump | bellyscoop | chinrad | wingrad | stepped | roundnose (fully glazed nose) | anhedral
// ============================================================================
const LOOKS = {
  // ---- USA
  spad13us: 'open', n28: 'open', dh4: 'open', p12: 'open', p26: 'open lowwing wire spats',
  b10: 'greenhouse midwing roundnose', p40e: 'razor lowwing chinrad', p51d: 'bubble lowwing bellyscoop dorsal', p47d: 'bubble lowwing ellip dorsal',
  p38l: 'bubble midwing', f4u1d: 'framed lowwing invgull', sbd: 'greenhouse lowwing', b25j: 'stepped shoulder twinfin', b17g: 'stepped lowwing dorsal',
  b29: 'roundnose midwing dorsal', a1h: 'bubble lowwing dorsal', f80c: 'bubble lowwing sideint tiptanks', f86f: 'bubble lowwing noseint', f100d: 'bubble lowwing noseint',
  f105: 'bubble midwing rootint', a4: 'bubble lowwing deltatail sideint', f4e: 'framed lowwing sideint f4', f15c: 'bubble shoulder sideint', f16c: 'bubble midwing chinint',
  fa18e: 'bubble midwing sideint', f111f: 'sbs shoulder sideint', a10a: 'bubble lowwing twinfin pods', f22a: 'bubble midwing sideint', f15e: 'bubble shoulder sideint',
  // ---- Germany
  albd3: 'open sesqui', dr1: 'open', fd7: 'open', gotha: 'open', hannover: 'open', he51: 'open',
  do17: 'roundnose shoulder twinfin', bf109e: 'framed lowwing wingrad', bf109g: 'framed lowwing wingrad', fw190a: 'bubble lowwing', me262: 'bubble lowwing',
  he111: 'roundnose lowwing ellip', ju87: 'greenhouse lowwing invgull spats', ju88: 'roundnose midwing', bf110: 'greenhouse lowwing twinfin', ar234: 'roundnose shoulder',
  sabre6: 'bubble lowwing noseint', f104g: 'bubble midwing ttail sideint anhedral', mig21mf: 'bubble midwing deltatail noseint', g91: 'bubble lowwing noseint',
  mig29g: 'bubble midwing ventint', tornadoids: 'framed shoulder sideint', ef2000g: 'bubble lowwing chinint',
  // ---- Britain
  camel: 'open hump', se5a: 'open', dh9a: 'open', ho400: 'open', gladiator: 'framed', hart: 'open',
  hurri1: 'razor lowwing bellyscoop', spit9: 'bubble lowwing ellip wingrad', typhoon1b: 'bubble lowwing chinrad', blenheim: 'roundnose midwing',
  mosquito: 'framed shoulder', lancaster: 'stepped midwing twinfin', meteor8: 'bubble lowwing cruciform', hunter6: 'bubble midwing rootint',
  canberra: 'bubble midwing', lightning: 'bubble midwing noseint', buccaneer: 'framed midwing ttail sideint', tornadof3: 'framed shoulder sideint',
  tornadogr1: 'framed shoulder sideint', ef2000uk: 'bubble lowwing chinint',
  // ---- USSR / Russia
  n17ru: 'open sesqui', muromets: 'greenhouse', i15: 'open gull', i16: 'open lowwing', tb3: 'open lowwing',
  sb2: 'roundnose midwing', yak3: 'bubble lowwing bellyscoop', la5fn: 'framed lowwing', il2: 'greenhouse lowwing', pe2: 'greenhouse lowwing twinfin',
  tu2: 'greenhouse midwing twinfin', mig15: 'bubble midwing noseint', mig17: 'bubble midwing noseint', il28: 'stepped shoulder', mig21bis: 'bubble midwing deltatail noseint',
  su7b: 'bubble midwing noseint', mig23: 'bubble shoulder sideint', tu16: 'stepped midwing rootint', mig29: 'bubble midwing ventint', su27: 'bubble midwing ventint',
  su24: 'sbs shoulder sideint', su25: 'bubble shoulder sideint', su35s: 'bubble midwing ventint', su57: 'bubble midwing sideint', su34: 'sbs midwing ventint',
  // ---- Japan
  n24ko3: 'open sesqui', ki10: 'open', ki27: 'framed lowwing spats', ki21: 'roundnose midwing', a6m2: 'greenhouse lowwing',
  ki43: 'framed lowwing', n1k2: 'framed midwing', ki84: 'bubble lowwing', d3a: 'greenhouse lowwing ellip spats', b5n: 'greenhouse lowwing',
  g4m: 'roundnose midwing', ki45: 'greenhouse midwing', f86fj: 'bubble lowwing noseint', f104j: 'bubble midwing ttail sideint anhedral', f4ej: 'framed lowwing sideint f4',
  f15j: 'bubble shoulder sideint', f1j: 'framed shoulder sideint', f2a: 'bubble midwing chinint',
  // ---- France
  n17: 'open sesqui', spad13: 'open', br14: 'open', d510: 'open lowwing spats', amiot143: 'roundnose highwing',
  ms406: 'framed lowwing', d520: 'framed lowwing', leo451: 'roundnose midwing twinfin', ouragan: 'bubble midwing noseint tiptanks', mystere4: 'bubble midwing noseint',
  vautour: 'roundnose shoulder', mirage3c: 'bubble lowwing sideint', jaguar: 'framed shoulder sideint', m2000c: 'bubble lowwing sideint', m2000d: 'bubble lowwing sideint',
  rafalec: 'bubble lowwing chinint',
};
function look(pl) {
  if (pl._look) return pl._look;
  const t = new Set((LOOKS[pl.id] || '').split(' ').filter(Boolean));
  // sensible defaults where the table says nothing
  if (![...t].some(x => ['open', 'framed', 'razor', 'bubble', 'greenhouse', 'sbs', 'stepped', 'roundnose'].includes(x)))
    t.add(pl.era === 1 || pl.shape === 'bi' || pl.shape === 'tri' ? 'open' : pl.role === 'bomber' && pl.kind !== 'jet' ? 'stepped' : pl.kind === 'jet' || pl.era >= 3 ? 'bubble' : 'framed');
  if (pl.kind === 'jet' && ![...t].some(x => ['noseint', 'chinint', 'sideint', 'rootint', 'ventint', 'pods'].includes(x)) && pl.shape !== 'jet_s2' && pl.shape !== 'jet_bomber') t.add('sideint');
  return (pl._look = t);
}
