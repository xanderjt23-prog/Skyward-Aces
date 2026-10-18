// ============================================================================
// Airframe registry: every aircraft in the game, defined explicitly from real
// aviation data. There are NO class defaults: spec() validates each entry and
// throws if any required property is missing or inconsistent, instead of
// guessing a shape.
//
// Each entry:
//   dims      published figures: length, span, height (m, on its wheels; tail-wheel
//             types in the three-point attitude), wingArea (m², gross)
//   gear      'tailwheel' | 'tricycle' | 'skid'   (used to turn the published height into fin height)
//   fuselage  profile (side/plan shape along the axis, see FUS), section ('round' | 'oval' |
//             'rounded_box' | 'box'), fuselageLengthToWidthRatio (L / max body width, incl.
//             side intake trunks), heightToWidth (max body depth / max width)
//   wing      wingMountHeight (0 low .. 0.5 mid .. 1 high/shoulder), planform ('trapezoid' |
//             'elliptical' | 'delta' | 'diamond' | 'gull' | 'inverted_gull' | 'cranked'),
//             rootLE (leading edge at the centreline, fraction of L from the nose), sweepLE,
//             taper (tip / root chord), dihedral (deg), thickness (t/c);
//             kink [span fraction, inner dihedral, outer dihedral] for gull / inverted_gull / cranked;
//             sweepTE for diamond. The root chord is computed from dims.wingArea.
//   biplane   null, or { wings: 2|3, gapToChord, stagger (fraction of chord, + = upper forward),
//             lowerSpanRatio, lowerChordRatio, middleSpanRatio (triplanes) }
//   intakeProfile  'none' (propellers) | 'nose_cone' | 'side_box' | 'cheek_crescent' | 'chin_scoop' |
//             'ventral_box' (under the LERX, ahead of engine nacelles) | 'wing_root' | 'nacelle'
//   intake    null, or { at (mouth, fraction of L), length (fraction of L), width, height (m, the mouth's real
//             size), rake (deg, top lip forward), splitter, shockCone }
//   engines   { layout, count, ... } - see ENGINE_FIELDS below
//   tailConfiguration  'single_vertical' | 'twin_vertical_straight' | 'twin_vertical_canted' | 't_tail' |
//             'twin_endplate' (fins on the tailplane tips) | 'twin_boom'
//   horizontalTail  'fuselage' | 'fin_mid' (cruciform) | 'fin_top' | 'boom' | 'none'
//   finCantDeg  outward cant of the fins (0 unless twin_vertical_canted)
//   tail      stabSpan (m, tip to tip), stabChord (m, root), stabTaper, stabLE (fraction of L), stabSweep,
//             stabDihedral, stabHeight (fuselage tail: in local half-heights; fin_mid: fraction up the fin),
//             finLE (fraction of L), finChord (m, root), finTaper, finSweep,
//             finSpacing (twin_vertical_*: in body half-widths), finBelow (twin_endplate / twin_boom:
//             fraction of the fin below the tailplane), finTip (tail-wheel / skid types only: fin tip above the
//             fuselage centreline in m, from the side elevation - their published height is often taken to the
//             vertical propeller tip, so it is only used as a cross-check)
//   canardPresence, canardLength (m, exposed semi-span), canardSweep (deg), canardOffset (m behind
//             the cockpit centre; negative = ahead of it), canardHeight (body half-heights)
//   cockpit   canopy ('open' | 'framed' | 'razorback' | 'bubble' | 'greenhouse' | 'side_by_side' |
//             'glazed_nose' | 'stepped'), at (canopy centre, fraction of L), length (m), offset (m, sideways)
//   extras    explicit list of distinguishing features (see EXTRAS)
//
// Sources: published specifications (manufacturer data and standard references, cross-checked
// online: e.g. aerospaceweb, migflug, armedconflicts, warbirdsresourcegroup, airpages, Wikipedia);
// positions along the length, body widths and tail chords measured from the types' three-view
// general-arrangement drawings.
// ============================================================================
const Airframe = (() => {
  const D = Math.PI / 180;
  // ---- fuselage shapes along the axis: [t (0 nose .. 1 tail), width, depth, centre-line height (in half-widths)].
  // Width and depth are normalised at load time, so the aircraft's real width / depth come only from its ratios.
  const FUS = {
    piston_inline:  [[0, .42, .5, -.02], [.04, .74, .9, 0], [.13, .92, 1.15, .02], [.27, 1, 1.32, .08], [.42, .96, 1.3, .1], [.62, .66, .98, .14], [.84, .32, .58, .2], [.97, .13, .3, .24], [1, .07, .16, .25]],
    piston_radial:  [[0, .9, .9, 0], [.03, .98, .98, 0], [.13, 1, 1, 0], [.28, 1, 1.06, .04], [.44, .92, 1.08, .08], [.64, .6, .82, .12], [.86, .28, .44, .18], [1, .07, .14, .22]],
    biplane:        [[0, .82, .88, 0], [.12, 1, 1, 0], [.3, 1, 1.04, .02], [.55, .72, .84, .06], [.85, .3, .44, .1], [1, .06, .12, .12]],
    bomber_solid:   [[0, .32, .34, -.05], [.04, .74, .8, -.02], [.12, .94, 1.04, 0], [.22, 1, 1.12, 0], [.6, .96, 1.1, 0], [.82, .58, .76, .08], [.96, .25, .4, .14], [1, .14, .24, .15]],
    bomber_glazed:  [[0, .18, .18, -.1], [.025, .6, .6, -.06], [.08, .9, .92, -.02], [.18, 1, 1.08, 0], [.6, .96, 1.08, 0], [.82, .58, .76, .08], [.96, .25, .4, .14], [1, .14, .24, .15]],
    jet_nose_intake:[[0, .84, .88, 0], [.08, .95, .99, 0], [.3, 1, 1.06, .02], [.62, .93, .98, .02], [.86, .8, .83, .02], [1, .72, .74, 0]],
    jet_nose_oval:  [[0, .9, .62, -.05], [.08, .98, .86, 0], [.3, 1, 1.02, .02], [.62, .93, .96, .02], [.86, .8, .82, .02], [1, .7, .72, 0]],
    jet_radar:      [[0, .02, .02, -.04], [.04, .3, .3, -.04], [.12, .58, .58, -.02], [.22, .82, .82, 0], [.34, 1, .98, 0], [.62, 1, .98, 0], [.86, .86, .84, 0], [1, .72, .72, 0]],
    jet_gun_nose:   [[0, .3, .3, -.05], [.04, .58, .6, -.03], [.12, .82, .84, 0], [.25, 1, 1, 0], [.62, .96, .98, .02], [.86, .8, .82, .02], [1, .66, .68, 0]],
    jet_blended:    [[0, .02, .02, -.08], [.05, .3, .3, -.07], [.13, .52, .5, -.04], [.22, .7, .68, 0], [.3, 1.1, .78, 0], [.45, 1.6, .8, 0], [.8, 1.6, .76, 0], [.95, 1.35, .66, 0], [1, 1.2, .6, 0]],
    jet_f16:        [[0, .02, .02, -.05], [.05, .3, .3, -.04], [.12, .55, .55, -.02], [.2, .72, .72, 0], [.3, .92, .8, .02], [.45, 1.2, .8, .02], [.7, 1.08, .78, .02], [.9, .78, .74, 0], [1, .64, .64, 0]],
    jet_tapered:    [[0, .04, .04, -.05], [.05, .36, .38, -.04], [.14, .66, .7, -.02], [.28, .92, .96, 0], [.42, 1, 1, 0], [.75, .94, .98, .04], [.95, .44, .52, .1], [1, .14, .18, .14]],
    jet_pod_tail:   [[0, .02, .02, -.05], [.06, .4, .42, -.03], [.16, .72, .74, 0], [.3, .92, .96, 0], [.42, 1, 1, 0], [.72, .9, .94, .04], [.94, .38, .46, .14], [1, .12, .16, .16]],
    jet_glazed:     [[0, .2, .2, -.1], [.03, .6, .62, -.06], [.1, .9, .92, -.02], [.22, 1, 1, 0], [.7, .92, .96, .04], [.94, .38, .46, .14], [1, .12, .16, .16]],
    a10:            [[0, .4, .55, -.12], [.04, .7, .85, -.06], [.12, .92, 1.05, 0], [.28, 1, 1.12, .02], [.5, .9, 1.04, .08], [.72, .58, .78, .16], [.9, .32, .44, .28], [1, .12, .16, .32]],
    me262:          [[0, .2, .24, -.1], [.05, .6, .66, -.06], [.14, .9, .94, -.02], [.32, 1, 1.02, 0], [.6, .84, .92, .04], [.88, .4, .5, .12], [1, .16, .24, .16]],
    f4:             [[0, .02, .02, -.06], [.05, .34, .34, -.05], [.14, .62, .62, -.02], [.24, .82, .86, 0], [.4, 1, 1.05, 0], [.66, .96, 1, .06], [.8, .7, .82, .2], [.94, .36, .5, .38], [1, .24, .34, .42]],
    flanker:        [[0, .02, .02, -.08], [.05, .32, .32, -.07], [.14, .55, .55, -.04], [.24, .74, .74, 0], [.36, 1.1, .82, .04], [.5, 1.3, .8, .06], [.7, .9, .64, .08], [.88, .5, .46, .1], [1, .32, .32, .1]],
    lightning:      [[0, .8, 1.05, 0], [.08, .9, 1.18, 0], [.3, 1, 1.35, .05], [.62, .96, 1.32, .05], [.86, .86, 1.2, .05], [1, .8, 1.15, .05]],
    buccaneer:      [[0, .02, .02, -.05], [.05, .38, .4, -.03], [.14, .7, .74, 0], [.3, .96, 1, 0], [.45, .82, .96, 0], [.62, 1, 1.02, .02], [.85, .7, .76, .06], [.97, .3, .34, .1], [1, .14, .16, .1]],
    p38_gondola:    [[0, .3, .32, 0], [.05, .66, .7, 0], [.14, .92, .96, 0], [.3, 1, 1.05, .02], [.5, .9, .98, .04], [.6, .6, .7, .06], [.64, .3, .4, .08], [.66, .12, .16, .08]],
  };
  for (const k in FUS) { const r = FUS[k], mw = Math.max(...r.map(x => x[1])), mh = Math.max(...r.map(x => x[2])); FUS[k] = r.map(([t, w, h, y]) => [t, w / mw, h / mh, y / mw]); }
  const SECTION_N = { round: 2, oval: 2.2, rounded_box: 2.8, box: 4 };
  const ENUM = {
    gear: ['tailwheel', 'tricycle', 'skid'],
    planform: ['trapezoid', 'elliptical', 'delta', 'diamond', 'gull', 'inverted_gull', 'cranked'],
    intakeProfile: ['none', 'nose_cone', 'side_box', 'cheek_crescent', 'chin_scoop', 'ventral_box', 'wing_root', 'nacelle'],
    tailConfiguration: ['single_vertical', 'twin_vertical_straight', 'twin_vertical_canted', 't_tail', 'twin_endplate', 'twin_boom'],
    horizontalTail: ['fuselage', 'fin_mid', 'fin_top', 'boom', 'none'],
    canopy: ['open', 'framed', 'razorback', 'bubble', 'greenhouse', 'side_by_side', 'glazed_nose', 'stepped'],
    layout: ['nose_propeller', 'wing_propellers', 'twin_boom_propellers', 'fuselage_jet', 'wing_nacelles', 'underwing_pods', 'rear_fuselage_pods', 'fuselage_side_nacelles', 'ventral_nacelles'],
  };
  // engines.layout and the fields each needs:
  //   nose_propeller { radial }                         wing_propellers { positions (semi-span fractions), radial, pusher }
  //   twin_boom_propellers { positions }                fuselage_jet { nozzles [[x, y] in body half-widths], nozzleAt (fraction of L) }
  //   wing_nacelles / underwing_pods { positions, diameter (m), length (m) }
  //   rear_fuselage_pods { lateral (m), height (m above axis), at (fraction of L), diameter, length }
  //   fuselage_side_nacelles { at, diameter, length, lateral (body half-widths, 0 = against the side) }
  //   ventral_nacelles { lateral (body half-widths), diameter, from, to (fractions of L) }
  const ENGINE_FIELDS = {
    nose_propeller: ['radial'], wing_propellers: ['positions', 'radial', 'pusher'], twin_boom_propellers: ['positions'],
    fuselage_jet: ['nozzles', 'nozzleAt'], wing_nacelles: ['positions', 'diameter', 'length'], underwing_pods: ['positions', 'diameter', 'length'],
    rear_fuselage_pods: ['lateral', 'height', 'at', 'diameter', 'length'], fuselage_side_nacelles: ['at', 'diameter', 'length', 'lateral'],
    ventral_nacelles: ['lateral', 'diameter', 'from', 'to'],
  };
  const EXTRAS = ['dorsalFin', 'ventralFin', 'bellyScoop', 'chinRadiator', 'wingRadiators', 'spats', 'bracingWires', 'gunHump', 'vStruts', 'tipTanks', 'wingFences', 'lerx',
    'wingGlove', 'ventralTank', 'conformalTanks', 'gearPods', 'gau8', 'duckbillNose', 'tipRails', 'droopedTips', 'fixedGear', 'headrest', 'pusher'];

  // ---------------------------------------------------------------- the registry
  // t(): the tail block, in the order of its fields (see the header)
  const t = (stabSpan, stabChord, stabTaper, stabLE, stabSweep, stabDihedral, stabHeight, finLE, finChord, finTaper, finSweep, finSpacing, finBelow) =>
    ({ stabSpan, stabChord, stabTaper, stabLE, stabSweep, stabDihedral, stabHeight, finLE, finChord, finTaper, finSweep, finSpacing, finBelow });
  const NOCANARD = { canardPresence: false, canardLength: 0, canardSweep: 0, canardOffset: 0, canardHeight: 0 };
  const NOSE = { at: 0, length: 0, width: 0, height: 0, rake: 0, splitter: false, shockCone: false };
  const REG = {
    // ======================= USA =======================
    spad13us: { dims: { length: 6.3, span: 8.1, height: 2.6, wingArea: 21.1 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 7.9, heightToWidth: 1.25 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: 1, dihedral: 2, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.05, stagger: .15, lowerSpanRatio: .96, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.7, .8, .8, .86, 0, 0, .2, .86, .8, .7, 35, 0, 0), finTip: 1.2 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .42, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    n28: { dims: { length: 6.2, span: 8, height: 2.48, wingArea: 16 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'round', fuselageLengthToWidthRatio: 8.3, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: .9, dihedral: 2, thickness: .09 },
      biplane: { wings: 2, gapToChord: 1.1, stagger: .2, lowerSpanRatio: .92, lowerChordRatio: .9 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.6, .75, .8, .86, 0, 0, .2, .86, .75, .7, 35, 0, 0), finTip: 1.15 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .44, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    p12: { dims: { length: 6.2, span: 9.1, height: 2.69, wingArea: 21.1 }, gear: 'tailwheel',
      fuselage: { profile: 'biplane', section: 'rounded_box', fuselageLengthToWidthRatio: 6.5, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: .85, dihedral: 2, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.05, stagger: .2, lowerSpanRatio: .9, lowerChordRatio: .85 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3, .85, .75, .86, 0, 0, .2, .86, .85, .7, 35, 0, 0), finTip: 1.3 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .48, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear', 'headrest'] },
    p26: { dims: { length: 7.2, span: 8.5, height: 3.04, wingArea: 13.89 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'round', fuselageLengthToWidthRatio: 6.9, heightToWidth: 1.1 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .27, sweepLE: 2, taper: .7, dihedral: 5, thickness: .14 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.1, .95, .65, .85, 6, 0, .2, .83, 1.0, .5, 30, 0, 0), finTip: 1.55 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .5, length: 0, offset: 0 }, extras: ['bracingWires', 'spats', 'fixedGear', 'headrest'] },
    p40e: { dims: { length: 9.7, span: 11.4, height: 3.76, wingArea: 21.92 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 10.8, heightToWidth: 1.5 },
      wing: { wingMountHeight: .1, planform: 'trapezoid', rootLE: .31, sweepLE: 4, taper: .5, dihedral: 6, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.0, 1.2, .55, .85, 8, 0, .25, .82, 1.5, .45, 30, 0, 0), finTip: 1.75 },
      ...NOCANARD, cockpit: { canopy: 'razorback', at: .46, length: 1.6, offset: 0 }, extras: ['chinRadiator'] },
    p51d: { dims: { length: 9.8, span: 11.3, height: 4.08, wingArea: 21.83 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 10.9, heightToWidth: 1.45 },
      wing: { wingMountHeight: .1, planform: 'trapezoid', rootLE: .3, sweepLE: 3, taper: .45, dihedral: 5, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.16, 1.3, .55, .85, 8, 0, .25, .8, 1.75, .45, 32, 0, 0), finTip: 1.85 },
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .47, length: 2.0, offset: 0 }, extras: ['dorsalFin', 'bellyScoop'] },
    p47d: { dims: { length: 11, span: 12.4, height: 4.47, wingArea: 27.87 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'oval', fuselageLengthToWidthRatio: 8.3, heightToWidth: 1.45 },
      wing: { wingMountHeight: .1, planform: 'elliptical', rootLE: .3, sweepLE: 2, taper: .3, dihedral: 4, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(5.5, 1.5, .55, .85, 6, 0, .25, .82, 1.9, .45, 28, 0, 0), finTip: 2.1 },
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .45, length: 2.1, offset: 0 }, extras: ['dorsalFin'] },
    p38l: { dims: { length: 11.5, span: 15.8, height: 3.0, wingArea: 30.43 }, gear: 'tricycle',
      fuselage: { profile: 'p38_gondola', section: 'oval', fuselageLengthToWidthRatio: 10.5, heightToWidth: 1.3 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .34, sweepLE: 3, taper: .4, dihedral: 4, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'twin_boom_propellers', count: 2, positions: [.38] },
      tailConfiguration: 'twin_boom', horizontalTail: 'boom', finCantDeg: 0, tail: t(6.1, 1.2, 1, .9, 0, 0, 0, .86, 1.5, .7, 10, 0, .45),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .28, length: 1.6, offset: 0 }, extras: [] },
    f4u1d: { dims: { length: 10.2, span: 12.5, height: 4.5, wingArea: 29.17 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'oval', fuselageLengthToWidthRatio: 7.8, heightToWidth: 1.2 },
      wing: { wingMountHeight: .05, planform: 'inverted_gull', rootLE: .3, sweepLE: 3, taper: .45, dihedral: 0, thickness: .16, kink: [.3, -14, 9] },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(5.3, 1.45, .55, .85, 5, 0, .3, .82, 1.8, .5, 25, 0, 0), finTip: 2.0 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .5, length: 1.7, offset: 0 }, extras: ['wingRadiators'] },
    f80c: { dims: { length: 10.5, span: 11.8, height: 3.45, wingArea: 22.07 }, gear: 'tricycle',
      fuselage: { profile: 'jet_gun_nose', section: 'oval', fuselageLengthToWidthRatio: 7.8, heightToWidth: 1.1 },
      wing: { wingMountHeight: .15, planform: 'trapezoid', rootLE: .36, sweepLE: 4, taper: .45, dihedral: 5, thickness: .13 },
      biplane: null, intakeProfile: 'cheek_crescent', intake: { at: .3, length: .22, width: 0.5, height: 0.7, rake: 0, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(4.5, 1.1, .6, .85, 8, 0, .2, .8, 1.6, .45, 30, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .22, length: 1.6, offset: 0 }, extras: ['tipTanks'] },
    f86f: { dims: { length: 11.4, span: 11.3, height: 4.5, wingArea: 28.1 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'oval', fuselageLengthToWidthRatio: 7.4, heightToWidth: 1.1 },
      wing: { wingMountHeight: .2, planform: 'trapezoid', rootLE: .38, sweepLE: 37, taper: .5, dihedral: 3, thickness: .1 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE, splitter: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(3.9, 1.15, .5, .84, 35, 10, .3, .76, 2.2, .4, 40, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .25, length: 1.8, offset: 0 }, extras: [] },
    f100d: { dims: { length: 15.2, span: 11.8, height: 4.95, wingArea: 35.77 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_oval', section: 'oval', fuselageLengthToWidthRatio: 8.9, heightToWidth: 1.05 },
      wing: { wingMountHeight: .1, planform: 'trapezoid', rootLE: .38, sweepLE: 49, taper: .35, dihedral: 0, thickness: .07 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(5.4, 1.8, .4, .86, 45, 0, -.3, .72, 3.6, .35, 45, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .22, length: 2.0, offset: 0 }, extras: [] },
    f4e: { dims: { length: 19.2, span: 11.7, height: 5.0, wingArea: 49.24 }, gear: 'tricycle',
      fuselage: { profile: 'f4', section: 'rounded_box', fuselageLengthToWidthRatio: 5.8, heightToWidth: .58 },
      wing: { wingMountHeight: .1, planform: 'cranked', rootLE: .4, sweepLE: 45, taper: .3, dihedral: 0, thickness: .05, kink: [.6, 0, 12] },
      biplane: null, intakeProfile: 'side_box', intake: { at: .22, length: .36, width: 0.75, height: 1.35, rake: 12, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.3, -.25], [.3, -.25]], nozzleAt: .8 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(5.4, 1.9, .45, .88, 43, -23, .7, .76, 3.8, .35, 50, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .21, length: 3.8, offset: 0 }, extras: [] },
    f15c: { dims: { length: 19.4, span: 13, height: 5.63, wingArea: 56.5 }, gear: 'tricycle',
      fuselage: { profile: 'jet_blended', section: 'rounded_box', fuselageLengthToWidthRatio: 4.4, heightToWidth: .45 },
      wing: { wingMountHeight: .85, planform: 'trapezoid', rootLE: .38, sweepLE: 45, taper: .27, dihedral: -1, thickness: .05 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .2, length: .42, width: 1.1, height: 1.5, rake: 25, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.3, 0], [.3, 0]], nozzleAt: 1 },
      tailConfiguration: 'twin_vertical_straight', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(8.6, 2.8, .35, .87, 50, 0, 0, .8, 3.3, .45, 36, .55, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 2.7, offset: 0 }, extras: [] },
    f16c: { dims: { length: 15, span: 9.96, height: 4.88, wingArea: 27.87 }, gear: 'tricycle',
      fuselage: { profile: 'jet_f16', section: 'oval', fuselageLengthToWidthRatio: 6.8, heightToWidth: .65 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .42, sweepLE: 40, taper: .23, dihedral: 0, thickness: .04 },
      biplane: null, intakeProfile: 'chin_scoop', intake: { at: .26, length: .36, width: 1.25, height: 0.85, rake: 8, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(5.58, 1.65, .35, .87, 40, -10, 0, .76, 3.0, .4, 47, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 2.6, offset: 0 }, extras: ['lerx', 'ventralFin'] },
    fa18e: { dims: { length: 18.3, span: 13.6, height: 4.88, wingArea: 46.45 }, gear: 'tricycle',
      fuselage: { profile: 'jet_blended', section: 'rounded_box', fuselageLengthToWidthRatio: 5.1, heightToWidth: .55 },
      wing: { wingMountHeight: .65, planform: 'trapezoid', rootLE: .43, sweepLE: 28, taper: .35, dihedral: -3, thickness: .05 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .34, length: .3, width: 0.8, height: 1.0, rake: 20, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.27, 0], [.27, 0]], nozzleAt: 1 },
      tailConfiguration: 'twin_vertical_canted', horizontalTail: 'fuselage', finCantDeg: 20, tail: t(7.3, 2.2, .4, .86, 42, 0, 0, .72, 3.1, .4, 35, .55, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 2.7, offset: 0 }, extras: ['lerx'] },
    f22a: { dims: { length: 18.9, span: 13.6, height: 5.08, wingArea: 78.04 }, gear: 'tricycle',
      fuselage: { profile: 'jet_blended', section: 'box', fuselageLengthToWidthRatio: 3.9, heightToWidth: .4 },
      wing: { wingMountHeight: .75, planform: 'diamond', rootLE: .42, sweepLE: 42, taper: .14, dihedral: -3, thickness: .04, sweepTE: -17 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .25, length: .4, width: 1.0, height: 1.7, rake: 30, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.25, 0], [.25, 0]], nozzleAt: 1, rectangular: true },
      tailConfiguration: 'twin_vertical_canted', horizontalTail: 'fuselage', finCantDeg: 28, tail: t(8.84, 2.6, .25, .86, 42, 0, 0, .73, 3.8, .4, 22, .5, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 3.0, offset: 0 }, extras: [] },
    b17g: { dims: { length: 22.7, span: 31.6, height: 5.82, wingArea: 131.92 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_solid', section: 'oval', fuselageLengthToWidthRatio: 9.9, heightToWidth: 1.15 },
      wing: { wingMountHeight: .2, planform: 'trapezoid', rootLE: .3, sweepLE: 6, taper: .42, dihedral: 4.5, thickness: .18 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 4, positions: [.23, .44], radial: true, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(13.0, 3.6, .45, .84, 8, 0, .3, .72, 6.0, .3, 40, 0, 0), finTip: 4.3 },
      ...NOCANARD, cockpit: { canopy: 'stepped', at: .2, length: 2.0, offset: 0 }, extras: ['dorsalFin'] },
    b29: { dims: { length: 30.2, span: 43.1, height: 8.46, wingArea: 161.3 }, gear: 'tricycle',
      fuselage: { profile: 'bomber_glazed', section: 'round', fuselageLengthToWidthRatio: 10.4, heightToWidth: 1.0 },
      wing: { wingMountHeight: .45, planform: 'trapezoid', rootLE: .32, sweepLE: 7, taper: .35, dihedral: 4.5, thickness: .2 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 4, positions: [.2, .4], radial: true, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(15.0, 4.0, .45, .86, 8, 0, .3, .76, 6.0, .35, 35, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'glazed_nose', at: .05, length: 3.0, offset: 0 }, extras: ['dorsalFin'] },
    f105: { dims: { length: 19.6, span: 10.6, height: 5.99, wingArea: 35.8 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'oval', fuselageLengthToWidthRatio: 11.2, heightToWidth: 1.1 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .44, sweepLE: 48, taper: .4, dihedral: -3, thickness: .05 },
      biplane: null, intakeProfile: 'wing_root', intake: { at: .44, length: .05, width: 1.0, height: 0.45, rake: -20, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(5.2, 2.1, .4, .88, 45, 0, -.3, .7, 5.0, .3, 50, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .2, length: 2.0, offset: 0 }, extras: [] },
    a4: { dims: { length: 12.2, span: 8.4, height: 4.57, wingArea: 24.15 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'oval', fuselageLengthToWidthRatio: 8.1, heightToWidth: 1.15 },
      wing: { wingMountHeight: .05, planform: 'delta', rootLE: .4, sweepLE: 33, taper: .2, dihedral: 0, thickness: .06 },
      biplane: null, intakeProfile: 'cheek_crescent', intake: { at: .27, length: .22, width: 0.45, height: 0.8, rake: 0, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fin_mid', finCantDeg: 0, tail: t(3.4, 1.2, .45, .86, 25, 0, .3, .72, 2.8, .4, 35, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 1.7, offset: 0 }, extras: [] },
    f15e: { dims: { length: 19.4, span: 13, height: 5.63, wingArea: 56.5 }, gear: 'tricycle',
      fuselage: { profile: 'jet_blended', section: 'rounded_box', fuselageLengthToWidthRatio: 4.4, heightToWidth: .45 },
      wing: { wingMountHeight: .85, planform: 'trapezoid', rootLE: .38, sweepLE: 45, taper: .27, dihedral: -1, thickness: .05 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .2, length: .42, width: 1.1, height: 1.5, rake: 25, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.3, 0], [.3, 0]], nozzleAt: 1 },
      tailConfiguration: 'twin_vertical_straight', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(8.6, 2.8, .35, .87, 50, 0, 0, .8, 3.3, .45, 36, .55, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 3.9, offset: 0 }, extras: ['conformalTanks'] },
    dh4: { dims: { length: 9.2, span: 12.9, height: 3.35, wingArea: 40.32 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 9.7, heightToWidth: 1.35 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .22, sweepLE: 0, taper: 1, dihedral: 3, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: .1, lowerSpanRatio: 1, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.2, 1.1, .8, .86, 0, 0, .2, .86, 1.0, .7, 35, 0, 0), finTip: 1.5 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .38, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    b10: { dims: { length: 13.6, span: 21.5, height: 4.7, wingArea: 63 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'oval', fuselageLengthToWidthRatio: 9.7, heightToWidth: 1.25 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .32, sweepLE: 5, taper: .45, dihedral: 4, thickness: .17 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.26], radial: true, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(6.0, 1.7, .55, .85, 6, 0, .3, .8, 2.2, .5, 30, 0, 0), finTip: 2.2 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .32, length: 2.6, offset: 0 }, extras: [] },
    sbd: { dims: { length: 10.1, span: 12.7, height: 4.14, wingArea: 30.19 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'oval', fuselageLengthToWidthRatio: 7.8, heightToWidth: 1.3 },
      wing: { wingMountHeight: .05, planform: 'trapezoid', rootLE: .3, sweepLE: 5, taper: .45, dihedral: 6, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.5, 1.4, .55, .85, 6, 0, .3, .8, 1.9, .5, 25, 0, 0), finTip: 1.9 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .44, length: 3.2, offset: 0 }, extras: [] },
    b25j: { dims: { length: 16.1, span: 20.6, height: 4.98, wingArea: 56.67 }, gear: 'tricycle',
      fuselage: { profile: 'bomber_solid', section: 'oval', fuselageLengthToWidthRatio: 11.5, heightToWidth: 1.35 },
      wing: { wingMountHeight: .65, planform: 'cranked', rootLE: .32, sweepLE: 4, taper: .4, dihedral: 0, thickness: .17, kink: [.3, 4, -1] },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.29], radial: true, pusher: false },
      tailConfiguration: 'twin_endplate', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(6.6, 1.7, .7, .85, 2, 0, .35, .84, 1.6, .7, 8, 0, .3),
      ...NOCANARD, cockpit: { canopy: 'stepped', at: .25, length: 2.0, offset: 0 }, extras: [] },
    a1h: { dims: { length: 11.8, span: 15.2, height: 4.78, wingArea: 37.19 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'oval', fuselageLengthToWidthRatio: 8.4, heightToWidth: 1.3 },
      wing: { wingMountHeight: .05, planform: 'trapezoid', rootLE: .3, sweepLE: 3, taper: .45, dihedral: 6, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(5.2, 1.6, .55, .86, 6, 0, .3, .8, 2.4, .45, 30, 0, 0), finTip: 2.3 },
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .44, length: 2.2, offset: 0 }, extras: ['dorsalFin'] },
    a10a: { dims: { length: 16.3, span: 17.5, height: 4.47, wingArea: 47 }, gear: 'tricycle',
      fuselage: { profile: 'a10', section: 'rounded_box', fuselageLengthToWidthRatio: 10.2, heightToWidth: 1.3 },
      wing: { wingMountHeight: .1, planform: 'cranked', rootLE: .37, sweepLE: 2, taper: .62, dihedral: 0, thickness: .16, kink: [.3, 0, 7] },
      biplane: null, intakeProfile: 'nacelle', intake: null,
      engines: { layout: 'rear_fuselage_pods', count: 2, lateral: 1.4, height: 1.25, at: .63, diameter: 1.3, length: 3.9 },
      tailConfiguration: 'twin_endplate', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(5.74, 1.9, .95, .84, 0, 0, .5, .835, 2.2, .75, 4, 0, .3),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .14, length: 2.0, offset: 0 }, extras: ['gearPods', 'gau8', 'droopedTips'] },
    f111f: { dims: { length: 22.4, span: 19.2, height: 5.22, wingArea: 48.77 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 7.0, heightToWidth: .6 },
      wing: { wingMountHeight: .9, planform: 'trapezoid', rootLE: .4, sweepLE: 16, taper: .35, dihedral: 0, thickness: .06 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .4, length: .25, width: 0.8, height: 0.8, rake: 0, splitter: true, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.28, 0], [.28, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(9.0, 3.0, .4, .86, 55, 0, 0, .7, 5.0, .3, 55, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'side_by_side', at: .17, length: 2.6, offset: 0 }, extras: ['wingGlove'] },
    // ======================= Germany =======================
    albd3: { dims: { length: 7.3, span: 9, height: 2.98, wingArea: 20.5 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'oval', fuselageLengthToWidthRatio: 9.1, heightToWidth: 1.4 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: .9, dihedral: 1, thickness: .09 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: .25, lowerSpanRatio: .97, lowerChordRatio: .55 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.0, .8, .8, .86, 0, 0, .2, .86, .85, .7, 35, 0, 0), finTip: 1.3 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .42, length: 0, offset: 0 }, extras: ['vStruts', 'bracingWires', 'fixedGear'] },
    dr1: { dims: { length: 5.8, span: 7.2, height: 2.95, wingArea: 18.66 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 7.3, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: 1, dihedral: 0, thickness: .12 },
      biplane: { wings: 3, gapToChord: .85, stagger: .1, lowerSpanRatio: .79, lowerChordRatio: 1, middleSpanRatio: .86 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.7, .8, .8, .86, 0, 0, .2, .87, .7, .8, 40, 0, 0), finTip: 1.2 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .45, length: 0, offset: 0 }, extras: ['fixedGear'] },
    fd7: { dims: { length: 7, span: 8.9, height: 2.75, wingArea: 20.5 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 8.8, heightToWidth: 1.3 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: .85, dihedral: 0, thickness: .12 },
      biplane: { wings: 2, gapToChord: .95, stagger: .2, lowerSpanRatio: .8, lowerChordRatio: .8 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.9, .85, .8, .86, 0, 0, .2, .86, .85, .7, 35, 0, 0), finTip: 1.2 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .44, length: 0, offset: 0 }, extras: ['fixedGear'] },
    he51: { dims: { length: 8.4, span: 11, height: 3.2, wingArea: 27.2 }, gear: 'tailwheel',
      fuselage: { profile: 'biplane', section: 'oval', fuselageLengthToWidthRatio: 8.8, heightToWidth: 1.3 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .22, sweepLE: 0, taper: .8, dihedral: 2, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: .2, lowerSpanRatio: .9, lowerChordRatio: .9 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.6, 1.0, .75, .86, 0, 0, .2, .86, 1.0, .7, 35, 0, 0), finTip: 1.4 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .46, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear', 'headrest'] },
    bf109e: { dims: { length: 8.6, span: 9.9, height: 2.6, wingArea: 16.05 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 10.7, heightToWidth: 1.6 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .3, sweepLE: 3, taper: .48, dihedral: 6.5, thickness: .14 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.0, 1.0, .6, .86, 6, 0, .9, .84, 1.3, .55, 25, 0, 0), finTip: 1.45 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .44, length: 1.5, offset: 0 }, extras: ['wingRadiators'] },
    bf109g: { dims: { length: 9, span: 9.9, height: 2.5, wingArea: 16.05 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 11.2, heightToWidth: 1.6 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .31, sweepLE: 3, taper: .48, dihedral: 6.5, thickness: .14 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.0, 1.0, .6, .86, 6, 0, .9, .84, 1.35, .55, 25, 0, 0), finTip: 1.45 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .43, length: 1.5, offset: 0 }, extras: ['wingRadiators'] },
    fw190a: { dims: { length: 9, span: 10.5, height: 3.95, wingArea: 18.3 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'oval', fuselageLengthToWidthRatio: 6.9, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .28, sweepLE: 4, taper: .45, dihedral: 5.5, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.65, 1.15, .55, .86, 6, 0, .3, .82, 1.4, .5, 25, 0, 0), finTip: 1.75 },
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .46, length: 1.7, offset: 0 }, extras: [] },
    me262: { dims: { length: 10.6, span: 12.6, height: 3.5, wingArea: 21.7 }, gear: 'tricycle',
      fuselage: { profile: 'me262', section: 'oval', fuselageLengthToWidthRatio: 8.5, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .4, sweepLE: 18, taper: .45, dihedral: 6, thickness: .11 },
      biplane: null, intakeProfile: 'nacelle', intake: null, engines: { layout: 'underwing_pods', count: 2, positions: [.33], diameter: 1.0, length: 3.6 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fin_mid', finCantDeg: 0, tail: t(4.8, 1.1, .55, .86, 12, 0, .12, .82, 1.5, .45, 25, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .43, length: 1.8, offset: 0 }, extras: [] },
    sabre6: { dims: { length: 11.4, span: 11.6, height: 4.5, wingArea: 28.1 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'oval', fuselageLengthToWidthRatio: 7.4, heightToWidth: 1.1 },
      wing: { wingMountHeight: .2, planform: 'trapezoid', rootLE: .38, sweepLE: 37, taper: .5, dihedral: 3, thickness: .1 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE, splitter: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(3.9, 1.15, .5, .84, 35, 10, .3, .76, 2.2, .4, 40, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .25, length: 1.8, offset: 0 }, extras: [] },
    f104g: { dims: { length: 16.7, span: 6.7, height: 4.09, wingArea: 18.22 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'round', fuselageLengthToWidthRatio: 10.8, heightToWidth: 1.05 },
      wing: { wingMountHeight: .45, planform: 'trapezoid', rootLE: .48, sweepLE: 27, taper: .4, dihedral: -10, thickness: .034 },
      biplane: null, intakeProfile: 'cheek_crescent', intake: { at: .37, length: .24, width: 0.55, height: 0.9, rake: 0, splitter: false, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 't_tail', horizontalTail: 'fin_top', finCantDeg: 0, tail: t(3.63, 1.5, .5, .86, 10, 0, 1, .78, 3.3, .5, 40, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .2, length: 2.0, offset: 0 }, extras: [] },
    mig21mf: { dims: { length: 15.8, span: 7.2, height: 4.12, wingArea: 23 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'round', fuselageLengthToWidthRatio: 10.5, heightToWidth: 1.0 },
      wing: { wingMountHeight: .5, planform: 'delta', rootLE: .45, sweepLE: 57, taper: .05, dihedral: -2, thickness: .05 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(3.7, 1.3, .35, .87, 55, 0, -.1, .7, 3.5, .3, 60, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .27, length: 1.9, offset: 0 }, extras: ['dorsalFin', 'ventralFin'] },
    mig29g: { dims: { length: 17.3, span: 11.4, height: 4.73, wingArea: 38 }, gear: 'tricycle',
      fuselage: { profile: 'flanker', section: 'rounded_box', fuselageLengthToWidthRatio: 7.2, heightToWidth: .7 },
      wing: { wingMountHeight: .6, planform: 'trapezoid', rootLE: .43, sweepLE: 42, taper: .25, dihedral: -2, thickness: .05 },
      biplane: null, intakeProfile: 'ventral_box', intake: { at: .3, length: .2, width: 0.75, height: 0.9, rake: 25, splitter: false, shockCone: false },
      engines: { layout: 'ventral_nacelles', count: 2, lateral: 1.1, diameter: 1.25, from: .3, to: .98 },
      tailConfiguration: 'twin_vertical_canted', horizontalTail: 'fuselage', finCantDeg: 6, tail: t(7.78, 2.2, .35, .87, 45, 0, -.1, .74, 2.9, .4, 40, 1.5, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 2.2, offset: 0 }, extras: ['lerx'] },
    ef2000g: { dims: { length: 15.96, span: 10.95, height: 5.28, wingArea: 51.2 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 7.3, heightToWidth: .8 },
      wing: { wingMountHeight: .4, planform: 'delta', rootLE: .45, sweepLE: 53, taper: .12, dihedral: -2, thickness: .045 },
      biplane: null, intakeProfile: 'chin_scoop', intake: { at: .3, length: .32, width: 1.4, height: 0.7, rake: 10, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.4, 0], [.4, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'none', finCantDeg: 0, tail: t(0, 0, 0, 0, 0, 0, 0, .72, 3.7, .3, 50, 0, 0),
      canardPresence: true, canardLength: 1.45, canardSweep: 50, canardOffset: 0.6, canardHeight: 0, cockpit: { canopy: 'bubble', at: .17, length: 2.4, offset: 0 }, extras: [] },
    gotha: { dims: { length: 12.4, span: 23.7, height: 4.3, wingArea: 89.5 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 9.5, heightToWidth: 1.2 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .25, sweepLE: 5, taper: .9, dihedral: 1, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: 0, lowerSpanRatio: .92, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.22], radial: false, pusher: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(6.0, 1.6, .8, .86, 0, 0, .2, .86, 1.5, .7, 35, 0, 0), finTip: 2.3 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .25, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear', 'pusher'] },
    he111: { dims: { length: 16.4, span: 22.6, height: 4.0, wingArea: 87.6 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'oval', fuselageLengthToWidthRatio: 9.1, heightToWidth: 1.1 },
      wing: { wingMountHeight: .1, planform: 'elliptical', rootLE: .32, sweepLE: 8, taper: .35, dihedral: 5, thickness: .17 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.27], radial: false, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(7.0, 1.9, .55, .85, 6, 0, .3, .8, 2.4, .5, 30, 0, 0), finTip: 2.3 },
      ...NOCANARD, cockpit: { canopy: 'glazed_nose', at: .06, length: 2.0, offset: 0 }, extras: [] },
    ju87: { dims: { length: 11, span: 13.8, height: 4.01, wingArea: 31.9 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 10, heightToWidth: 1.6 },
      wing: { wingMountHeight: 0, planform: 'inverted_gull', rootLE: .3, sweepLE: 3, taper: .45, dihedral: 0, thickness: .16, kink: [.3, -12, 8] },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.5, 1.4, .6, .85, 3, 0, .4, .82, 1.8, .55, 25, 0, 0), finTip: 2.0 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .4, length: 3.2, offset: 0 }, extras: ['spats', 'fixedGear', 'chinRadiator'] },
    hannover: { dims: { length: 7.6, span: 11.7, height: 2.8, wingArea: 32.7 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'oval', fuselageLengthToWidthRatio: 8.0, heightToWidth: 1.3 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .22, sweepLE: 0, taper: .9, dihedral: 2, thickness: .1 },
      biplane: { wings: 2, gapToChord: .9, stagger: .15, lowerSpanRatio: .94, lowerChordRatio: .9 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.0, .9, .8, .86, 0, 0, .3, .86, .8, .7, 35, 0, 0), finTip: 1.3 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .38, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    do17: { dims: { length: 15.8, span: 18, height: 4.56, wingArea: 55 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'oval', fuselageLengthToWidthRatio: 12.2, heightToWidth: 1.45 },
      wing: { wingMountHeight: .8, planform: 'trapezoid', rootLE: .3, sweepLE: 6, taper: .45, dihedral: 3, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.29], radial: true, pusher: false },
      tailConfiguration: 'twin_endplate', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(5.6, 1.5, .7, .86, 4, 0, .3, .85, 1.5, .7, 8, 0, .3), finTip: 2.1 },
      ...NOCANARD, cockpit: { canopy: 'glazed_nose', at: .08, length: 2.0, offset: 0 }, extras: [] },
    ju88: { dims: { length: 14.4, span: 20.1, height: 4.85, wingArea: 54.7 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'oval', fuselageLengthToWidthRatio: 9.3, heightToWidth: 1.35 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .32, sweepLE: 5, taper: .4, dihedral: 5, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.28], radial: true, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(6.4, 1.8, .55, .85, 6, 0, .3, .8, 2.5, .5, 28, 0, 0), finTip: 2.6 },
      ...NOCANARD, cockpit: { canopy: 'glazed_nose', at: .08, length: 2.4, offset: 0 }, extras: [] },
    bf110: { dims: { length: 12.1, span: 16.3, height: 4.13, wingArea: 38.4 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 10.1, heightToWidth: 1.3 },
      wing: { wingMountHeight: .1, planform: 'trapezoid', rootLE: .3, sweepLE: 5, taper: .45, dihedral: 6, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.31], radial: false, pusher: false },
      tailConfiguration: 'twin_endplate', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(5.0, 1.4, .7, .86, 4, 0, .3, .85, 1.4, .7, 8, 0, .3), finTip: 2.0 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .3, length: 3.9, offset: 0 }, extras: [] },
    ar234: { dims: { length: 12.6, span: 14.4, height: 4.29, wingArea: 26.4 }, gear: 'tricycle',
      fuselage: { profile: 'jet_glazed', section: 'oval', fuselageLengthToWidthRatio: 10.1, heightToWidth: 1.2 },
      wing: { wingMountHeight: 1, planform: 'trapezoid', rootLE: .38, sweepLE: 3, taper: .55, dihedral: 3, thickness: .13 },
      biplane: null, intakeProfile: 'nacelle', intake: null, engines: { layout: 'underwing_pods', count: 2, positions: [.4], diameter: .95, length: 3.6 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(4.4, 1.2, .55, .86, 8, 0, .3, .8, 1.8, .5, 25, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'glazed_nose', at: .05, length: 1.6, offset: 0 }, extras: [] },
    g91: { dims: { length: 10.3, span: 8.6, height: 4.0, wingArea: 16.42 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_oval', section: 'oval', fuselageLengthToWidthRatio: 6.9, heightToWidth: 1.05 },
      wing: { wingMountHeight: .1, planform: 'trapezoid', rootLE: .4, sweepLE: 37, taper: .5, dihedral: 2, thickness: .09 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(3.9, 1.1, .5, .85, 35, 0, .2, .75, 2.0, .4, 40, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .25, length: 1.5, offset: 0 }, extras: [] },
    tornadoids: { dims: { length: 16.7, span: 13.9, height: 5.95, wingArea: 26.6 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 5.8, heightToWidth: .65 },
      wing: { wingMountHeight: .9, planform: 'trapezoid', rootLE: .42, sweepLE: 25, taper: .35, dihedral: 0, thickness: .06 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .3, length: .3, width: 0.75, height: 1.25, rake: 15, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.27, 0], [.27, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(6.8, 2.4, .45, .86, 45, -3, 0, .7, 4.5, .3, 50, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .2, length: 3.6, offset: 0 }, extras: ['wingGlove'] },
    // ======================= Britain =======================
    camel: { dims: { length: 5.7, span: 8.5, height: 2.59, wingArea: 21.46 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 7.6, heightToWidth: 1.3 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .18, sweepLE: 0, taper: 1, dihedral: 5, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.1, stagger: .2, lowerSpanRatio: 1, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.6, .8, .8, .86, 0, 0, .2, .86, .7, .7, 40, 0, 0), finTip: 1.2 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .42, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear', 'gunHump'] },
    se5a: { dims: { length: 6.4, span: 8.1, height: 2.89, wingArea: 22.67 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 7.5, heightToWidth: 1.3 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: 1, dihedral: 5, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: .15, lowerSpanRatio: .96, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.8, .85, .8, .86, 0, 0, .2, .86, .8, .7, 35, 0, 0), finTip: 1.3 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .44, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    gladiator: { dims: { length: 8.4, span: 9.8, height: 3.53, wingArea: 30 }, gear: 'tailwheel',
      fuselage: { profile: 'biplane', section: 'oval', fuselageLengthToWidthRatio: 7.3, heightToWidth: 1.05 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .22, sweepLE: 0, taper: .9, dihedral: 3, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: .2, lowerSpanRatio: .95, lowerChordRatio: .95 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.4, 1.0, .75, .86, 0, 0, .2, .86, 1.0, .7, 35, 0, 0), finTip: 1.5 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .47, length: 1.4, offset: 0 }, extras: ['fixedGear'] },
    hurri1: { dims: { length: 9.8, span: 12.2, height: 4.0, wingArea: 23.92 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 9.3, heightToWidth: 1.45 },
      wing: { wingMountHeight: .05, planform: 'trapezoid', rootLE: .29, sweepLE: 3, taper: .5, dihedral: 3.5, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.5, 1.3, .55, .84, 6, 0, .3, .82, 1.7, .5, 30, 0, 0), finTip: 1.85 },
      ...NOCANARD, cockpit: { canopy: 'razorback', at: .44, length: 1.6, offset: 0 }, extras: ['bellyScoop'] },
    spit9: { dims: { length: 9.5, span: 11.2, height: 3.85, wingArea: 22.48 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 11.2, heightToWidth: 1.6 },
      wing: { wingMountHeight: .05, planform: 'elliptical', rootLE: .27, sweepLE: 0, taper: .2, dihedral: 6, thickness: .13 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.2, 1.2, .5, .85, 4, 0, .3, .83, 1.4, .5, 20, 0, 0), finTip: 1.75 },
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .45, length: 1.6, offset: 0 }, extras: ['wingRadiators'] },
    typhoon1b: { dims: { length: 9.7, span: 12.7, height: 4.67, wingArea: 25.92 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 8.8, heightToWidth: 1.4 },
      wing: { wingMountHeight: .05, planform: 'trapezoid', rootLE: .29, sweepLE: 3, taper: .5, dihedral: 5.5, thickness: .18 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.1, 1.4, .55, .84, 6, 0, .3, .82, 1.8, .5, 28, 0, 0), finTip: 2.0 },
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .44, length: 1.7, offset: 0 }, extras: ['chinRadiator'] },
    meteor8: { dims: { length: 13.6, span: 11.3, height: 3.96, wingArea: 32.5 }, gear: 'tricycle',
      fuselage: { profile: 'jet_pod_tail', section: 'oval', fuselageLengthToWidthRatio: 11.3, heightToWidth: 1.25 },
      wing: { wingMountHeight: .3, planform: 'trapezoid', rootLE: .38, sweepLE: 4, taper: .55, dihedral: 4, thickness: .12 },
      biplane: null, intakeProfile: 'nacelle', intake: null, engines: { layout: 'wing_nacelles', count: 2, positions: [.31], diameter: 1.15, length: 4.6 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fin_mid', finCantDeg: 0, tail: t(4.7, 1.2, .6, .87, 12, 0, .38, .8, 2.0, .55, 25, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 1.9, offset: 0 }, extras: [] },
    hunter6: { dims: { length: 14, span: 10.3, height: 4.01, wingArea: 32.42 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'oval', fuselageLengthToWidthRatio: 8.8, heightToWidth: 1.1 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .38, sweepLE: 40, taper: .35, dihedral: -1, thickness: .085 },
      biplane: null, intakeProfile: 'wing_root', intake: { at: .38, length: .05, width: 0.9, height: 0.3, rake: 0, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fin_mid', finCantDeg: 0, tail: t(3.5, 1.3, .45, .85, 40, 0, .22, .74, 2.8, .4, 45, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 1.9, offset: 0 }, extras: [] },
    lightning: { dims: { length: 16.8, span: 10.6, height: 5.97, wingArea: 44.08 }, gear: 'tricycle',
      fuselage: { profile: 'lightning', section: 'oval', fuselageLengthToWidthRatio: 10.5, heightToWidth: 1.45 },
      wing: { wingMountHeight: .5, planform: 'delta', rootLE: .45, sweepLE: 60, taper: .3, dihedral: 0, thickness: .05 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[0, .38], [0, -.32]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(4.4, 1.7, .4, .88, 60, 0, -.6, .74, 3.9, .35, 55, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .22, length: 2.2, offset: 0 }, extras: ['ventralTank'] },
    tornadof3: { dims: { length: 18.7, span: 13.9, height: 5.95, wingArea: 26.6 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 6.4, heightToWidth: .65 },
      wing: { wingMountHeight: .9, planform: 'trapezoid', rootLE: .44, sweepLE: 25, taper: .35, dihedral: 0, thickness: .06 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .32, length: .3, width: 0.75, height: 1.25, rake: 15, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.27, 0], [.27, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(6.8, 2.4, .45, .87, 45, -3, 0, .72, 4.5, .3, 50, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .2, length: 3.6, offset: 0 }, extras: ['wingGlove'] },
    ef2000uk: { dims: { length: 15.96, span: 10.95, height: 5.28, wingArea: 51.2 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 7.3, heightToWidth: .8 },
      wing: { wingMountHeight: .4, planform: 'delta', rootLE: .45, sweepLE: 53, taper: .12, dihedral: -2, thickness: .045 },
      biplane: null, intakeProfile: 'chin_scoop', intake: { at: .3, length: .32, width: 1.4, height: 0.7, rake: 10, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.4, 0], [.4, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'none', finCantDeg: 0, tail: t(0, 0, 0, 0, 0, 0, 0, .72, 3.7, .3, 50, 0, 0),
      canardPresence: true, canardLength: 1.45, canardSweep: 50, canardOffset: 0.6, canardHeight: 0, cockpit: { canopy: 'bubble', at: .17, length: 2.4, offset: 0 }, extras: [] },
    ho400: { dims: { length: 19.2, span: 30.5, height: 6.7, wingArea: 153.1 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 13.7, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: 1, dihedral: 2, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: 0, lowerSpanRatio: .83, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.19], radial: false, pusher: false },
      tailConfiguration: 'twin_endplate', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(6.0, 1.7, .9, .86, 0, 0, .3, .86, 1.6, .9, 5, 0, .4), finTip: 2.4 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .2, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    dh9a: { dims: { length: 9.2, span: 14, height: 3.45, wingArea: 45.2 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 9.7, heightToWidth: 1.35 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .22, sweepLE: 0, taper: 1, dihedral: 3, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: .1, lowerSpanRatio: 1, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.4, 1.1, .8, .86, 0, 0, .2, .86, 1.0, .7, 35, 0, 0), finTip: 1.5 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .4, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    hart: { dims: { length: 9, span: 11.4, height: 3.17, wingArea: 32.3 }, gear: 'tailwheel',
      fuselage: { profile: 'biplane', section: 'oval', fuselageLengthToWidthRatio: 9.5, heightToWidth: 1.35 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .22, sweepLE: 6, taper: .9, dihedral: 3, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: .25, lowerSpanRatio: .9, lowerChordRatio: .9 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.8, 1.0, .75, .86, 0, 0, .2, .86, 1.0, .7, 35, 0, 0), finTip: 1.45 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .4, length: 0, offset: 0 }, extras: ['fixedGear'] },
    blenheim: { dims: { length: 12.98, span: 17.2, height: 3.0, wingArea: 43.57 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'oval', fuselageLengthToWidthRatio: 9.3, heightToWidth: 1.35 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .32, sweepLE: 5, taper: .45, dihedral: 6, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.29], radial: true, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(5.0, 1.5, .55, .86, 6, 0, .3, .82, 1.8, .5, 30, 0, 0), finTip: 1.9 },
      ...NOCANARD, cockpit: { canopy: 'glazed_nose', at: .06, length: 1.6, offset: 0 }, extras: [] },
    mosquito: { dims: { length: 13.6, span: 16.5, height: 5.3, wingArea: 42.18 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 9.7, heightToWidth: 1.25 },
      wing: { wingMountHeight: .6, planform: 'trapezoid', rootLE: .3, sweepLE: 5, taper: .4, dihedral: 3, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.29], radial: false, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(6.0, 1.5, .55, .86, 4, 0, .3, .8, 2.3, .45, 30, 0, 0), finTip: 2.3 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .25, length: 2.0, offset: 0 }, extras: [] },
    lancaster: { dims: { length: 21.1, span: 31.1, height: 6.1, wingArea: 120 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_solid', section: 'oval', fuselageLengthToWidthRatio: 11.7, heightToWidth: 1.35 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .3, sweepLE: 5, taper: .4, dihedral: 3, thickness: .17 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 4, positions: [.23, .45], radial: false, pusher: false },
      tailConfiguration: 'twin_endplate', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(10.0, 2.7, .8, .86, 4, 0, .3, .85, 2.5, .8, 5, 0, .4), finTip: 2.9 },
      ...NOCANARD, cockpit: { canopy: 'stepped', at: .22, length: 2.4, offset: 0 }, extras: [] },
    canberra: { dims: { length: 20, span: 19.5, height: 4.75, wingArea: 89.2 }, gear: 'tricycle',
      fuselage: { profile: 'jet_tapered', section: 'round', fuselageLengthToWidthRatio: 10.5, heightToWidth: 1.0 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .35, sweepLE: 10, taper: .45, dihedral: 2, thickness: .12 },
      biplane: null, intakeProfile: 'nacelle', intake: null, engines: { layout: 'wing_nacelles', count: 2, positions: [.29], diameter: 1.2, length: 5.2 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(8.5, 2.1, .55, .87, 12, 10, .3, .8, 3.6, .5, 30, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .14, length: 1.8, offset: -.45 }, extras: [] },
    buccaneer: { dims: { length: 19.3, span: 13.4, height: 4.97, wingArea: 47.82 }, gear: 'tricycle',
      fuselage: { profile: 'buccaneer', section: 'oval', fuselageLengthToWidthRatio: 10.2, heightToWidth: 1.05 },
      wing: { wingMountHeight: .45, planform: 'trapezoid', rootLE: .42, sweepLE: 40, taper: .45, dihedral: -1, thickness: .08 },
      biplane: null, intakeProfile: 'nacelle', intake: null, engines: { layout: 'fuselage_side_nacelles', count: 2, at: .38, diameter: 1.6, length: 6.2, lateral: 0 },
      tailConfiguration: 't_tail', horizontalTail: 'fin_top', finCantDeg: 0, tail: t(4.3, 1.9, .5, .88, 35, 0, 1, .76, 4.2, .5, 40, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .18, length: 3.9, offset: 0 }, extras: [] },
    tornadogr1: { dims: { length: 16.7, span: 13.9, height: 5.95, wingArea: 26.6 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 5.8, heightToWidth: .65 },
      wing: { wingMountHeight: .9, planform: 'trapezoid', rootLE: .42, sweepLE: 25, taper: .35, dihedral: 0, thickness: .06 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .3, length: .3, width: 0.75, height: 1.25, rake: 15, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.27, 0], [.27, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(6.8, 2.4, .45, .86, 45, -3, 0, .7, 4.5, .3, 50, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .2, length: 3.6, offset: 0 }, extras: ['wingGlove'] },
    // ======================= USSR / Russia =======================
    n17ru: { dims: { length: 5.8, span: 8.2, height: 2.4, wingArea: 14.75 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 7.2, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: 1, dihedral: 1, thickness: .08 },
      biplane: { wings: 2, gapToChord: 1.1, stagger: .2, lowerSpanRatio: .95, lowerChordRatio: .5 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.4, .7, .8, .86, 0, 0, .2, .86, .7, .7, 40, 0, 0), finTip: 1.1 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .44, length: 0, offset: 0 }, extras: ['vStruts', 'bracingWires', 'fixedGear'] },
    i15: { dims: { length: 6.3, span: 10.2, height: 2.2, wingArea: 22.5 }, gear: 'tailwheel',
      fuselage: { profile: 'biplane', section: 'round', fuselageLengthToWidthRatio: 6.3, heightToWidth: 1.0 },
      wing: { wingMountHeight: 0, planform: 'gull', rootLE: .2, sweepLE: 0, taper: .85, dihedral: 0, thickness: .1, kink: [.15, 25, 3] },
      biplane: { wings: 2, gapToChord: 1.0, stagger: .2, lowerSpanRatio: .73, lowerChordRatio: .8 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.0, .8, .75, .86, 0, 0, .2, .86, .8, .7, 35, 0, 0), finTip: 1.2 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .48, length: 0, offset: 0 }, extras: ['fixedGear'] },
    i16: { dims: { length: 6.1, span: 9, height: 3.25, wingArea: 14.54 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'round', fuselageLengthToWidthRatio: 4.4, heightToWidth: 1.0 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .25, sweepLE: 6, taper: .5, dihedral: 4, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.0, .95, .6, .84, 6, 0, .2, .82, 1.0, .55, 30, 0, 0), finTip: 1.45 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .5, length: 0, offset: 0 }, extras: ['headrest'] },
    yak3: { dims: { length: 8.5, span: 9.2, height: 2.39, wingArea: 14.85 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 10, heightToWidth: 1.45 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .3, sweepLE: 4, taper: .45, dihedral: 6, thickness: .14 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.0, 1.0, .55, .85, 6, 0, .3, .82, 1.3, .5, 28, 0, 0), finTip: 1.4 },
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .47, length: 1.5, offset: 0 }, extras: ['bellyScoop'] },
    la5fn: { dims: { length: 8.7, span: 9.8, height: 2.54, wingArea: 17.5 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'oval', fuselageLengthToWidthRatio: 6.9, heightToWidth: 1.1 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .28, sweepLE: 4, taper: .5, dihedral: 5, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.5, 1.05, .55, .85, 6, 0, .3, .82, 1.3, .5, 28, 0, 0), finTip: 1.5 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .47, length: 1.6, offset: 0 }, extras: [] },
    il2: { dims: { length: 11.6, span: 14.6, height: 4.17, wingArea: 38.5 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 9.3, heightToWidth: 1.3 },
      wing: { wingMountHeight: 0, planform: 'cranked', rootLE: .3, sweepLE: 15, taper: .45, dihedral: 0, thickness: .15, kink: [.3, 0, 5] },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.9, 1.4, .6, .86, 6, 0, .3, .83, 1.6, .55, 28, 0, 0), finTip: 1.9 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .4, length: 2.6, offset: 0 }, extras: [] },
    mig15: { dims: { length: 10.1, span: 10.1, height: 3.7, wingArea: 20.6 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'round', fuselageLengthToWidthRatio: 7.0, heightToWidth: 1.15 },
      wing: { wingMountHeight: .55, planform: 'trapezoid', rootLE: .37, sweepLE: 37, taper: .5, dihedral: -2, thickness: .1 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE, splitter: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fin_mid', finCantDeg: 0, tail: t(3.75, 1.1, .5, .86, 40, 0, .55, .72, 2.3, .4, 56, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .27, length: 1.5, offset: 0 }, extras: ['wingFences'] },
    mig17: { dims: { length: 11.3, span: 9.6, height: 3.8, wingArea: 22.6 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'round', fuselageLengthToWidthRatio: 7.8, heightToWidth: 1.15 },
      wing: { wingMountHeight: .55, planform: 'trapezoid', rootLE: .38, sweepLE: 45, taper: .45, dihedral: -3, thickness: .08 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE, splitter: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fin_mid', finCantDeg: 0, tail: t(3.4, 1.1, .5, .86, 45, 0, .5, .72, 2.6, .4, 56, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .26, length: 1.5, offset: 0 }, extras: ['wingFences'] },
    mig21bis: { dims: { length: 15.8, span: 7.2, height: 4.13, wingArea: 23 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'round', fuselageLengthToWidthRatio: 10.5, heightToWidth: 1.0 },
      wing: { wingMountHeight: .5, planform: 'delta', rootLE: .45, sweepLE: 57, taper: .05, dihedral: -2, thickness: .05 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(3.7, 1.3, .35, .87, 55, 0, -.1, .7, 3.5, .3, 60, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .27, length: 1.9, offset: 0 }, extras: ['dorsalFin', 'ventralFin'] },
    mig23: { dims: { length: 16.7, span: 13.97, height: 4.82, wingArea: 37.35 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 6.4, heightToWidth: .7 },
      wing: { wingMountHeight: .9, planform: 'trapezoid', rootLE: .45, sweepLE: 20, taper: .3, dihedral: -3, thickness: .05 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .27, length: .35, width: 0.7, height: 1.2, rake: 5, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(5.8, 2.3, .35, .87, 55, 0, 0, .7, 4.5, .3, 55, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .2, length: 2.0, offset: 0 }, extras: ['wingGlove', 'dorsalFin', 'ventralFin'] },
    mig29: { dims: { length: 17.3, span: 11.4, height: 4.73, wingArea: 38 }, gear: 'tricycle',
      fuselage: { profile: 'flanker', section: 'rounded_box', fuselageLengthToWidthRatio: 7.2, heightToWidth: .7 },
      wing: { wingMountHeight: .6, planform: 'trapezoid', rootLE: .43, sweepLE: 42, taper: .25, dihedral: -2, thickness: .05 },
      biplane: null, intakeProfile: 'ventral_box', intake: { at: .3, length: .2, width: 0.75, height: 0.9, rake: 25, splitter: false, shockCone: false },
      engines: { layout: 'ventral_nacelles', count: 2, lateral: 1.1, diameter: 1.25, from: .3, to: .98 },
      tailConfiguration: 'twin_vertical_canted', horizontalTail: 'fuselage', finCantDeg: 6, tail: t(7.78, 2.2, .35, .87, 45, 0, -.1, .74, 2.9, .4, 40, 1.5, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 2.2, offset: 0 }, extras: ['lerx'] },
    su27: { dims: { length: 21.9, span: 14.7, height: 5.93, wingArea: 62 }, gear: 'tricycle',
      fuselage: { profile: 'flanker', section: 'rounded_box', fuselageLengthToWidthRatio: 8.4, heightToWidth: .7 },
      wing: { wingMountHeight: .6, planform: 'trapezoid', rootLE: .44, sweepLE: 42, taper: .23, dihedral: -2, thickness: .05 },
      biplane: null, intakeProfile: 'ventral_box', intake: { at: .3, length: .22, width: 0.9, height: 1.15, rake: 25, splitter: false, shockCone: false },
      engines: { layout: 'ventral_nacelles', count: 2, lateral: 1.25, diameter: 1.4, from: .3, to: .97 },
      tailConfiguration: 'twin_vertical_straight', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(9.9, 2.6, .35, .87, 45, 0, -.1, .74, 3.5, .4, 40, 1.75, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .18, length: 2.6, offset: 0 }, extras: ['lerx', 'tipRails'] },
    su35s: { dims: { length: 21.9, span: 15.3, height: 5.9, wingArea: 62 }, gear: 'tricycle',
      fuselage: { profile: 'flanker', section: 'rounded_box', fuselageLengthToWidthRatio: 8.4, heightToWidth: .7 },
      wing: { wingMountHeight: .6, planform: 'trapezoid', rootLE: .44, sweepLE: 42, taper: .23, dihedral: -2, thickness: .05 },
      biplane: null, intakeProfile: 'ventral_box', intake: { at: .3, length: .22, width: 0.9, height: 1.15, rake: 25, splitter: false, shockCone: false },
      engines: { layout: 'ventral_nacelles', count: 2, lateral: 1.25, diameter: 1.4, from: .3, to: .97 },
      tailConfiguration: 'twin_vertical_straight', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(9.9, 2.6, .35, .87, 45, 0, -.1, .74, 3.5, .4, 40, 1.75, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .18, length: 2.6, offset: 0 }, extras: ['lerx', 'tipRails'] },
    su57: { dims: { length: 20.1, span: 14.1, height: 4.6, wingArea: 78.8 }, gear: 'tricycle',
      fuselage: { profile: 'flanker', section: 'box', fuselageLengthToWidthRatio: 6.3, heightToWidth: .55 },
      wing: { wingMountHeight: .6, planform: 'diamond', rootLE: .42, sweepLE: 48, taper: .15, dihedral: -2, thickness: .04, sweepTE: -14 },
      biplane: null, intakeProfile: 'ventral_box', intake: { at: .28, length: .26, width: 1.0, height: 1.2, rake: 20, splitter: false, shockCone: false },
      engines: { layout: 'ventral_nacelles', count: 2, lateral: 1.2, diameter: 1.4, from: .28, to: .97 },
      tailConfiguration: 'twin_vertical_canted', horizontalTail: 'fuselage', finCantDeg: 26, tail: t(9.4, 2.6, .25, .87, 45, 0, -.1, .76, 3.4, .4, 45, 1.6, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .19, length: 2.6, offset: 0 }, extras: ['lerx'] },
    pe2: { dims: { length: 12.7, span: 17.2, height: 3.5, wingArea: 40.5 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 10.2, heightToWidth: 1.25 },
      wing: { wingMountHeight: .1, planform: 'trapezoid', rootLE: .3, sweepLE: 5, taper: .45, dihedral: 5, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.3], radial: false, pusher: false },
      tailConfiguration: 'twin_endplate', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(5.6, 1.4, .7, .86, 4, 8, .4, .85, 1.4, .7, 8, 0, .3), finTip: 1.9 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .3, length: 3.2, offset: 0 }, extras: [] },
    tu16: { dims: { length: 34.8, span: 33, height: 10.36, wingArea: 164.7 }, gear: 'tricycle',
      fuselage: { profile: 'jet_glazed', section: 'round', fuselageLengthToWidthRatio: 13.9, heightToWidth: 1.0 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .38, sweepLE: 37, taper: .4, dihedral: -3, thickness: .12 },
      biplane: null, intakeProfile: 'nacelle', intake: null, engines: { layout: 'fuselage_side_nacelles', count: 2, at: .36, diameter: 2.0, length: 9.0, lateral: 0 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(11.75, 3.2, .45, .87, 42, 0, .2, .78, 6.5, .4, 45, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'glazed_nose', at: .05, length: 3.6, offset: 0 }, extras: ['gearPods'] },
    su24: { dims: { length: 22.5, span: 17.6, height: 6.19, wingArea: 55.2 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 7.0, heightToWidth: .6 },
      wing: { wingMountHeight: .9, planform: 'trapezoid', rootLE: .42, sweepLE: 16, taper: .35, dihedral: -3, thickness: .06 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .3, length: .35, width: 0.8, height: 1.2, rake: 5, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.28, 0], [.28, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(8.8, 2.9, .4, .86, 55, 0, 0, .7, 5.2, .3, 55, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'side_by_side', at: .18, length: 2.6, offset: 0 }, extras: ['wingGlove'] },
    muromets: { dims: { length: 17.1, span: 29.8, height: 4.7, wingArea: 128 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 10.7, heightToWidth: 1.2 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .3, sweepLE: 0, taper: 1, dihedral: 0, thickness: .09 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: 0, lowerSpanRatio: .7, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 4, positions: [.2, .36], radial: false, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(8.0, 2.0, .9, .84, 0, 0, .3, .86, 1.6, .8, 20, 0, 0), finTip: 2.0 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .12, length: 3.0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    tb3: { dims: { length: 24.4, span: 41.8, height: 8.5, wingArea: 234.5 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_solid', section: 'box', fuselageLengthToWidthRatio: 11.1, heightToWidth: 1.2 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .28, sweepLE: 6, taper: .4, dihedral: 2, thickness: .2 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 4, positions: [.22, .43], radial: false, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(12.0, 3.2, .55, .85, 6, 0, .3, .8, 3.6, .5, 30, 0, 0), finTip: 3.6 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .22, length: 0, offset: 0 }, extras: ['fixedGear'] },
    sb2: { dims: { length: 12.6, span: 20.3, height: 3.6, wingArea: 56.7 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'oval', fuselageLengthToWidthRatio: 8.4, heightToWidth: 1.2 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .32, sweepLE: 6, taper: .4, dihedral: 4, thickness: .17 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.25], radial: false, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(6.0, 1.6, .55, .86, 6, 0, .3, .82, 2.0, .5, 30, 0, 0), finTip: 2.0 },
      ...NOCANARD, cockpit: { canopy: 'glazed_nose', at: .06, length: 1.6, offset: 0 }, extras: [] },
    tu2: { dims: { length: 13.8, span: 18.9, height: 4.55, wingArea: 48.8 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'oval', fuselageLengthToWidthRatio: 9.2, heightToWidth: 1.3 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .32, sweepLE: 5, taper: .45, dihedral: 4, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.29], radial: true, pusher: false },
      tailConfiguration: 'twin_endplate', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(6.4, 1.6, .7, .86, 4, 0, .3, .85, 1.6, .7, 8, 0, .3), finTip: 2.2 },
      ...NOCANARD, cockpit: { canopy: 'stepped', at: .2, length: 2.2, offset: 0 }, extras: [] },
    il28: { dims: { length: 17.6, span: 21.5, height: 6.7, wingArea: 60.8 }, gear: 'tricycle',
      fuselage: { profile: 'jet_glazed', section: 'oval', fuselageLengthToWidthRatio: 9.8, heightToWidth: 1.1 },
      wing: { wingMountHeight: .75, planform: 'trapezoid', rootLE: .38, sweepLE: 3, taper: .55, dihedral: 2, thickness: .13 },
      biplane: null, intakeProfile: 'nacelle', intake: null, engines: { layout: 'underwing_pods', count: 2, positions: [.29], diameter: 1.4, length: 5.0 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(7.1, 2.0, .45, .86, 35, 7, .3, .78, 3.4, .4, 40, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 1.7, offset: 0 }, extras: [] },
    su7b: { dims: { length: 16.8, span: 9.3, height: 4.99, wingArea: 34 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'round', fuselageLengthToWidthRatio: 10.5, heightToWidth: 1.05 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .45, sweepLE: 60, taper: .3, dihedral: -2, thickness: .06 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(4.4, 1.6, .35, .87, 55, 0, -.2, .74, 3.4, .3, 55, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .27, length: 2.0, offset: 0 }, extras: ['wingFences', 'dorsalFin'] },
    su25: { dims: { length: 15.5, span: 14.4, height: 5.2, wingArea: 30.1 }, gear: 'tricycle',
      fuselage: { profile: 'jet_tapered', section: 'oval', fuselageLengthToWidthRatio: 9.7, heightToWidth: 1.15 },
      wing: { wingMountHeight: .85, planform: 'trapezoid', rootLE: .38, sweepLE: 20, taper: .45, dihedral: -2, thickness: .1 },
      biplane: null, intakeProfile: 'nacelle', intake: null, engines: { layout: 'fuselage_side_nacelles', count: 2, at: .36, diameter: 1.25, length: 7.8, lateral: .1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(4.65, 1.5, .5, .86, 25, 5, .3, .76, 2.6, .45, 35, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .17, length: 1.6, offset: 0 }, extras: [] },
    su34: { dims: { length: 23.3, span: 14.7, height: 6.09, wingArea: 62 }, gear: 'tricycle',
      fuselage: { profile: 'flanker', section: 'rounded_box', fuselageLengthToWidthRatio: 7.8, heightToWidth: .7 },
      wing: { wingMountHeight: .6, planform: 'trapezoid', rootLE: .44, sweepLE: 42, taper: .23, dihedral: -2, thickness: .05 },
      biplane: null, intakeProfile: 'ventral_box', intake: { at: .32, length: .2, width: 0.9, height: 1.1, rake: 25, splitter: false, shockCone: false },
      engines: { layout: 'ventral_nacelles', count: 2, lateral: 1.25, diameter: 1.35, from: .32, to: .97 },
      tailConfiguration: 'twin_vertical_straight', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(9.9, 2.5, .35, .87, 45, 0, -.1, .75, 3.3, .4, 40, 1.75, 0),
      canardPresence: true, canardLength: 1.5, canardSweep: 53, canardOffset: 4.2, canardHeight: .2, cockpit: { canopy: 'side_by_side', at: .16, length: 2.8, offset: 0 }, extras: ['lerx', 'duckbillNose'] },
    // ======================= Japan =======================
    n24ko3: { dims: { length: 5.9, span: 8.2, height: 2.4, wingArea: 14.75 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'round', fuselageLengthToWidthRatio: 7.4, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: 1, dihedral: 1, thickness: .08 },
      biplane: { wings: 2, gapToChord: 1.1, stagger: .2, lowerSpanRatio: .95, lowerChordRatio: .5 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.4, .7, .8, .86, 0, 0, .2, .86, .7, .7, 40, 0, 0), finTip: 1.1 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .44, length: 0, offset: 0 }, extras: ['vStruts', 'bracingWires', 'fixedGear'] },
    ki10: { dims: { length: 7.6, span: 10, height: 3.0, wingArea: 23 }, gear: 'tailwheel',
      fuselage: { profile: 'biplane', section: 'oval', fuselageLengthToWidthRatio: 7.6, heightToWidth: 1.05 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .22, sweepLE: 0, taper: .8, dihedral: 2, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.0, stagger: .2, lowerSpanRatio: .9, lowerChordRatio: .85 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.4, .95, .75, .86, 0, 0, .2, .86, .95, .7, 35, 0, 0), finTip: 1.4 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .46, length: 0, offset: 0 }, extras: ['fixedGear', 'headrest'] },
    ki27: { dims: { length: 7.5, span: 11.3, height: 3.25, wingArea: 18.56 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'round', fuselageLengthToWidthRatio: 6.5, heightToWidth: 1.1 },
      wing: { wingMountHeight: 0, planform: 'elliptical', rootLE: .27, sweepLE: 3, taper: .3, dihedral: 6, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.4, 1.0, .55, .85, 6, 0, .25, .82, 1.2, .5, 28, 0, 0), finTip: 1.5 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .5, length: 1.6, offset: 0 }, extras: ['spats', 'fixedGear'] },
    a6m2: { dims: { length: 9.06, span: 12, height: 3.05, wingArea: 22.44 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'round', fuselageLengthToWidthRatio: 7.6, heightToWidth: 1.1 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .28, sweepLE: 4, taper: .45, dihedral: 6.5, thickness: .14 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.0, 1.1, .55, .86, 6, 0, .25, .83, 1.4, .5, 28, 0, 0), finTip: 1.55 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .46, length: 2.4, offset: 0 }, extras: [] },
    ki43: { dims: { length: 8.9, span: 10.8, height: 3.27, wingArea: 21.4 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'round', fuselageLengthToWidthRatio: 7.5, heightToWidth: 1.1 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .28, sweepLE: 4, taper: .45, dihedral: 6, thickness: .14 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.6, 1.05, .55, .86, 6, 0, .25, .83, 1.3, .5, 28, 0, 0), finTip: 1.55 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .47, length: 1.7, offset: 0 }, extras: [] },
    n1k2: { dims: { length: 9.3, span: 12, height: 3.96, wingArea: 23.5 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'round', fuselageLengthToWidthRatio: 7.2, heightToWidth: 1.15 },
      wing: { wingMountHeight: .3, planform: 'trapezoid', rootLE: .28, sweepLE: 4, taper: .45, dihedral: 6, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.0, 1.2, .55, .86, 6, 0, .25, .83, 1.5, .5, 28, 0, 0), finTip: 1.75 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .46, length: 1.8, offset: 0 }, extras: [] },
    ki84: { dims: { length: 9.9, span: 11.2, height: 3.39, wingArea: 21 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'round', fuselageLengthToWidthRatio: 8.2, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .29, sweepLE: 4, taper: .45, dihedral: 6, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.0, 1.15, .55, .86, 6, 0, .25, .83, 1.5, .5, 28, 0, 0), finTip: 1.7 },
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .46, length: 1.8, offset: 0 }, extras: [] },
    f86fj: { dims: { length: 11.4, span: 11.9, height: 4.5, wingArea: 28.1 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'oval', fuselageLengthToWidthRatio: 7.4, heightToWidth: 1.1 },
      wing: { wingMountHeight: .2, planform: 'trapezoid', rootLE: .38, sweepLE: 37, taper: .5, dihedral: 3, thickness: .1 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE, splitter: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(3.9, 1.15, .5, .84, 35, 10, .3, .76, 2.2, .4, 40, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .25, length: 1.8, offset: 0 }, extras: [] },
    f104j: { dims: { length: 16.7, span: 6.7, height: 4.09, wingArea: 18.22 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'round', fuselageLengthToWidthRatio: 10.8, heightToWidth: 1.05 },
      wing: { wingMountHeight: .45, planform: 'trapezoid', rootLE: .48, sweepLE: 27, taper: .4, dihedral: -10, thickness: .034 },
      biplane: null, intakeProfile: 'cheek_crescent', intake: { at: .37, length: .24, width: 0.55, height: 0.9, rake: 0, splitter: false, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 't_tail', horizontalTail: 'fin_top', finCantDeg: 0, tail: t(3.63, 1.5, .5, .86, 10, 0, 1, .78, 3.3, .5, 40, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .2, length: 2.0, offset: 0 }, extras: [] },
    f4ej: { dims: { length: 19.2, span: 11.7, height: 5.0, wingArea: 49.24 }, gear: 'tricycle',
      fuselage: { profile: 'f4', section: 'rounded_box', fuselageLengthToWidthRatio: 5.8, heightToWidth: .58 },
      wing: { wingMountHeight: .1, planform: 'cranked', rootLE: .4, sweepLE: 45, taper: .3, dihedral: 0, thickness: .05, kink: [.6, 0, 12] },
      biplane: null, intakeProfile: 'side_box', intake: { at: .22, length: .36, width: 0.75, height: 1.35, rake: 12, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.3, -.25], [.3, -.25]], nozzleAt: .8 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(5.4, 1.9, .45, .88, 43, -23, .7, .76, 3.8, .35, 50, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .21, length: 3.8, offset: 0 }, extras: [] },
    f15j: { dims: { length: 19.4, span: 13, height: 5.63, wingArea: 56.5 }, gear: 'tricycle',
      fuselage: { profile: 'jet_blended', section: 'rounded_box', fuselageLengthToWidthRatio: 4.4, heightToWidth: .45 },
      wing: { wingMountHeight: .85, planform: 'trapezoid', rootLE: .38, sweepLE: 45, taper: .27, dihedral: -1, thickness: .05 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .2, length: .42, width: 1.1, height: 1.5, rake: 25, splitter: true, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.3, 0], [.3, 0]], nozzleAt: 1 },
      tailConfiguration: 'twin_vertical_straight', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(8.6, 2.8, .35, .87, 50, 0, 0, .8, 3.3, .45, 36, .55, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 2.7, offset: 0 }, extras: [] },
    f2a: { dims: { length: 15.5, span: 11.1, height: 4.96, wingArea: 34.84 }, gear: 'tricycle',
      fuselage: { profile: 'jet_f16', section: 'oval', fuselageLengthToWidthRatio: 6.8, heightToWidth: .65 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .4, sweepLE: 33, taper: .23, dihedral: 0, thickness: .04 },
      biplane: null, intakeProfile: 'chin_scoop', intake: { at: .26, length: .36, width: 1.25, height: 0.85, rake: 8, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(5.9, 1.75, .35, .87, 40, -10, 0, .76, 3.1, .4, 47, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 2.6, offset: 0 }, extras: ['lerx', 'ventralFin'] },
    ki21: { dims: { length: 16, span: 22.5, height: 4.85, wingArea: 69.6 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'oval', fuselageLengthToWidthRatio: 10, heightToWidth: 1.2 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .32, sweepLE: 5, taper: .45, dihedral: 4, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.27], radial: true, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(6.8, 1.9, .55, .85, 6, 0, .3, .8, 2.4, .5, 30, 0, 0), finTip: 2.5 },
      ...NOCANARD, cockpit: { canopy: 'stepped', at: .22, length: 2.4, offset: 0 }, extras: [] },
    d3a: { dims: { length: 10.2, span: 14.4, height: 3.85, wingArea: 34.97 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'oval', fuselageLengthToWidthRatio: 7.8, heightToWidth: 1.2 },
      wing: { wingMountHeight: 0, planform: 'elliptical', rootLE: .28, sweepLE: 3, taper: .3, dihedral: 6, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.6, 1.3, .55, .86, 6, 0, .3, .82, 1.8, .5, 28, 0, 0), finTip: 1.9 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .44, length: 3.0, offset: 0 }, extras: ['spats', 'fixedGear', 'dorsalFin'] },
    b5n: { dims: { length: 10.3, span: 15.5, height: 3.7, wingArea: 37.7 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_radial', section: 'oval', fuselageLengthToWidthRatio: 7.9, heightToWidth: 1.2 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .28, sweepLE: 3, taper: .45, dihedral: 6, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.8, 1.3, .55, .86, 6, 0, .3, .82, 1.7, .5, 28, 0, 0), finTip: 1.9 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .44, length: 3.6, offset: 0 }, extras: [] },
    g4m: { dims: { length: 20, span: 25, height: 6.0, wingArea: 78.13 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'round', fuselageLengthToWidthRatio: 10, heightToWidth: 1.15 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .3, sweepLE: 6, taper: .4, dihedral: 4, thickness: .17 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.29], radial: true, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(7.7, 2.1, .55, .85, 6, 0, .3, .8, 2.6, .5, 30, 0, 0), finTip: 2.9 },
      ...NOCANARD, cockpit: { canopy: 'glazed_nose', at: .06, length: 2.4, offset: 0 }, extras: [] },
    ki45: { dims: { length: 11, span: 15, height: 3.7, wingArea: 32 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 9.6, heightToWidth: 1.3 },
      wing: { wingMountHeight: .3, planform: 'trapezoid', rootLE: .3, sweepLE: 5, taper: .45, dihedral: 5, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.31], radial: true, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(5.0, 1.4, .55, .86, 6, 0, .3, .82, 1.8, .5, 30, 0, 0), finTip: 2.0 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .3, length: 3.4, offset: 0 }, extras: [] },
    f1j: { dims: { length: 17.8, span: 7.9, height: 4.48, wingArea: 21.18 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 7.7, heightToWidth: .7 },
      wing: { wingMountHeight: .95, planform: 'trapezoid', rootLE: .45, sweepLE: 42, taper: .3, dihedral: -9, thickness: .05 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .3, length: .32, width: 0.55, height: 0.85, rake: 5, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.3, -.35], [.3, -.35]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(4.3, 1.8, .35, .86, 40, -10, .1, .72, 3.8, .3, 45, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .2, length: 2.0, offset: 0 }, extras: [] },
    // ======================= France =======================
    n17: { dims: { length: 5.8, span: 8.2, height: 2.4, wingArea: 14.75 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 7.2, heightToWidth: 1.15 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: 1, dihedral: 1, thickness: .08 },
      biplane: { wings: 2, gapToChord: 1.1, stagger: .2, lowerSpanRatio: .95, lowerChordRatio: .5 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: true },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.4, .7, .8, .86, 0, 0, .2, .86, .7, .7, 40, 0, 0), finTip: 1.1 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .44, length: 0, offset: 0 }, extras: ['vStruts', 'bracingWires', 'fixedGear'] },
    spad13: { dims: { length: 6.3, span: 8.1, height: 2.6, wingArea: 21.1 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 7.9, heightToWidth: 1.25 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .2, sweepLE: 0, taper: 1, dihedral: 2, thickness: .1 },
      biplane: { wings: 2, gapToChord: 1.05, stagger: .15, lowerSpanRatio: .96, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(2.7, .8, .8, .86, 0, 0, .2, .86, .8, .7, 35, 0, 0), finTip: 1.2 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .42, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    br14: { dims: { length: 8.9, span: 14.4, height: 3.3, wingArea: 47.5 }, gear: 'skid',
      fuselage: { profile: 'biplane', section: 'box', fuselageLengthToWidthRatio: 8.9, heightToWidth: 1.3 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .22, sweepLE: 2, taper: 1, dihedral: 2, thickness: .1 },
      biplane: { wings: 2, gapToChord: .9, stagger: .1, lowerSpanRatio: .86, lowerChordRatio: 1 },
      intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(4.4, 1.1, .8, .86, 0, 0, .2, .86, 1.0, .7, 35, 0, 0), finTip: 1.5 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .4, length: 0, offset: 0 }, extras: ['bracingWires', 'fixedGear'] },
    d510: { dims: { length: 7.9, span: 12.1, height: 2.42, wingArea: 16.5 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 8.3, heightToWidth: 1.35 },
      wing: { wingMountHeight: 0, planform: 'elliptical', rootLE: .27, sweepLE: 2, taper: .35, dihedral: 4, thickness: .14 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.4, 1.0, .6, .85, 6, 0, .25, .83, 1.2, .5, 28, 0, 0), finTip: 1.45 },
      ...NOCANARD, cockpit: { canopy: 'open', at: .5, length: 0, offset: 0 }, extras: ['spats', 'fixedGear', 'headrest', 'bracingWires'] },
    ms406: { dims: { length: 8.2, span: 10.6, height: 2.83, wingArea: 16 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 8.6, heightToWidth: 1.45 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .29, sweepLE: 5, taper: .5, dihedral: 6, thickness: .15 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.3, 1.0, .6, .85, 6, 0, .3, .83, 1.3, .5, 28, 0, 0), finTip: 1.55 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .46, length: 1.8, offset: 0 }, extras: ['bellyScoop'] },
    d520: { dims: { length: 8.6, span: 10.2, height: 2.57, wingArea: 15.97 }, gear: 'tailwheel',
      fuselage: { profile: 'piston_inline', section: 'oval', fuselageLengthToWidthRatio: 9.6, heightToWidth: 1.4 },
      wing: { wingMountHeight: 0, planform: 'trapezoid', rootLE: .3, sweepLE: 4, taper: .45, dihedral: 6, thickness: .14 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'nose_propeller', count: 1, radial: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(3.1, 1.0, .6, .85, 6, 0, .3, .83, 1.3, .5, 28, 0, 0), finTip: 1.5 },
      ...NOCANARD, cockpit: { canopy: 'framed', at: .47, length: 1.6, offset: 0 }, extras: ['bellyScoop'] },
    ouragan: { dims: { length: 10.7, span: 13.2, height: 4.14, wingArea: 23.4 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'round', fuselageLengthToWidthRatio: 6.9, heightToWidth: 1.05 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .36, sweepLE: 14, taper: .55, dihedral: 2, thickness: .1 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fin_mid', finCantDeg: 0, tail: t(4.4, 1.1, .6, .84, 15, 0, .35, .76, 2.1, .45, 35, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .25, length: 1.6, offset: 0 }, extras: ['tipTanks'] },
    mystere4: { dims: { length: 12.9, span: 11.1, height: 4.6, wingArea: 32 }, gear: 'tricycle',
      fuselage: { profile: 'jet_nose_intake', section: 'round', fuselageLengthToWidthRatio: 8.3, heightToWidth: 1.1 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .39, sweepLE: 41, taper: .45, dihedral: 0, thickness: .075 },
      biplane: null, intakeProfile: 'nose_cone', intake: { ...NOSE },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fin_mid', finCantDeg: 0, tail: t(4.0, 1.3, .5, .86, 42, 0, .4, .74, 2.7, .4, 45, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .25, length: 1.9, offset: 0 }, extras: [] },
    mirage3c: { dims: { length: 15, span: 8.2, height: 4.5, wingArea: 34.85 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'oval', fuselageLengthToWidthRatio: 9.4, heightToWidth: 1.05 },
      wing: { wingMountHeight: .2, planform: 'delta', rootLE: .4, sweepLE: 60, taper: .04, dihedral: 0, thickness: .045 },
      biplane: null, intakeProfile: 'cheek_crescent', intake: { at: .3, length: .3, width: 0.6, height: 1.0, rake: 0, splitter: false, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'none', finCantDeg: 0, tail: t(0, 0, 0, 0, 0, 0, 0, .72, 3.7, .3, 50, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .22, length: 2.1, offset: 0 }, extras: [] },
    m2000c: { dims: { length: 14.36, span: 9.13, height: 5.2, wingArea: 41 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'oval', fuselageLengthToWidthRatio: 9.0, heightToWidth: 1.05 },
      wing: { wingMountHeight: .2, planform: 'delta', rootLE: .4, sweepLE: 58, taper: .04, dihedral: 0, thickness: .045 },
      biplane: null, intakeProfile: 'cheek_crescent', intake: { at: .3, length: .3, width: 0.62, height: 1.05, rake: 0, splitter: false, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'none', finCantDeg: 0, tail: t(0, 0, 0, 0, 0, 0, 0, .72, 3.6, .3, 50, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .22, length: 2.0, offset: 0 }, extras: [] },
    rafalec: { dims: { length: 15.3, span: 10.9, height: 5.34, wingArea: 45.7 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 7.0, heightToWidth: .8 },
      wing: { wingMountHeight: .25, planform: 'delta', rootLE: .45, sweepLE: 48, taper: .14, dihedral: -2, thickness: .045 },
      biplane: null, intakeProfile: 'cheek_crescent', intake: { at: .33, length: .3, width: 0.6, height: 0.9, rake: 0, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.4, 0], [.4, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'none', finCantDeg: 0, tail: t(0, 0, 0, 0, 0, 0, 0, .72, 3.6, .3, 50, 0, 0),
      canardPresence: true, canardLength: 1.6, canardSweep: 45, canardOffset: 2.6, canardHeight: .45, cockpit: { canopy: 'bubble', at: .18, length: 2.2, offset: 0 }, extras: [] },
    amiot143: { dims: { length: 18.2, span: 24.5, height: 5.68, wingArea: 100 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'box', fuselageLengthToWidthRatio: 10.1, heightToWidth: 1.5 },
      wing: { wingMountHeight: 1, planform: 'trapezoid', rootLE: .3, sweepLE: 4, taper: .45, dihedral: 2, thickness: .2 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.29], radial: true, pusher: false },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(7.0, 2.0, .6, .85, 4, 0, .3, .8, 2.4, .55, 25, 0, 0), finTip: 2.7 },
      ...NOCANARD, cockpit: { canopy: 'greenhouse', at: .2, length: 3.0, offset: 0 }, extras: ['fixedGear'] },
    leo451: { dims: { length: 17.2, span: 22.5, height: 5.24, wingArea: 68 }, gear: 'tailwheel',
      fuselage: { profile: 'bomber_glazed', section: 'oval', fuselageLengthToWidthRatio: 10.7, heightToWidth: 1.3 },
      wing: { wingMountHeight: .1, planform: 'trapezoid', rootLE: .32, sweepLE: 6, taper: .4, dihedral: 6, thickness: .16 },
      biplane: null, intakeProfile: 'none', intake: null, engines: { layout: 'wing_propellers', count: 2, positions: [.27], radial: true, pusher: false },
      tailConfiguration: 'twin_endplate', horizontalTail: 'fuselage', finCantDeg: 0, tail: { ...t(6.4, 1.8, .7, .86, 4, 12, .4, .85, 1.7, .7, 8, 0, .3), finTip: 2.4 },
      ...NOCANARD, cockpit: { canopy: 'stepped', at: .2, length: 2.0, offset: 0 }, extras: [] },
    vautour: { dims: { length: 15.6, span: 15.1, height: 4.94, wingArea: 45 }, gear: 'tricycle',
      fuselage: { profile: 'jet_glazed', section: 'oval', fuselageLengthToWidthRatio: 9.2, heightToWidth: 1.1 },
      wing: { wingMountHeight: .5, planform: 'trapezoid', rootLE: .38, sweepLE: 35, taper: .45, dihedral: 0, thickness: .09 },
      biplane: null, intakeProfile: 'nacelle', intake: null, engines: { layout: 'underwing_pods', count: 2, positions: [.4], diameter: 1.2, length: 4.8 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fin_mid', finCantDeg: 0, tail: t(5.5, 1.7, .5, .86, 40, 0, .55, .74, 3.3, .4, 45, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'bubble', at: .2, length: 1.9, offset: 0 }, extras: [] },
    jaguar: { dims: { length: 16.8, span: 8.7, height: 4.89, wingArea: 24.18 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'rounded_box', fuselageLengthToWidthRatio: 7.3, heightToWidth: .7 },
      wing: { wingMountHeight: .95, planform: 'trapezoid', rootLE: .45, sweepLE: 40, taper: .3, dihedral: -3, thickness: .05 },
      biplane: null, intakeProfile: 'side_box', intake: { at: .3, length: .32, width: 0.55, height: 0.85, rake: 5, splitter: false, shockCone: false },
      engines: { layout: 'fuselage_jet', count: 2, nozzles: [[-.3, -.35], [.3, -.35]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'fuselage', finCantDeg: 0, tail: t(4.5, 1.8, .35, .86, 40, -10, .1, .72, 3.8, .3, 45, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .2, length: 2.2, offset: 0 }, extras: [] },
    m2000d: { dims: { length: 14.55, span: 9.13, height: 5.15, wingArea: 41 }, gear: 'tricycle',
      fuselage: { profile: 'jet_radar', section: 'oval', fuselageLengthToWidthRatio: 9.1, heightToWidth: 1.05 },
      wing: { wingMountHeight: .2, planform: 'delta', rootLE: .4, sweepLE: 58, taper: .04, dihedral: 0, thickness: .045 },
      biplane: null, intakeProfile: 'cheek_crescent', intake: { at: .3, length: .3, width: 0.62, height: 1.05, rake: 0, splitter: false, shockCone: true },
      engines: { layout: 'fuselage_jet', count: 1, nozzles: [[0, 0]], nozzleAt: 1 },
      tailConfiguration: 'single_vertical', horizontalTail: 'none', finCantDeg: 0, tail: t(0, 0, 0, 0, 0, 0, 0, .72, 3.6, .3, 50, 0, 0),
      ...NOCANARD, cockpit: { canopy: 'framed', at: .23, length: 2.8, offset: 0 }, extras: [] },
  };

  // ---------------------------------------------------------------- validation (no guessing: anything missing throws)
  const num = v => typeof v === 'number' && isFinite(v);
  function validate(id, e, pl) {
    const fail = msg => { throw new Error('Airframe "' + id + '": ' + msg); };
    if (!e) fail('no registry entry (every aircraft must be defined explicitly in js/airframe.js)');
    const need = (obj, path, keys, test) => { if (!obj || typeof obj !== 'object') fail(path + ' is missing'); for (const k of keys) { if (!(k in obj) || obj[k] === undefined) fail(path + '.' + k + ' is missing'); if (test && !test(obj[k])) fail(path + '.' + k + ' is invalid: ' + JSON.stringify(obj[k])); } };
    const oneOf = (v, list, what) => { if (!list.includes(v)) fail(what + ' "' + v + '" is not one of ' + list.join(', ')); };
    need(e, 'entry', ['dims', 'gear', 'fuselage', 'wing', 'biplane', 'intakeProfile', 'intake', 'engines', 'tailConfiguration', 'horizontalTail', 'finCantDeg', 'tail', 'canardPresence', 'canardLength', 'canardSweep', 'canardOffset', 'canardHeight', 'cockpit', 'extras']);
    need(e.dims, 'dims', ['length', 'span', 'height', 'wingArea'], v => num(v) && v > 0);
    if (Math.abs(e.dims.length / pl.len - 1) > 0.03 || Math.abs(e.dims.span / pl.span - 1) > 0.03) fail('dims (' + e.dims.length + ' x ' + e.dims.span + ') disagree with the aircraft data (' + pl.len + ' x ' + pl.span + ')');
    oneOf(e.gear, ENUM.gear, 'gear');
    need(e.fuselage, 'fuselage', ['profile', 'section', 'fuselageLengthToWidthRatio', 'heightToWidth']);
    if (!FUS[e.fuselage.profile]) fail('fuselage.profile "' + e.fuselage.profile + '" is not a known shape');
    if (!(e.fuselage.section in SECTION_N)) fail('fuselage.section "' + e.fuselage.section + '" is unknown');
    if (!num(e.fuselage.fuselageLengthToWidthRatio) || e.fuselage.fuselageLengthToWidthRatio < 2.5 || e.fuselage.fuselageLengthToWidthRatio > 16) fail('fuselageLengthToWidthRatio out of range');
    if (!num(e.fuselage.heightToWidth) || e.fuselage.heightToWidth < 0.3 || e.fuselage.heightToWidth > 2) fail('fuselage.heightToWidth out of range');
    need(e.wing, 'wing', ['wingMountHeight', 'planform', 'rootLE', 'sweepLE', 'taper', 'dihedral', 'thickness']);
    oneOf(e.wing.planform, ENUM.planform, 'wing.planform');
    for (const k of ['wingMountHeight', 'rootLE', 'sweepLE', 'taper', 'dihedral', 'thickness']) if (!num(e.wing[k])) fail('wing.' + k + ' must be a number');
    if (e.wing.wingMountHeight < 0 || e.wing.wingMountHeight > 1) fail('wing.wingMountHeight must be within 0..1');
    if (['gull', 'inverted_gull', 'cranked'].includes(e.wing.planform) && !(Array.isArray(e.wing.kink) && e.wing.kink.length === 3 && e.wing.kink.every(num))) fail('wing.kink [span fraction, inner dihedral, outer dihedral] is required for a ' + e.wing.planform + ' wing');
    if (e.wing.planform === 'diamond' && !num(e.wing.sweepTE)) fail('wing.sweepTE is required for a diamond wing');
    if (e.biplane !== null) { need(e.biplane, 'biplane', ['wings', 'gapToChord', 'stagger', 'lowerSpanRatio', 'lowerChordRatio'], num); if (e.biplane.wings === 3 && !num(e.biplane.middleSpanRatio)) fail('biplane.middleSpanRatio is required for a triplane'); }
    oneOf(e.intakeProfile, ENUM.intakeProfile, 'intakeProfile');
    const needsIntake = ['side_box', 'cheek_crescent', 'chin_scoop', 'ventral_box', 'wing_root', 'nose_cone'].includes(e.intakeProfile);
    if (needsIntake) need(e.intake, 'intake', ['at', 'length', 'width', 'height', 'rake', 'splitter', 'shockCone']);
    else if (e.intake !== null) fail('intake must be null for intakeProfile "' + e.intakeProfile + '"');
    need(e.engines, 'engines', ['layout', 'count']); oneOf(e.engines.layout, ENUM.layout, 'engines.layout');
    for (const k of ENGINE_FIELDS[e.engines.layout]) if (!(k in e.engines)) fail('engines.' + k + ' is required for layout "' + e.engines.layout + '"');
    if (e.engines.count !== pl.eng) fail('engines.count ' + e.engines.count + ' disagrees with the aircraft data (' + pl.eng + ')');
    if ((pl.kind === 'jet') !== !['nose_propeller', 'wing_propellers', 'twin_boom_propellers'].includes(e.engines.layout)) fail('engines.layout "' + e.engines.layout + '" does not match a ' + pl.kind + ' aircraft');
    if ((pl.kind === 'jet') === (e.intakeProfile === 'none')) fail('intakeProfile "' + e.intakeProfile + '" does not match a ' + pl.kind + ' aircraft');
    oneOf(e.tailConfiguration, ENUM.tailConfiguration, 'tailConfiguration'); oneOf(e.horizontalTail, ENUM.horizontalTail, 'horizontalTail');
    if (!num(e.finCantDeg)) fail('finCantDeg must be a number');
    if (e.tailConfiguration === 'twin_vertical_canted' && !(e.finCantDeg > 0)) fail('twin_vertical_canted needs a finCantDeg above 0');
    if (e.tailConfiguration !== 'twin_vertical_canted' && e.finCantDeg !== 0) fail('finCantDeg must be 0 unless the fins are canted');
    if ((e.tailConfiguration === 't_tail') !== (e.horizontalTail === 'fin_top')) fail('a t_tail must have horizontalTail "fin_top" (and only a t_tail)');
    if ((e.tailConfiguration === 'twin_boom') !== (e.horizontalTail === 'boom')) fail('twin_boom tails need horizontalTail "boom" (and only they)');
    if (e.tailConfiguration === 'twin_endplate' && e.horizontalTail !== 'fuselage') fail('twin_endplate fins sit on a fuselage-mounted tailplane');
    need(e.tail, 'tail', ['stabSpan', 'stabChord', 'stabTaper', 'stabLE', 'stabSweep', 'stabDihedral', 'stabHeight', 'finLE', 'finChord', 'finTaper', 'finSweep', 'finSpacing', 'finBelow'], num);
    if (e.horizontalTail !== 'none' && !(e.tail.stabSpan > 0 && e.tail.stabChord > 0 && e.tail.stabLE > 0)) fail('tail.stabSpan / stabChord / stabLE are required with a horizontal tail');
    if (e.horizontalTail === 'none' && e.tail.stabSpan !== 0) fail('tail.stabSpan must be 0 for a tailless aircraft');
    if (!(e.tail.finChord > 0 && e.tail.finLE > 0)) fail('tail.finChord / finLE are required');
    if (e.gear !== 'tricycle' && !(num(e.tail.finTip) && e.tail.finTip > 0)) fail('tail.finTip is required for a ' + e.gear + ' aircraft (its published height is not a fin height)');
    if (e.gear === 'tricycle' && 'finTip' in e.tail) fail('tail.finTip is derived from dims.height for tricycle aircraft; do not give it');
    if (/^twin_vertical/.test(e.tailConfiguration) && !(e.tail.finSpacing > 0)) fail('tail.finSpacing is required for twin vertical fins');
    if (typeof e.canardPresence !== 'boolean') fail('canardPresence must be true or false');
    if (e.canardPresence) { for (const k of ['canardLength', 'canardSweep', 'canardOffset', 'canardHeight']) if (!num(e[k])) fail(k + ' is required when canardPresence is true'); if (!(e.canardLength > 0)) fail('canardLength must be above 0'); }
    need(e.cockpit, 'cockpit', ['canopy', 'at', 'length', 'offset']); oneOf(e.cockpit.canopy, ENUM.canopy, 'cockpit.canopy');
    if (e.cockpit.canopy !== 'open' && !(e.cockpit.length > 0)) fail('cockpit.length is required for a ' + e.cockpit.canopy + ' canopy');
    if (!Array.isArray(e.extras)) fail('extras must be a list'); for (const x of e.extras) if (!EXTRAS.includes(x)) fail('unknown extra "' + x + '"');
  }

  // ---- smooth interpolation through the stations (no overshoot)
  function sample(rows, t, k) {
    let i = 0; while (i < rows.length - 2 && rows[i + 1][0] < t) i++;
    const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(rows.length - 1, i + 2)];
    const u = Math.max(0, Math.min(1, (t - p1[0]) / Math.max(1e-6, p2[0] - p1[0]))), u2 = u * u, u3 = u2 * u;
    const v = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return Math.max(Math.min(p1[k], p2[k]) - Math.abs(p2[k] - p1[k]) * 0.15, Math.min(Math.max(p1[k], p2[k]) + Math.abs(p2[k] - p1[k]) * 0.15, v));
  }

  // ---------------------------------------------------------------- spec: the registry entry resolved to metres
  const cache = {};
  function spec(pl) {
    if (cache[pl.id]) return cache[pl.id];
    const e = REG[pl.id]; validate(pl.id, e, pl);
    const L = pl.len, S = pl.span, jet = pl.kind === 'jet', z0 = -L / 2, ex = new Set(e.extras);
    const W = L / e.fuselage.fuselageLengthToWidthRatio, H = W * e.fuselage.heightToWidth, R = W / 2, n = SECTION_N[e.fuselage.section];
    const rows = FUS[e.fuselage.profile];
    const at = z => { const t = Math.max(0, Math.min(1, (z - z0) / L)); return { w: sample(rows, t, 1) * R, h: sample(rows, t, 2) * H / 2, y: sample(rows, t, 3) * R }; };
    const se = (v, k) => Math.pow(Math.max(0, v), 1 / k);
    const topAt = (z, x) => { const s = at(z), q = Math.min(1, Math.abs(x || 0) / s.w); return s.y + s.h * se(1 - Math.pow(q, n), n); };
    const botAt = (z, x) => { const s = at(z), q = Math.min(1, Math.abs(x || 0) / s.w); return s.y - s.h * se(1 - Math.pow(q, n), n); };
    const sideAt = (z, y) => { const s = at(z), q = Math.min(1, Math.abs(y - s.y) / s.h); return s.w * se(1 - Math.pow(q, n), n); };
    const sp = { id: pl.id, entry: e, L, S, R, W, H, n, rows, at, topAt, botAt, sideAt, extras: ex, jet, bi: !!e.biplane, big: pl.shape.startsWith('bomber') || pl.shape === 'jet_bomber', era: pl.era, notes: [] };
    const note = s => sp.notes.push(s);
    // ---- wing: root chord from the published wing area
    const w = e.wing, b = S / 2, tr = w.taper, bp = e.biplane;
    let areaFactor = 1; // total wing area relative to one (upper) wing of span S
    if (bp) { areaFactor += bp.lowerSpanRatio * bp.lowerChordRatio; if (bp.wings === 3) areaFactor += bp.middleSpanRatio; }
    let rc = w.planform === 'elliptical' ? 4 * e.dims.wingArea / (Math.PI * S * areaFactor) : 2 * e.dims.wingArea / (S * (1 + tr) * areaFactor);
    let tc = rc * tr;
    if (w.planform === 'diamond') { // tip chord from the leading- and trailing-edge sweeps, then the root chord that keeps the wing area
      const k = Math.tan(w.sweepLE * D) - Math.tan(w.sweepTE * D); rc = (2 * e.dims.wingArea / S + k * b) / 2; tc = Math.max(rc * 0.05, rc - k * b);
      note('diamond wing: chords from the published area and the leading / trailing-edge sweeps'); }
    const rootLE = z0 + w.rootLE * L, zMid = rootLE + rc / 2, s0 = at(zMid);
    const wy = bp ? s0.y - s0.h * 0.85 : s0.y + (w.wingMountHeight * 2 - 1) * s0.h * 0.82;
    const x0 = Math.max(0.05, sideAt(zMid, wy) * 0.6);
    const kink = w.kink ? [w.kink[0], w.kink[1] * D, w.kink[2] * D] : null;
    sp.wing = { rootZ: rootLE, rc, tc, sw: Math.tan(w.sweepLE * D), dih: w.dihedral * D, kink, y: wy, x0, b, t: w.thickness, ellip: w.planform === 'elliptical', tiptanks: ex.has('tipTanks'), droop: ex.has('droopedTips'), fences: ex.has('wingFences') ? (pl.id === 'mig17' ? 3 : 2) : 0, glove: ex.has('wingGlove'), tiprail: ex.has('tipRails') };
    // chord, leading edge and height at semi-span fraction f, along the trapezoid defined from the centreline
    sp.wingAt = (f, wg) => { const g = wg || sp.wing, x = g.x0 + (g.b - g.x0) * f, u = x / g.b;
      const c = g.ellip ? Math.max(g.rc * 0.18, g.rc * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.2)))) : g.rc + (g.tc - g.rc) * u;
      const le = g.ellip ? g.rootZ + (g.rc - c) * 0.3 + g.sw * x : g.rootZ + g.sw * x;
      const span = g.b - g.x0; let y = g.y;
      if (g.kink) { const k = g.kink[0]; y += f < k ? Math.tan(g.kink[1]) * span * f : Math.tan(g.kink[1]) * span * k + Math.tan(g.kink[2]) * span * (f - k); } else y += Math.tan(g.dih) * span * f;
      return { x, le, c, y }; };
    sp.wingF = x => Math.max(0, Math.min(1, (Math.abs(x) - sp.wing.x0) / (sp.wing.b - sp.wing.x0)));
    sp.wings = [sp.wing];
    if (bp) {
      const gap = rc * bp.gapToChord, top = s0.y + s0.h;
      const upper = Object.assign({}, sp.wing, { y: Math.max(top + 0.25, wy + gap * (bp.wings === 3 ? 1.9 : 1)), rootZ: rootLE - rc * bp.stagger, x0: 0.02 });
      Object.assign(sp.wing, { rc: rc * bp.lowerChordRatio, tc: tc * bp.lowerChordRatio, b: b * bp.lowerSpanRatio, rootZ: rootLE + rc * (1 - bp.lowerChordRatio) * 0.5 });
      if (bp.wings === 3) { sp.wings.push(Object.assign({}, sp.wing, { rc, tc, y: s0.y + s0.h * 0.15, x0: x0 * 0.9, b: b * bp.middleSpanRatio, rootZ: rootLE - rc * bp.stagger * 0.5 })); note('triplane: three wings stacked'); }
      sp.wings.push(upper); note('biplane: upper wing ' + gap.toFixed(2) + ' m above the lower, staggered ' + (bp.stagger * 100).toFixed(0) + '% of the chord');
    }
    // ---- canopy / cockpit
    const ck = e.cockpit;
    sp.canopy = { type: ck.canopy, z: z0 + ck.at * L, len: ck.length, x: ck.offset, two: pl.crew.length > 1 && !sp.big, frameless: ['f16c', 'f22a', 'su57', 'f2a'].includes(pl.id) };
    { const s = at(sp.canopy.z); sp.canopy.w = Math.min(s.w * 0.92, ck.canopy === 'side_by_side' ? R * 1.15 : Math.max(0.36, Math.min(0.52, s.w * 0.62))); sp.canopy.h = ck.canopy === 'bubble' ? Math.max(0.42, Math.min(0.62, sp.canopy.w * 1.15)) : Math.max(0.38, Math.min(0.56, sp.canopy.w)); }
    // ---- engines (resolved positions; nacelles / pods carry their own intakes and nozzles)
    const en = e.engines, engines = [];
    if (en.layout === 'nose_propeller') engines.push({ kind: 'prop', x: 0, y: 0, z: z0 + L * 0.09, r: R, len: L * 0.18, radial: en.radial });
    else if (en.layout === 'wing_propellers' || en.layout === 'twin_boom_propellers') {
      for (const s of [-1, 1]) for (const f of en.positions) { const x = s * f * b, wa = sp.wingAt(sp.wingF(x)), nr = Math.max(0.42, Math.min(1.0, wa.c * 0.24)), nl = Math.max(wa.c * 1.25, L * 0.18);
        engines.push({ kind: 'propnac', x, y: wa.y + nr * 0.1, z: en.pusher ? wa.le + wa.c * 0.9 : wa.le + wa.c * 0.35 - nl * 0.3, r: nr, len: nl, radial: !!en.radial, boom: en.layout === 'twin_boom_propellers', pusher: !!en.pusher }); }
    } else if (en.layout === 'fuselage_jet') {
      const zEnd = z0 + en.nozzleAt * L, sEnd = at(zEnd);
      const rn = en.count === 2 ? Math.min(sEnd.w * 0.5, sEnd.h * 0.95, R * 0.45) : Math.min(sEnd.w, sEnd.h) * 0.98;
      for (const [nx, ny] of en.nozzles) engines.push({ kind: 'fus', x: nx * R, y: sEnd.y + ny * R, z: zEnd - L * 0.16, r: rn, len: L * 0.32, jet: true, nozzle: zEnd, rect: !!en.rectangular });
    } else if (en.layout === 'wing_nacelles' || en.layout === 'underwing_pods') {
      for (const s of [-1, 1]) for (const f of en.positions) { const x = s * f * b, wa = sp.wingAt(sp.wingF(x)), r = en.diameter / 2;
        engines.push({ kind: en.layout === 'underwing_pods' ? 'underwing' : 'wingnac', x, y: en.layout === 'underwing_pods' ? wa.y - r * 0.85 : wa.y, z: wa.le + wa.c * 0.3 - en.length * 0.32, r, len: en.length, jet: true }); }
    } else if (en.layout === 'rear_fuselage_pods') {
      for (const s of [-1, 1]) engines.push({ kind: 'pod', x: s * en.lateral, y: en.height, z: z0 + en.at * L, r: en.diameter / 2, len: en.length, jet: true });
    } else if (en.layout === 'fuselage_side_nacelles') {
      for (const s of [-1, 1]) { const r = en.diameter / 2, z = z0 + en.at * L + en.length / 2; engines.push({ kind: 'sidenac', x: s * (at(z).w * 0.75 + r * 0.5 + en.lateral * R), y: wy - r * 0.2, z, r, len: en.length, jet: true }); }
    } else if (en.layout === 'ventral_nacelles') {
      for (const s of [-1, 1]) { const r = en.diameter / 2, len = (en.to - en.from) * L; engines.push({ kind: 'nacelle', x: s * en.lateral * R, y: -0.35 * R, z: z0 + (en.from + en.to) / 2 * L, r, len, jet: true }); }
    }
    for (const g of engines) if (g.jet && g.nozzle === undefined) g.nozzle = g.z + g.len / 2;
    sp.engines = engines;
    sp.intake = e.intakeProfile === 'none' || e.intakeProfile === 'nacelle' ? null : Object.assign({ type: e.intakeProfile }, e.intake);
    sp.extra = { lerx: ex.has('lerx'), booms: en.layout === 'twin_boom_propellers' ? { x: en.positions[0] * b } : null, gearPods: ex.has('gearPods') ? [.13, .12] : null, gau8: ex.has('gau8'),
      cone: !!(e.intake && e.intake.shockCone), belly: ex.has('ventralTank'), cft: ex.has('conformalTanks'), duck: ex.has('duckbillNose'),
      canards: e.canardPresence ? { length: e.canardLength, sweep: e.canardSweep * D, offset: e.canardOffset, height: e.canardHeight } : null };
    // ---- landing gear (also the datum for turning the published height into a fin height)
    const fixed = sp.bi || ex.has('fixedGear');
    const D2 = (R + H / 2) / 2; // gear sized from the mean fuselage half-size (width alone would put flat bodies on stilts)
    const wheelR = Math.max(0.3, D2 * (sp.big ? 0.45 : 0.32)), gearLen = D2 * (jet ? 1.0 : 1.25) + 0.3;
    const gearH = sp.bi ? D2 * 2.0 + 0.32 : fixed ? -(wy - D2 * 1.2 - 0.36) : -(wy - gearLen - wheelR);
    sp.gear = { fixed, wheelR, gearLen, gearH, gearX: Math.max(R * 1.1, Math.min(S * 0.18, pl.eng >= 2 ? S * 0.18 : S * 0.12)), zMain: rootLE + rc * 0.35 };
    // ---- tail
    const tl = e.tail, finZ = z0 + tl.finLE * L, finSw = Math.tan(tl.finSweep * D);
    sp.stab = null; sp.fins = [];
    if (e.horizontalTail !== 'none') {
      const sz = z0 + tl.stabLE * L, half = tl.stabSpan / 2;
      let stabY = 0; if (e.horizontalTail === 'fuselage') { const s = at(sz + tl.stabChord / 2); stabY = s.y + tl.stabHeight * s.h; }
      const rx = e.horizontalTail === 'fuselage' ? Math.max(0.05, sideAt(sz + tl.stabChord / 2, stabY) * 0.5) : 0.03;
      sp.stab = { zLE: sz, rc: tl.stabChord, tc: tl.stabChord * tl.stabTaper, sw: Math.tan(tl.stabSweep * D), dih: tl.stabDihedral * D, y: stabY, x0: rx, b: Math.max(rx + 0.3, half), t: jet ? 0.05 : 0.1, mount: e.horizontalTail };
    }
    // fin height from the published overall height: tricycle types stand level; tail-wheel and skid types sit
    // nose-up on the tail wheel / skid, so solve that three-point attitude for the fin tip
    const finBase0 = topAt(finZ + tl.finChord * 0.4) - 0.1;
    let yTopFin;
    if (e.gear === 'tricycle') { yTopFin = e.dims.height - gearH; note('fin tip ' + yTopFin.toFixed(2) + ' m above the axis, from the published height ' + e.dims.height + ' m standing level on tricycle gear'); }
    else {
      yTopFin = tl.finTip;
      // cross-check: sitting on the main wheels and the tail wheel / skid, the fin must not stand taller than the published overall height
      const zM = sp.gear.zMain, yM = -gearH, zT = z0 + L * 0.92, yT = botAt(zT) - (e.gear === 'skid' ? 0.12 : 0.28);
      const dz = zT - zM, dy = yT - yM, len = Math.hypot(dz, dy), nz = -dy / len, ny = dz / len; // ground normal (up) in the aircraft frame
      const zf = finZ + finSw * Math.max(0, yTopFin - finBase0) + tl.finChord * tl.finTaper * 0.5, ground = (yTopFin - yM) * ny + (zf - zM) * nz;
      if (ground > e.dims.height + 0.3) throw new Error('Airframe "' + pl.id + '": tail.finTip ' + yTopFin + ' m puts the fin ' + ground.toFixed(2) + ' m above the ground, taller than the published height ' + e.dims.height + ' m');
      note('fin tip ' + yTopFin + ' m above the axis (side elevation); ' + ground.toFixed(2) + ' m above the ground sitting ' + (Math.atan2(dy, dz) / D).toFixed(1) + ' deg nose-up, within the published ' + e.dims.height + ' m');
    }
    const finH = Math.max(0.5, Math.min(L * 0.3, yTopFin - finBase0));
    if (sp.stab && e.horizontalTail === 'fin_top') sp.stab.y = finBase0 + finH * 0.97;
    if (sp.stab && e.horizontalTail === 'fin_mid') sp.stab.y = finBase0 + finH * tl.stabHeight;
    if (sp.stab && e.horizontalTail === 'boom') { sp.stab.x0 = 0.02; sp.stab.b = en.positions[0] * b; }
    const mkFin = (x, base, cant, h) => sp.fins.push({ x, base, cant: cant * D, h, below: 0, zLE: finZ, rc: tl.finChord, tc: tl.finChord * tl.finTaper, sw: finSw, t: jet ? 0.05 : 0.1, round: !jet });
    switch (e.tailConfiguration) {
      case 'twin_endplate': { const tipY = sp.stab.y + Math.tan(sp.stab.dih) * (sp.stab.b - sp.stab.x0), up = Math.max(0.5, yTopFin - tipY), hh = up / (1 - tl.finBelow);
        for (const s of [-1, 1]) mkFin(s * sp.stab.b, tipY - hh * tl.finBelow, 0, hh); break; }
      case 'twin_boom': { const up = Math.max(0.5, yTopFin - sp.stab.y), hh = up / (1 - tl.finBelow); for (const s of [-1, 1]) mkFin(s * sp.stab.b, sp.stab.y - hh * tl.finBelow, 0, hh); break; }
      case 'twin_vertical_straight': case 'twin_vertical_canted': {
        const cant = e.tailConfiguration === 'twin_vertical_canted' ? e.finCantDeg : 0;
        for (const s of [-1, 1]) { const x = s * tl.finSpacing * R; mkFin(x, topAt(finZ + tl.finChord * 0.4, x) - 0.08, -s * cant, finH / Math.cos(cant * D)); } break; }
      default: mkFin(0, finBase0, 0, finH + 0.1);
    }
    sp.ventral = ex.has('ventralFin') ? { zLE: finZ + tl.finChord * 0.1, rc: tl.finChord * 0.6, h: finH * 0.28 } : null;
    sp.dorsal = ex.has('dorsalFin');
    return (cache[pl.id] = sp);
  }
  // validate every aircraft in the game (the mesh test reports the result)
  function audit(list) { const out = []; for (const pl of list) { try { spec(pl); } catch (err) { out.push(err.message); } } return out; }
  return { spec, audit, REGISTRY: REG, FUS, ENUM };
})();
