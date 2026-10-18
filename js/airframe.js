// ============================================================================
// Airframes: a parametric description of every aircraft, built from explicit
// sub-components lined up on the central axis (nose -Z, tail +Z, up +Y):
//   fuselage  - cross-section stations along the axis (superellipse sections)
//   wing      - root/tip chords, leading-edge sweep, dihedral (with a kink for
//               gull / cranked wings), position on the fuselage, airfoil thickness
//   stab      - horizontal tail (on the fuselage, on the fin, or none)
//   fins      - single, twin on the body, or end plates on the tailplane tips
//   engines   - propeller, jet in the fuselage, nacelles, pods
//   intakes, nozzles, canopy, extras (canards, LERX, booms, ventral fins...)
// Numbers come from each type's general-arrangement (three-view) proportions and
// are given as fractions: lengths along the axis of the aircraft length L, the
// fuselage half-width R of L, cross-sections of R, spans of the wing span S.
// spec(pl) resolves everything to metres; the model builder and the shared
// layout (damage boxes, gear, stores, cockpit eye) both read the same spec.
// ============================================================================
const Airframe = (() => {
  const D = Math.PI / 180;
  // ---- fuselage section templates: [t (0 nose .. 1 tail), half-width, half-height, centre-line height] in units of R
  const FUS = {
    inline:  [[0, .42, .5, -.02], [.04, .74, .9, 0], [.13, .92, 1.15, .02], [.27, 1, 1.32, .08], [.42, .96, 1.3, .1], [.62, .66, .98, .14], [.84, .32, .58, .2], [.97, .13, .3, .24], [1, .07, .16, .25]],
    radial:  [[0, .9, .9, 0], [.03, .98, .98, 0], [.13, 1, 1, 0], [.28, 1, 1.06, .04], [.44, .92, 1.08, .08], [.64, .6, .82, .12], [.86, .28, .44, .18], [1, .07, .14, .22]],
    biplane: [[0, .82, .88, 0], [.12, 1, 1, 0], [.3, 1, 1.04, .02], [.55, .72, .84, .06], [.85, .3, .44, .1], [1, .06, .12, .12]],
    bomber:  [[0, .32, .34, -.05], [.04, .74, .8, -.02], [.12, .94, 1.04, 0], [.22, 1, 1.12, 0], [.6, .96, 1.1, 0], [.82, .58, .76, .08], [.96, .25, .4, .14], [1, .14, .24, .15]],
    glazed:  [[0, .18, .18, -.1], [.025, .6, .6, -.06], [.08, .9, .92, -.02], [.18, 1, 1.08, 0], [.6, .96, 1.08, 0], [.82, .58, .76, .08], [.96, .25, .4, .14], [1, .14, .24, .15]],
    // jets: nose intake + tail nozzle / radar nose + tail nozzle / slender (engines elsewhere, tail closes)
    jetNose: [[0, .84, .88, 0], [.08, .95, .99, 0], [.3, 1, 1.06, .02], [.62, .93, .98, .02], [.86, .8, .83, .02], [1, .72, .74, 0]],
    jetOval: [[0, .9, .62, -.05], [.08, .98, .86, 0], [.3, 1, 1.02, .02], [.62, .93, .96, .02], [.86, .8, .82, .02], [1, .7, .72, 0]],
    jetRadar:[[0, .02, .02, -.04], [.04, .3, .3, -.04], [.12, .58, .58, -.02], [.22, .82, .82, 0], [.34, 1, .98, 0], [.62, 1, .98, 0], [.86, .86, .84, 0], [1, .72, .72, 0]],
    jetGun:  [[0, .3, .3, -.05], [.04, .58, .6, -.03], [.12, .82, .84, 0], [.25, 1, 1, 0], [.62, .96, .98, .02], [.86, .8, .82, .02], [1, .66, .68, 0]],
    jetBlend:[[0, .02, .02, -.08], [.05, .3, .3, -.07], [.13, .52, .5, -.04], [.22, .7, .68, 0], [.3, 1.1, .78, 0], [.45, 1.6, .8, 0], [.8, 1.6, .76, 0], [.95, 1.35, .66, 0], [1, 1.2, .6, 0]],
    jetF16:  [[0, .02, .02, -.05], [.05, .3, .3, -.04], [.12, .55, .55, -.02], [.2, .72, .72, 0], [.3, .92, .8, .02], [.45, 1.2, .8, .02], [.7, 1.08, .78, .02], [.9, .78, .74, 0], [1, .64, .64, 0]],
    jetSlim: [[0, .04, .04, -.05], [.05, .36, .38, -.04], [.14, .66, .7, -.02], [.28, .92, .96, 0], [.42, 1, 1, 0], [.75, .94, .98, .04], [.95, .44, .52, .1], [1, .14, .18, .14]],
    jetPod:  [[0, .02, .02, -.05], [.06, .4, .42, -.03], [.16, .72, .74, 0], [.3, .92, .96, 0], [.42, 1, 1, 0], [.72, .9, .94, .04], [.94, .38, .46, .14], [1, .12, .16, .16]],
    jetGlaze:[[0, .2, .2, -.1], [.03, .6, .62, -.06], [.1, .9, .92, -.02], [.22, 1, 1, 0], [.7, .92, .96, .04], [.94, .38, .46, .14], [1, .12, .16, .16]],
    // types with a shape of their own
    a10:     [[0, .4, .55, -.12], [.04, .7, .85, -.06], [.12, .92, 1.05, 0], [.28, 1, 1.12, .02], [.5, .9, 1.04, .08], [.72, .58, .78, .16], [.9, .32, .44, .28], [1, .12, .16, .32]],
    me262:   [[0, .2, .24, -.1], [.05, .6, .66, -.06], [.14, .9, .94, -.02], [.32, 1, 1.02, 0], [.6, .84, .92, .04], [.88, .4, .5, .12], [1, .16, .24, .16]],
    f4:      [[0, .02, .02, -.06], [.05, .34, .34, -.05], [.14, .62, .62, -.02], [.24, .82, .86, 0], [.4, 1, 1.05, 0], [.66, .96, 1, .06], [.8, .7, .82, .2], [.94, .36, .5, .38], [1, .24, .34, .42]],
    flanker: [[0, .02, .02, -.08], [.05, .32, .32, -.07], [.14, .55, .55, -.04], [.24, .74, .74, 0], [.36, 1.1, .82, .04], [.5, 1.3, .8, .06], [.7, .9, .64, .08], [.88, .5, .46, .1], [1, .32, .32, .1]],
    lightning:[[0, .8, 1.05, 0], [.08, .9, 1.18, 0], [.3, 1, 1.35, .05], [.62, .96, 1.32, .05], [.86, .86, 1.2, .05], [1, .8, 1.15, .05]],
    bucc:    [[0, .02, .02, -.05], [.05, .38, .4, -.03], [.14, .7, .74, 0], [.3, .96, 1, 0], [.45, .82, .96, 0], [.62, 1, 1.02, .02], [.85, .7, .76, .06], [.97, .3, .34, .1], [1, .14, .16, .1]],
    p38pod:  [[0, .3, .32, 0], [.05, .66, .7, 0], [.14, .92, .96, 0], [.3, 1, 1.05, .02], [.5, .9, .98, .04], [.6, .6, .7, .06], [.64, .3, .4, .08], [.66, .12, .16, .08]],
  };
  // per-type parameters (anything not given comes from the class defaults below)
  //  fus: template, R: half-width / L, n: section squareness (2 ellipse .. 4 box)
  //  wing: x root LE / L from the nose, c root chord / L, tr taper, sw LE sweep, te TE sweep (overrides tr), dih, kink [span f, inner, outer dih],
  //        pos root height in local half-heights (-1 bottom .. 1 top), t thickness, ellip, tiptanks, fences, droop (drooped tips)
  //  stab: x, hs half-span / L, c, tr, sw, dih, y (R units) or fin: fraction up the fin; null = none
  //  fin:  x, h height above the fuselage top / L, c, tr, sw, cant, twin: 'body' (xo in R) | 'tips', below, ventral, dorsal
  //  eng:  nacelles / pods; nz: nozzles [x in R, y in R]; intake: type (nose|rect|semi|chin|vent|root|round), z, len, w, h (R units)
  //  canopy: z centre / L from the nose, len / L, type, w, h (R units)
  const T = {
    // ---------------- early jets
    f80c:   { fus: 'jetGun', R: .066, wing: { x: .36, c: .24, tr: .45, sw: 4, dih: 5, pos: -.5, t: .13, tiptanks: true }, intake: { type: 'semi', z: .3, len: .22, w: .45, h: .75, y: -.05 }, stab: { x: .85, hs: .17, c: .09, tr: .6, sw: 8, y: .2 }, fin: { x: .8, h: .15, c: .15, tr: .45, sw: 30 }, canopy: { z: .22, len: .15, type: 'bubble' } },
    f86f:   { fus: 'jetNose', R: .072, wing: { x: .38, c: .28, tr: .5, sw: 37, dih: 3, pos: -.45, t: .1 }, stab: { x: .84, hs: .17, c: .1, tr: .5, sw: 35, y: .3 }, fin: { x: .76, h: .17, c: .2, tr: .4, sw: 40 }, canopy: { z: .25, len: .16, type: 'bubble' } },
    mig15:  { fus: 'jetNose', R: .072, wing: { x: .37, c: .29, tr: .5, sw: 37, dih: -2, pos: .1, t: .1, fences: 2 }, stab: { x: .86, hs: .16, c: .1, tr: .5, sw: 40, fin: .55 }, fin: { x: .72, h: .2, c: .23, tr: .4, sw: 56 }, canopy: { z: .27, len: .14, type: 'bubble' } },
    mig17:  { fus: 'jetNose', R: .066, wing: { x: .38, c: .3, tr: .45, sw: 45, dih: -3, pos: .1, t: .08, fences: 3 }, stab: { x: .86, hs: .15, c: .1, tr: .5, sw: 45, fin: .5 }, fin: { x: .72, h: .19, c: .23, tr: .4, sw: 56 }, canopy: { z: .26, len: .13, type: 'bubble' } },
    ouragan:{ fus: 'jetNose', R: .075, wing: { x: .36, c: .25, tr: .55, sw: 14, dih: 2, pos: 0, t: .1, tiptanks: true }, stab: { x: .84, hs: .17, c: .1, tr: .6, sw: 15, fin: .35 }, fin: { x: .76, h: .17, c: .2, tr: .45, sw: 35 }, canopy: { z: .25, len: .15, type: 'bubble' } },
    mystere4:{ fus: 'jetNose', R: .066, wing: { x: .39, c: .27, tr: .45, sw: 41, dih: 0, pos: 0, t: .075 }, stab: { x: .86, hs: .15, c: .1, tr: .5, sw: 42, fin: .4 }, fin: { x: .74, h: .17, c: .21, tr: .4, sw: 45 }, canopy: { z: .25, len: .15, type: 'bubble' } },
    g91:    { fus: 'jetOval', R: .07, wing: { x: .4, c: .28, tr: .5, sw: 37, dih: 2, pos: -.45, t: .09 }, stab: { x: .85, hs: .15, c: .1, tr: .5, sw: 35, y: .2 }, fin: { x: .75, h: .17, c: .2, tr: .4, sw: 40 }, canopy: { z: .25, len: .15, type: 'bubble' } },
    hunter6:{ fus: 'jetRadar', R: .07, wing: { x: .38, c: .32, tr: .35, sw: 40, dih: -1, pos: 0, t: .085 }, intake: { type: 'root' }, stab: { x: .85, hs: .13, c: .09, tr: .45, sw: 40, fin: .22 }, fin: { x: .74, h: .17, c: .2, tr: .4, sw: 45 }, canopy: { z: .2, len: .14, type: 'bubble' } },
    meteor8:{ fus: 'jetPod', R: .058, wing: { x: .38, c: .22, tr: .55, sw: 4, dih: 4, pos: -.2, t: .12 }, eng: { type: 'wingnac', x: .155, r: .056, len: .34, z: .4 }, stab: { x: .87, hs: .16, c: .09, tr: .6, sw: 12, fin: .38 }, fin: { x: .8, h: .14, c: .15, tr: .55, sw: 25 }, canopy: { z: .2, len: .14, type: 'bubble' } },
    me262:  { fus: 'me262', R: .064, wing: { x: .4, c: .26, tr: .45, sw: 18, dih: 6, pos: -.6, t: .11 }, eng: { type: 'underwing', x: .165, r: .055, len: .33, z: .42 }, stab: { x: .86, hs: .14, c: .1, tr: .55, sw: 12, y: .55 }, fin: { x: .82, h: .13, c: .15, tr: .45, sw: 25, below: .25 }, canopy: { z: .43, len: .16, type: 'framed' } },
    ar234:  { fus: 'jetGlaze', R: .052, wing: { x: .38, c: .23, tr: .55, sw: 3, dih: 3, pos: .85, t: .13 }, eng: { type: 'underwing', x: .2, r: .052, len: .3, z: .4 }, stab: { x: .86, hs: .15, c: .09, tr: .55, sw: 8, y: .3 }, fin: { x: .8, h: .14, c: .15, tr: .5, sw: 25 }, canopy: { type: 'glazednose' } },
    canberra:{ fus: 'jetSlim', R: .052, wing: { x: .35, c: .3, tr: .45, sw: 10, dih: 2, pos: 0, t: .12 }, eng: { type: 'wingnac', x: .15, r: .042, len: .26, z: .4 }, stab: { x: .87, hs: .13, c: .1, tr: .55, sw: 12, dih: 10, y: .3 }, fin: { x: .8, h: .13, c: .19, tr: .5, sw: 30 }, canopy: { z: .14, len: .09, type: 'bubble', x: -.25 } },
    il28:   { fus: 'jetGlaze', R: .052, wing: { x: .38, c: .22, tr: .55, sw: 3, dih: 2, pos: .6, t: .13 }, eng: { type: 'underwing', x: .15, r: .045, len: .26, z: .4 }, stab: { x: .86, hs: .14, c: .1, tr: .45, sw: 35, y: .3 }, fin: { x: .78, h: .14, c: .2, tr: .4, sw: 40 }, canopy: { z: .2, len: .1, type: 'bubble' } },
    vautour:{ fus: 'jetGlaze', R: .06, wing: { x: .38, c: .26, tr: .45, sw: 35, dih: 0, pos: 0, t: .09 }, eng: { type: 'underwing', x: .2, r: .046, len: .3, z: .42 }, stab: { x: .86, hs: .15, c: .1, tr: .5, sw: 40, fin: .55 }, fin: { x: .74, h: .17, c: .22, tr: .4, sw: 45 }, canopy: { z: .2, len: .12, type: 'bubble' } },
    tu16:   { fus: 'jetGlaze', R: .052, wing: { x: .38, c: .17, tr: .4, sw: 37, dih: -3, pos: 0, t: .12 }, eng: { type: 'rootnac', r: .042, len: .28, z: .38 }, stab: { x: .87, hs: .14, c: .08, tr: .45, sw: 42, y: .2 }, fin: { x: .78, h: .14, c: .16, tr: .4, sw: 45 }, canopy: { z: .1, len: .07, type: 'bubble' } },
    // ---------------- 1950s-60s
    f100d:  { fus: 'jetOval', R: .055, wing: { x: .38, c: .3, tr: .35, sw: 49, dih: 0, pos: -.5, t: .07 }, stab: { x: .86, hs: .16, c: .11, tr: .4, sw: 45, y: -.3 }, fin: { x: .72, h: .17, c: .24, tr: .35, sw: 45 }, canopy: { z: .22, len: .13, type: 'bubble' } },
    f104g:  { fus: 'jetRadar', R: .045, wing: { x: .48, c: .17, tr: .4, sw: 27, dih: -10, pos: -.1, t: .034 }, intake: { type: 'semi', z: .37, len: .24, w: .45, h: .85 }, stab: { x: .86, hs: .13, c: .1, tr: .5, sw: 10, fin: 1 }, fin: { x: .78, h: .17, c: .2, tr: .5, sw: 40 }, canopy: { z: .2, len: .12, type: 'framed' } },
    mig21bis:{ fus: 'jetNose', R: .05, n: 2, wing: { x: .45, c: .38, tr: .03, sw: 57, dih: -2, pos: 0, t: .05 }, stab: { x: .87, hs: .1, c: .08, tr: .35, sw: 55, y: -.1 }, fin: { x: .7, h: .17, c: .22, tr: .3, sw: 60, ventral: true, dorsal: true }, canopy: { z: .27, len: .12, type: 'framed' }, cone: true },
    su7b:   { fus: 'jetNose', R: .055, wing: { x: .45, c: .3, tr: .3, sw: 60, dih: -2, pos: 0, t: .06, fences: 2 }, stab: { x: .87, hs: .12, c: .09, tr: .35, sw: 55, y: -.2 }, fin: { x: .74, h: .17, c: .2, tr: .3, sw: 55, dorsal: true }, canopy: { z: .27, len: .12, type: 'framed' }, cone: true },
    lightning:{ fus: 'lightning', R: .05, wing: { x: .45, c: .4, tr: .3, sw: 60, dih: 0, pos: 0, t: .05 }, stab: { x: .88, hs: .12, c: .1, tr: .4, sw: 60, y: -.6 }, fin: { x: .74, h: .15, c: .23, tr: .35, sw: 55 }, nz: [[0, .55], [0, -.45]], canopy: { z: .22, len: .13, type: 'framed' }, cone: true, belly: true },
    f105:   { fus: 'jetRadar', R: .055, wing: { x: .44, c: .27, tr: .4, sw: 48, dih: -3, pos: .05, t: .05 }, intake: { type: 'root' }, stab: { x: .88, hs: .13, c: .11, tr: .4, sw: 45, y: -.3 }, fin: { x: .7, h: .16, c: .27, tr: .3, sw: 50 }, canopy: { z: .2, len: .1, type: 'framed' } },
    a4:     { fus: 'jetRadar', R: .075, wing: { x: .4, c: .42, tr: .2, sw: 33, dih: 0, pos: -.5, t: .06 }, intake: { type: 'semi', z: .27, len: .22, w: .5, h: .8 }, stab: { x: .86, hs: .14, c: .1, tr: .45, sw: 25, fin: .3 }, fin: { x: .72, h: .2, c: .23, tr: .4, sw: 35 }, canopy: { z: .2, len: .14, type: 'bubble' } },
    mirage3c:{ fus: 'jetRadar', R: .055, wing: { x: .4, c: .56, tr: .04, sw: 60, dih: 0, pos: -.4, t: .045 }, intake: { type: 'semi', z: .3, len: .3, w: .55, h: .9, cone: true }, stab: null, fin: { x: .72, h: .18, c: .25, tr: .3, sw: 50 }, canopy: { z: .22, len: .14, type: 'framed' } },
    f4e:    { fus: 'f4', R: .062, wing: { x: .4, c: .3, tr: .3, sw: 45, kink: [.6, 0, 12], pos: -.55, t: .05 }, intake: { type: 'rect', z: .22, len: .36, w: .55, h: 1.05, splitter: true }, stab: { x: .88, hs: .14, c: .1, tr: .45, sw: 43, dih: -23, y: .7 }, fin: { x: .76, h: .15, c: .2, tr: .35, sw: 50 }, nz: [[-.55, -.25], [.55, -.25]], nzz: .8, canopy: { z: .21, len: .2, type: 'framed' } },
    mig23:  { fus: 'jetRadar', R: .056, wing: { x: .45, c: .25, tr: .3, sw: 45, dih: -3, pos: .7, t: .05, glove: true }, intake: { type: 'rect', z: .27, len: .35, w: .55, h: 1.0, splitter: true }, stab: { x: .87, hs: .15, c: .12, tr: .35, sw: 55, y: 0 }, fin: { x: .7, h: .17, c: .27, tr: .3, sw: 55, dorsal: true, ventral: true }, canopy: { z: .2, len: .12, type: 'framed' } },
    buccaneer:{ fus: 'bucc', R: .062, wing: { x: .42, c: .3, tr: .45, sw: 40, dih: -1, pos: -.1, t: .08 }, eng: { type: 'rootnac', r: .042, len: .32, z: .38 }, stab: { x: .88, hs: .12, c: .1, tr: .5, sw: 35, fin: 1 }, fin: { x: .76, h: .15, c: .22, tr: .5, sw: 40 }, canopy: { z: .18, len: .2, type: 'framed' } },
    jaguar: { fus: 'jetRadar', R: .055, wing: { x: .45, c: .25, tr: .3, sw: 40, dih: -3, pos: .75, t: .05 }, intake: { type: 'rect', z: .3, len: .32, w: .5, h: .95 }, stab: { x: .86, hs: .14, c: .1, tr: .35, sw: 40, dih: -10, y: .1 }, fin: { x: .72, h: .16, c: .23, tr: .3, sw: 45 }, nz: [[-.5, -.35], [.5, -.35]], canopy: { z: .2, len: .13, type: 'framed' } },
    // ---------------- modern
    f15c:   { fus: 'jetBlend', R: .055, n: 3, wing: { x: .38, c: .34, tr: .27, sw: 45, dih: -1, pos: .6, t: .05 }, intake: { type: 'rect', z: .2, len: .42, w: .7, h: 1.25, rake: .5 }, stab: { x: .87, hs: .14, c: .14, tr: .35, sw: 50, y: 0 }, fin: { twin: 'body', xo: 1.15, x: .8, h: .16, c: .17, tr: .45, sw: 36 }, nz: [[-.62, 0], [.62, 0]], canopy: { z: .2, len: .14, type: 'bubble' } },
    f16c:   { fus: 'jetF16', R: .055, wing: { x: .42, c: .3, tr: .23, sw: 40, dih: 0, pos: 0, t: .04 }, lerx: true, intake: { type: 'chin', z: .26, len: .36, w: .75, h: .55 }, stab: { x: .87, hs: .17, c: .11, tr: .35, sw: 40, dih: -10, y: 0 }, fin: { x: .76, h: .15, c: .2, tr: .4, sw: 47, ventral: true }, canopy: { z: .2, len: .17, type: 'bubble', frameless: true } },
    fa18e:  { fus: 'jetBlend', R: .05, n: 2.6, wing: { x: .43, c: .27, tr: .35, sw: 28, dih: -3, pos: .25, t: .05 }, lerx: true, intake: { type: 'rect', z: .34, len: .3, w: .55, h: .85, y: -.35, rake: .4 }, stab: { x: .86, hs: .16, c: .12, tr: .4, sw: 42, y: 0 }, fin: { twin: 'body', xo: .95, cant: 20, x: .72, h: .15, c: .17, tr: .4, sw: 35 }, nz: [[-.5, 0], [.5, 0]], canopy: { z: .2, len: .15, type: 'bubble' } },
    f22a:   { fus: 'jetBlend', R: .06, n: 3.2, wing: { x: .42, c: .38, sw: 42, te: -17, dih: -3, pos: .35, t: .04 }, intake: { type: 'rect', z: .25, len: .4, w: .62, h: 1.1, rake: .6, caret: true }, stab: { x: .86, hs: .15, c: .14, sw: 42, te: -17, y: 0 }, fin: { twin: 'body', xo: 1.0, cant: 28, x: .73, h: .14, c: .2, tr: .4, sw: 22 }, nz: [[-.5, 0], [.5, 0]], nzRect: true, canopy: { z: .2, len: .16, type: 'bubble', frameless: true } },
    mig29:  { fus: 'flanker', R: .05, n: 2.6, wing: { x: .43, c: .3, tr: .25, sw: 42, dih: -2, pos: .2, t: .05 }, lerx: true, eng: { type: 'nacelle', x: 1.3, r: .042, z0: .3, z1: .98 }, intake: { type: 'vent', z: .3, len: .2, w: .62, h: .7 }, stab: { x: .87, hs: .17, c: .13, tr: .35, sw: 45, y: -.1, root: 2.0 }, fin: { twin: 'body', xo: 1.7, cant: 6, x: .74, h: .15, c: .17, tr: .4, sw: 40 }, nz: [[-1.3, -.4], [1.3, -.4]], canopy: { z: .2, len: .13, type: 'bubble' } },
    su27:   { fus: 'flanker', R: .046, n: 2.6, wing: { x: .44, c: .28, tr: .23, sw: 42, dih: -2, pos: .2, t: .05, tiprail: true }, lerx: true, eng: { type: 'nacelle', x: 1.45, r: .038, z0: .3, z1: .97 }, intake: { type: 'vent', z: .3, len: .22, w: .62, h: .75 }, stab: { x: .87, hs: .17, c: .12, tr: .35, sw: 45, y: -.1, root: 2.2 }, fin: { twin: 'body', xo: 2.0, cant: 0, x: .74, h: .14, c: .16, tr: .4, sw: 40 }, nz: [[-1.45, -.4], [1.45, -.4]], canopy: { z: .18, len: .12, type: 'bubble' } },
    su57:   { fus: 'flanker', R: .052, n: 3.2, wing: { x: .42, c: .34, sw: 48, te: -14, dih: -2, pos: .2, t: .04 }, lerx: true, eng: { type: 'nacelle', x: 1.4, r: .042, z0: .28, z1: .97 }, intake: { type: 'vent', z: .28, len: .26, w: .66, h: .85, rake: .4 }, stab: { x: .87, hs: .16, c: .13, sw: 45, te: -10, y: -.1, root: 2.1 }, fin: { twin: 'body', xo: 1.8, cant: 26, x: .76, h: .12, c: .17, tr: .4, sw: 45 }, nz: [[-1.4, -.4], [1.4, -.4]], canopy: { z: .19, len: .13, type: 'bubble', frameless: true } },
    su34:   { fus: 'flanker', R: .05, n: 2.8, wing: { x: .44, c: .27, tr: .23, sw: 42, dih: -2, pos: .2, t: .05 }, lerx: true, canards: { z: .3, hs: .08, c: .07 }, eng: { type: 'nacelle', x: 1.45, r: .036, z0: .32, z1: .97 }, intake: { type: 'vent', z: .32, len: .2, w: .62, h: .72 }, stab: { x: .87, hs: .16, c: .11, tr: .35, sw: 45, y: -.1, root: 2.2 }, fin: { twin: 'body', xo: 2.0, x: .75, h: .13, c: .15, tr: .4, sw: 40 }, nz: [[-1.45, -.4], [1.45, -.4]], canopy: { z: .16, len: .12, type: 'sbs', w: 1.2 }, duck: true },
    f111f:  { fus: 'jetRadar', R: .062, n: 2.6, wing: { x: .4, c: .22, tr: .35, sw: 35, dih: 0, pos: .6, t: .06, glove: true }, intake: { type: 'rect', z: .4, len: .25, w: .5, h: .8, y: -.1 }, stab: { x: .86, hs: .15, c: .12, tr: .4, sw: 55, y: 0 }, fin: { x: .7, h: .17, c: .25, tr: .3, sw: 55 }, nz: [[-.45, 0], [.45, 0]], canopy: { z: .17, len: .12, type: 'sbs', w: 1.1 } },
    su24:   { fus: 'jetRadar', R: .062, n: 2.6, wing: { x: .42, c: .22, tr: .35, sw: 35, dih: -3, pos: .6, t: .06, glove: true }, intake: { type: 'rect', z: .3, len: .35, w: .55, h: .95 }, stab: { x: .86, hs: .15, c: .12, tr: .4, sw: 55, y: 0 }, fin: { x: .7, h: .16, c: .25, tr: .3, sw: 55 }, nz: [[-.45, 0], [.45, 0]], canopy: { z: .18, len: .12, type: 'sbs', w: 1.1 } },
    tornadoids:{ fus: 'jetRadar', R: .06, n: 2.4, wing: { x: .42, c: .25, tr: .35, sw: 30, dih: 0, pos: .6, t: .06, glove: true }, intake: { type: 'rect', z: .3, len: .3, w: .62, h: 1.1 }, stab: { x: .86, hs: .18, c: .13, tr: .45, sw: 45, dih: -3, y: 0 }, fin: { x: .7, h: .2, c: .27, tr: .3, sw: 50 }, nz: [[-.45, 0], [.45, 0]], canopy: { z: .2, len: .22, type: 'framed' } },
    ef2000g:{ fus: 'jetRadar', R: .055, n: 2.4, wing: { x: .45, c: .46, tr: .12, sw: 53, dih: -2, pos: -.1, t: .045 }, canards: { z: .18, hs: .1, c: .07 }, intake: { type: 'chin', z: .3, len: .32, w: 1.0, h: .55, rect: true }, stab: null, fin: { x: .72, h: .18, c: .23, tr: .3, sw: 50 }, nz: [[-.45, 0], [.45, 0]], canopy: { z: .17, len: .14, type: 'bubble' } },
    rafalec:{ fus: 'jetRadar', R: .055, n: 2.4, wing: { x: .45, c: .45, tr: .14, sw: 48, dih: -2, pos: -.3, t: .045 }, canards: { z: .32, hs: .11, c: .07, y: .45 }, intake: { type: 'semi', z: .33, len: .3, w: .55, h: .9 }, stab: null, fin: { x: .72, h: .17, c: .23, tr: .3, sw: 50 }, nz: [[-.45, 0], [.45, 0]], canopy: { z: .18, len: .14, type: 'bubble' } },
    m2000c: { fus: 'jetRadar', R: .055, wing: { x: .4, c: .56, tr: .04, sw: 58, dih: 0, pos: -.4, t: .045 }, intake: { type: 'semi', z: .3, len: .3, w: .55, h: .9, cone: true }, stab: null, fin: { x: .72, h: .18, c: .25, tr: .3, sw: 50 }, canopy: { z: .22, len: .14, type: 'bubble' } },
    su25:   { fus: 'jetSlim', R: .052, wing: { x: .38, c: .22, tr: .45, sw: 20, dih: -2, pos: .6, t: .1 }, eng: { type: 'sidenac', x: 1.25, r: .04, z0: .36, z1: .86 }, stab: { x: .86, hs: .15, c: .1, tr: .5, sw: 25, dih: 5, y: .3 }, fin: { x: .76, h: .15, c: .17, tr: .45, sw: 35 }, canopy: { z: .17, len: .1, type: 'framed' } },
    a10a:   { fus: 'a10', R: .05, n: 2.6, wing: { x: .37, c: .2, tr: .62, sw: 2, kink: [.3, 0, 7], pos: -.5, t: .16, droop: true }, eng: { type: 'pod', x: .085, y: 1.55, r: .04, len: .24, z: .63 }, stab: { x: .84, hs: .17, c: .115, tr: .95, sw: 0, y: .5 }, fin: { twin: 'tips', x: .835, h: .15, c: .135, tr: .75, sw: 4, below: .3, round: true }, gearPods: [.13, .12], canopy: { z: .14, len: .12, type: 'bubble', h: 1.1 }, gau8: true },
  };
  // relatives that share an airframe
  for (const [a, b] of [['f86fj', 'f86f'], ['sabre6', 'f86f'], ['f104j', 'f104g'], ['mig21mf', 'mig21bis'], ['f4ej', 'f4e'], ['f15j', 'f15c'], ['f15e', 'f15c'], ['f2a', 'f16c'], ['mig29g', 'mig29'], ['su35s', 'su27'], ['ef2000uk', 'ef2000g'], ['tornadof3', 'tornadoids'], ['tornadogr1', 'tornadoids'], ['m2000d', 'm2000c'], ['f1j', 'jaguar']]) T[a] = T[a] || T[b];
  T.f2a = Object.assign({}, T.f16c, { wing: Object.assign({}, T.f16c.wing, { c: .34, sw: 33 }) });
  T.f15e = Object.assign({}, T.f15c, { canopy: { z: .2, len: .2, type: 'bubble' }, cft: true });
  T.m2000d = Object.assign({}, T.m2000c, { canopy: { z: .23, len: .19, type: 'framed' } });
  T.tornadof3 = Object.assign({}, T.tornadoids, { fus: 'jetRadar' });
  T.f1j = Object.assign({}, T.jaguar, { canopy: { z: .2, len: .11, type: 'framed' } });

  // ---- props and bombers: small per-type touches on top of the class defaults
  const P = {
    p51d:   { wing: { x: .3, c: .245, tr: .45, sw: 3 }, canopy: { z: .47, len: .2 } },
    p40e:   { wing: { x: .31, c: .23, tr: .5 }, canopy: { z: .46, len: .16 } },
    p47d:   { R: .068, canopy: { z: .45, len: .2 } },
    f4u1d:  { wing: { kink: [.3, -14, 9] }, canopy: { z: .5, len: .16 } },
    bf109e: { wing: { x: .3, c: .21, tr: .48, sw: 3 }, stab: { y: .9 }, canopy: { z: .44, len: .16 } },
    bf109g: { wing: { x: .31, c: .21, tr: .48, sw: 3 }, stab: { y: .9 }, canopy: { z: .43, len: .16 } },
    spit9:  { canopy: { z: .45, len: .16 } },
    ju87:   { wing: { kink: [.3, -12, 8], c: .2 }, canopy: { z: .4, len: .3 } },
    p38l:   { fus: 'p38pod', R: .075, booms: { x: .19, r: .055 }, wing: { x: .34, c: .26, tr: .4, pos: 0 }, stab: { x: .9, hs: .2, c: .1, tr: 1, y: 0, boom: true }, fin: { twin: 'booms', h: .15, below: .45, round: true, x: .86, c: .13, tr: .7, sw: 10 }, canopy: { z: .28, len: .14, type: 'bubble' } },
    bf110:  { canopy: { z: .3, len: .32 } },
    il2:    { canopy: { z: .4, len: .22 } },
    b17g:   { fin: { h: .17, c: .26, tr: .3, sw: 40 } },
    b29:    { fin: { h: .14, c: .2, tr: .35, sw: 35 }, wing: { c: .16, tr: .35, pos: .1 } },
    lancaster:{ fin: { twin: 'tips', h: .12, below: .4, round: true, c: .1, tr: .8 } },
  };
  const deep = (a, b) => { const o = Object.assign({}, a); for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? Object.assign({}, a[k], b[k]) : b[k]; return o; };

  // ---- class defaults
  const RADIAL = ['p12', 'p26', 'p47d', 'f4u1d', 'fw190a', 'la5fn', 'a6m2', 'ki43', 'ki84', 'n1k2', 'i15', 'i16', 'gladiator', 'ki27', 'ki10', 'b5n', 'sbd', 'a1h', 'd3a', 'camel', 'dr1', 'n17', 'n17ru', 'n24ko3', 'n28', 'he51', 'hart'];
  function defaults(pl, lk) {
    const sh = pl.shape, jet = pl.kind === 'jet', bi = sh === 'bi' || sh === 'tri' || !!pl.bi, big = sh.startsWith('bomber') || sh === 'jet_bomber';
    const pos = lk.has('lowwing') ? -.55 : lk.has('midwing') ? 0 : lk.has('shoulder') ? .55 : lk.has('highwing') ? .85 : -.5;
    if (bi) return { fus: 'biplane', R: .068, n: pl.era === 1 ? 4 : 2.6, wing: { x: .2, c: .17, tr: 1, sw: 0, dih: 2, t: .1, ellip: false }, stab: { x: .86, hs: .2, c: .11, tr: .75, sw: 0, y: .2 }, fin: { x: .86, h: .1, c: .12, tr: .7, sw: 35, round: true }, canopy: { z: .42, type: 'open' } };
    if (!jet && !big && sh !== 'twin') {
      const radial = RADIAL.includes(pl.id);
      return { fus: radial ? 'radial' : 'inline', R: radial ? .064 : .05, n: 2.2,
        wing: { x: radial ? .28 : .3, c: .21, tr: .48, sw: 3, dih: pos < -.3 ? 6 : 3, pos, t: .15, ellip: lk.has('ellip') },
        stab: { x: .85, hs: .2, c: .12, tr: .55, sw: 8, y: .25 }, fin: { x: .82, h: .14, c: .17, tr: .45, sw: 30, round: true }, canopy: { z: .46, len: .17 } };
    }
    if (!jet) { // twins and bombers
      const glazed = lk.has('roundnose') || lk.has('greenhouse') && big;
      return { fus: glazed ? 'glazed' : sh === 'twin' ? 'inline' : 'bomber', R: sh === 'twin' ? .055 : .052, n: 2.2,
        wing: { x: .3, c: .18, tr: .42, sw: 4, dih: 4, pos: lk.has('lowwing') || lk.has('midwing') || lk.has('shoulder') || lk.has('highwing') ? pos : -.2, t: .16, ellip: lk.has('ellip') },
        stab: { x: .85, hs: big ? .27 : .22, c: .12, tr: .55, sw: 6, y: .3 },
        fin: lk.has('twinfin') ? { twin: 'tips', x: .84, h: .11, c: .12, tr: .75, sw: 8, below: .3, round: true } : { x: .78, h: .15, c: .2, tr: .45, sw: 30, round: true, dorsal: lk.has('dorsal') },
        canopy: { z: sh === 'twin' ? .3 : .2, len: sh === 'twin' ? .2 : .12 } };
    }
    // generic jet fallback (every jet in the game also has an entry in T)
    return { fus: lk.has('noseint') ? 'jetNose' : 'jetRadar', R: .058, n: 2.2, wing: { x: .4, c: .28, tr: .4, sw: 35, dih: 0, pos, t: .06 }, stab: { x: .86, hs: .14, c: .1, tr: .45, sw: 40, y: 0 }, fin: { x: .74, h: .16, c: .21, tr: .35, sw: 45 }, canopy: { z: .22, len: .14, type: 'bubble' } };
  }

  // ---- smooth interpolation of section tables (Catmull-Rom through the stations)
  function sample(rows, t, k) {
    let i = 0; while (i < rows.length - 2 && rows[i + 1][0] < t) i++;
    const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(rows.length - 1, i + 2)];
    const u = Math.max(0, Math.min(1, (t - p1[0]) / Math.max(1e-6, p2[0] - p1[0]))), u2 = u * u, u3 = u2 * u;
    const v = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return Math.max(Math.min(p1[k], p2[k]) - Math.abs(p2[k] - p1[k]) * 0.15, Math.min(Math.max(p1[k], p2[k]) + Math.abs(p2[k] - p1[k]) * 0.15, v)); // no overshoot
  }

  const cache = {};
  function spec(pl) {
    if (cache[pl.id]) return cache[pl.id];
    const lk = typeof look === 'function' ? look(pl) : new Set(), L = pl.len, S = pl.span, jet = pl.kind === 'jet', sh = pl.shape;
    const bi = sh === 'bi' || sh === 'tri' || !!pl.bi, big = sh.startsWith('bomber') || sh === 'jet_bomber';
    let d = defaults(pl, lk);
    if (T[pl.id]) d = deep(d, T[pl.id]); if (P[pl.id]) d = deep(d, P[pl.id]);
    const R = Math.max(bi ? 0.38 : 0.36, d.R * L), n = d.n || 2.2;
    const rows = (Array.isArray(d.fus) ? d.fus : FUS[d.fus] || FUS.inline);
    const z0 = -L / 2;
    // fuselage stations in metres
    const at = z => { const t = Math.max(0, Math.min(1, (z - z0) / L)); return { w: sample(rows, t, 1) * R, h: sample(rows, t, 2) * R, y: sample(rows, t, 3) * R }; };
    const se = (v, n) => Math.pow(Math.max(0, v), 1 / n);
    const topAt = (z, x) => { const s = at(z), q = Math.min(1, Math.abs(x || 0) / s.w); return s.y + s.h * se(1 - Math.pow(q, n), n); };
    const botAt = (z, x) => { const s = at(z), q = Math.min(1, Math.abs(x || 0) / s.w); return s.y - s.h * se(1 - Math.pow(q, n), n); };
    const sideAt = (z, y) => { const s = at(z), q = Math.min(1, Math.abs(y - s.y) / s.h); return s.w * se(1 - Math.pow(q, n), n); };
    const sp = { id: pl.id, L, S, R, n, rows, at, topAt, botAt, sideAt, look: lk, jet, bi, big, era: pl.era, d };
    // ---- wing(s)
    const w = d.wing, b = S / 2;
    const rootZ = z0 + w.x * L, rc = bi ? S * w.c : (jet ? w.c * L : S * w.c);
    const zMid = rootZ + rc / 2, s0 = at(zMid);
    const wy = bi ? s0.y - s0.h * 0.85 : s0.y + (w.pos || 0) * s0.h * 0.82;
    const x0 = Math.max(0.05, sideAt(zMid, wy) * 0.6);
    let tc = w.te !== undefined ? null : rc * w.tr; // tip chord
    const swp = Math.tan((w.sw || 0) * D);
    if (tc === null) { const span = b - x0, le = swp * span, te = Math.tan(w.te * D) * span; tc = Math.max(rc * 0.05, rc + te - le); }
    sp.wing = { rootZ, rc, tc, sw: swp, dih: (w.dih || 0) * D, kink: w.kink ? [w.kink[0], w.kink[1] * D, w.kink[2] * D] : null, y: wy, x0, b, t: w.t || (jet ? 0.06 : 0.14), ellip: !!w.ellip, tiptanks: !!w.tiptanks || lk.has('tiptanks'), droop: !!w.droop, fences: w.fences || 0, glove: !!w.glove, tiprail: !!w.tiprail };
    // spanwise geometry of the (main / lower) wing at semi-span position f (0 root .. 1 tip)
    sp.wingAt = (f, wg) => { const g = wg || sp.wing, span = g.b - g.x0;
      const c = g.ellip ? Math.max(g.rc * 0.18, g.rc * Math.sqrt(Math.max(0, 1 - Math.pow(f, 2.2)))) : g.rc * (1 - f) + g.tc * f;
      const le = g.ellip ? g.rootZ + (g.rc - c) * 0.3 + g.sw * span * f : g.rootZ + g.sw * span * f;
      let y = g.y; if (g.kink) { const k = g.kink[0]; y += f < k ? Math.tan(g.kink[1]) * span * f : Math.tan(g.kink[1]) * span * k + Math.tan(g.kink[2]) * span * (f - k); } else y += Math.tan(g.dih) * span * f;
      return { x: g.x0 + span * f, le, c, y }; };
    sp.wingF = x => Math.max(0, Math.min(1, (Math.abs(x) - sp.wing.x0) / (sp.wing.b - sp.wing.x0)));
    // biplanes: upper wing (and the triplane's middle wing)
    sp.wings = [sp.wing];
    if (bi) {
      const gap = rc * 1.05, top = s0.y + s0.h, upper = Object.assign({}, sp.wing, { y: Math.max(top + 0.25, wy + gap), rootZ: rootZ - rc * 0.18, x0: 0.02, dih: (w.dih || 2) * D });
      if (lk.has('sesqui')) Object.assign(sp.wing, { rc: rc * 0.6, tc: rc * 0.5, b: b * 0.82, rootZ: rootZ + rc * 0.15 });
      if (sh === 'tri') { const mid = Object.assign({}, sp.wing, { y: s0.y + s0.h * 0.1, x0: x0 * 0.9, b: b * 0.96 }); sp.wings.push(mid); upper.y = wy + gap * 1.7; upper.b = b; sp.wing.b = b * 0.92; }
      sp.wings.push(upper);
    }
    // ---- canopy / cockpit
    const cn = d.canopy || {};
    const ctype = cn.type || (lk.has('open') ? 'open' : lk.has('greenhouse') ? 'greenhouse' : lk.has('razor') ? 'razor' : lk.has('framed') ? 'framed' : lk.has('sbs') ? 'sbs' : lk.has('roundnose') ? 'glazednose' : lk.has('stepped') ? 'stepped' : 'bubble');
    const two = pl.crew.length > 1 && !big;
    const clen = (cn.len || (jet ? 0.14 : 0.16)) * L * (two && !cn.len ? 1.4 : 1);
    const cz = big && !cn.z ? z0 + L * (ctype === 'glazednose' ? 0.12 : 0.2) : z0 + (cn.z || 0.45) * L;
    sp.canopy = { type: ctype, z: cz, len: Math.max(0.9, clen), w: (cn.w || (ctype === 'sbs' ? 1.15 : jet ? 0.5 : 0.52)) * R, h: (cn.h || (ctype === 'bubble' ? 0.95 : 0.8)) * R * (jet ? 0.95 : 1), x: (cn.x || 0) * R, two, frameless: !!cn.frameless };
    sp.canopy.w = Math.min(sp.canopy.w, at(cz).w * 0.92);
    sp.canopy.h = Math.min(sp.canopy.h, R * 1.15);
    // ---- tail
    const st = d.stab, fn = d.fin;
    sp.fins = []; sp.stab = null;
    const finH = fn.h * L, finC = fn.c * L, finZ = z0 + fn.x * L;
    const mkFin = (x, base, cant, h, below) => sp.fins.push({ x, base, cant: cant * D, h, below: below || 0, zLE: finZ, rc: finC, tc: finC * fn.tr, sw: Math.tan(fn.sw * D), t: jet ? 0.05 : 0.1, round: !!fn.round });
    if (st) {
      const sz = z0 + st.x * L, src = st.c * L, hs = st.hs * L * (st.boom ? 1 : 1);
      let y; if (st.fin !== undefined) y = topAt(finZ + finC * 0.4) + finH * st.fin * 0.92; else { const s = at(sz + src / 2); y = s.y + (st.y || 0) * s.h; }
      const stc = st.te !== undefined ? Math.max(src * 0.08, src + Math.tan(st.te * D) * hs - Math.tan(st.sw * D) * hs) : src * st.tr;
      const rx = st.fin !== undefined ? 0.05 : st.root ? st.root * R : Math.max(0.05, sideAt(sz + src / 2, y) * 0.5);
      sp.stab = { zLE: sz, rc: src, tc: stc, sw: Math.tan(st.sw * D), dih: (st.dih || 0) * D, y, x0: rx, b: rx + hs, t: jet ? 0.05 : 0.1 };
      if (st.boom) { sp.stab.x0 = 0.02; sp.stab.b = d.booms.x * S; }
    }
    if (fn.twin === 'tips' && sp.stab) { const tipY = sp.stab.y + Math.tan(sp.stab.dih) * (sp.stab.b - sp.stab.x0); for (const s of [-1, 1]) mkFin(s * sp.stab.b, tipY - finH * (fn.below || 0), 0, finH * (1 + (fn.below || 0)), 0); }
    else if (fn.twin === 'booms') { for (const s of [-1, 1]) mkFin(s * d.booms.x * S, (sp.stab ? sp.stab.y : 0) - finH * (fn.below || 0), 0, finH * (1 + (fn.below || 0))); }
    else if (fn.twin === 'body') { for (const s of [-1, 1]) { const x = s * (fn.xo || 1) * R; mkFin(x, topAt(finZ + finC * 0.4, x) - 0.08, -s * (fn.cant || 0), finH); } }
    else mkFin(0, topAt(finZ + finC * 0.4) - 0.1, 0, finH + 0.1, fn.below || 0);
    sp.ventral = fn.ventral ? { zLE: finZ + finC * 0.1, rc: finC * 0.6, h: finH * 0.28 } : null;
    sp.dorsal = fn.dorsal || lk.has('dorsal');
    // ---- engines
    const engines = [];
    const e = d.eng;
    if (!jet) {
      if (pl.eng === 1) engines.push({ kind: 'prop', x: 0, y: 0, z: z0 + L * 0.09, r: R * (RADIAL.includes(pl.id) ? 1.0 : 0.95), len: L * 0.18, radial: RADIAL.includes(pl.id) });
      else { const xs = pl.eng === 2 ? [d.booms ? d.booms.x : big ? 0.17 : 0.18] : [0.12, 0.23];
        for (const s of [-1, 1]) for (const fx of xs) { const x = s * fx * S, wa = sp.wingAt(sp.wingF(x)); const nr = Math.max(0.42, R * (pl.eng === 2 ? 0.72 : 0.62)), nl = Math.max(wa.c * 1.25, L * 0.22);
          engines.push({ kind: 'propnac', x, y: wa.y + nr * 0.1, z: wa.le + wa.c * 0.35 - nl * 0.3, r: nr, len: nl, radial: pl.era >= 3 || pl.era === 2, boom: !!d.booms }); } }
    } else if (e && (e.type === 'underwing' || e.type === 'wingnac')) {
      for (const s of [-1, 1]) { const x = s * e.x * S, wa = sp.wingAt(sp.wingF(x)), r = e.r * L, len = e.len * L;
        engines.push({ kind: e.type, x, y: e.type === 'underwing' ? wa.y - r * 0.85 : wa.y, z: wa.le + wa.c * 0.3 - len * 0.32, r, len, jet: true }); }
    } else if (e && (e.type === 'rootnac' || e.type === 'sidenac' || e.type === 'nacelle')) {
      for (const s of [-1, 1]) { const r = e.r * L, len = e.len ? e.len * L : (e.z1 - e.z0) * L, z = e.len ? z0 + e.z * L + len / 2 : z0 + (e.z0 + e.z1) / 2 * L;
        const x = e.x ? s * e.x * R : s * (at(z).w + r * 0.35), y = e.type === 'nacelle' ? -0.35 * R : e.type === 'sidenac' ? wy - r * 0.5 : wy;
        engines.push({ kind: e.type, x, y, z, r, len, jet: true }); }
    } else if (e && e.type === 'pod') {
      for (const s of [-1, 1]) engines.push({ kind: 'pod', x: s * e.x * L, y: e.y * R, z: z0 + e.z * L, r: e.r * L, len: e.len * L, jet: true });
    } else {
      // engines inside the fuselage, exhausting through tail nozzles
      const nz = d.nz || (pl.eng === 2 ? [[-0.42, 0], [0.42, 0]] : [[0, 0]]), zEnd = d.nzz ? z0 + d.nzz * L : L / 2, sEnd = at(zEnd);
      const rn = pl.eng === 2 ? Math.min(sEnd.w * 0.55, sEnd.h * 0.95, R * 0.5) : Math.min(sEnd.w, sEnd.h) * 0.98;
      for (const [nx, ny] of nz) engines.push({ kind: 'fus', x: nx * R, y: sEnd.y + ny * R, z: zEnd - L * 0.16, r: rn, len: L * 0.32, jet: true, nozzle: zEnd, rect: !!d.nzRect });
    }
    // nozzles for nacelles / pods are at their rear ends
    for (const en of engines) if (en.jet && en.nozzle === undefined) en.nozzle = en.z + en.len / 2;
    sp.engines = engines;
    sp.intake = d.intake ? Object.assign({ z: 0.3, len: 0.3, w: 0.5, h: 0.9 }, d.intake) : null;
    if (!sp.intake && jet && (d.fus === 'jetNose' || d.fus === 'jetOval' || d.fus === 'lightning')) sp.intake = { type: 'nose' };
    sp.extra = { lerx: !!d.lerx, canards: d.canards || null, booms: d.booms || null, gearPods: d.gearPods || null, gau8: !!d.gau8, cone: !!d.cone || (sp.intake && sp.intake.cone), belly: !!d.belly, cft: !!d.cft, duck: !!d.duck };
    return (cache[pl.id] = sp);
  }
  return { spec, FUS, TYPES: T, RADIAL };
})();
