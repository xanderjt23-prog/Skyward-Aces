// ============================================================================
// Aircraft database. Performance figures are approximate historical values.
//   shape: bi | tri | mono | twin (twin piston) | bomber4 | jet_s (straight wing)
//          jet_sw (swept) | jet_d (delta) | jet_tt (twin tail, twin engine) | jet_dc (delta + canards)
//   spd km/h, clb m/s, turn s/360°, roll °/s, mass kg (loaded), span/len m
//   guns: [gunId, count, mount]  mount: nose | wing | sync
//   crew: list of roles; gunner turrets: [gunId, count, arc] arc: rear | dorsal | ventral | tail
//   hp: stations [label, kinds, maxKg, pylons]  kinds: b r m g
//   payload kg, g = structural G limit, aoa = critical angle of attack °
// ============================================================================
const PLANES = {};
const PLANE_LIST = [];
function P(nation, id, name, era, year, c) {
  const p = Object.assign({ id, nation, name, era, year, crew: ['pilot'], turrets: [], hp: [], payload: 0, g: 8, aoa: 16,
    eng: 1, kind: 'prop', ab: false, flares: 0, radar: false, role: 'fighter', armor: 0, sealing: era >= 3 }, c);
  p.bloc = c.bloc || NATIONS[nation].bloc;
  p.cost = p.cost != null ? p.cost : [0, 1500, 4000, 9000, 18000, 32000, 55000, 90000][era];
  PLANES[id] = p; PLANE_LIST.push(p);
}
const J = 'jet';

// ------------------------------------------------------------------ USA
P('usa', 'spad13us', 'SPAD S.XIII (USAS)', 1, 1918, { shape: 'bi', spd: 218, clb: 5.5, turn: 14, roll: 85, mass: 820, span: 8.1, len: 6.3, guns: [['vickers', 2, 'sync']], hp: [['Wing racks', 'b', 10, 2], ['Interplane struts', 'r', 15, 2]], payload: 30, g: 6, starter: true,
  desc: 'Rugged, fast French fighter flown by Rickenbacker and the 94th Aero Squadron.' });
P('usa', 'n28', 'Nieuport 28', 1, 1918, { shape: 'bi', spd: 198, clb: 4.8, turn: 11.5, roll: 110, mass: 700, span: 8.0, len: 6.2, guns: [['vickers', 2, 'sync']], hp: [['Underwing', 'b', 10, 2]], payload: 20, g: 5.5,
  desc: 'Nimble but fragile: the upper wing fabric could peel away in hard dives.' });
P('usa', 'p12', 'Boeing P-12E', 2, 1931, { shape: 'bi', spd: 304, clb: 9.5, turn: 12, roll: 120, mass: 1200, span: 9.1, len: 6.2, guns: [['m1919', 1, 'sync'], ['m2', 1, 'sync']], hp: [['Belly rack', 'b', 120, 1], ['Wing racks', 'b', 50, 2]], payload: 220, g: 7,
  desc: 'The classic pre-war Army and Navy biplane fighter.' });
P('usa', 'p26', 'Boeing P-26A Peashooter', 2, 1934, { shape: 'mono', spd: 377, clb: 11.8, turn: 13, roll: 115, mass: 1340, span: 8.5, len: 7.2, guns: [['m1919', 1, 'sync'], ['m2', 1, 'sync']], hp: [['Wing racks', 'b', 50, 2]], payload: 100, g: 7.5, wire: true,
  desc: 'First all-metal monoplane fighter of the US Army Air Corps.' });
P('usa', 'p40e', 'Curtiss P-40E Warhawk', 3, 1941, { shape: 'mono', spd: 580, clb: 11, turn: 18, roll: 105, mass: 3760, span: 11.4, len: 9.7, guns: [['m2', 6, 'wing']], hp: [['Centreline', 'b', 500, 1], ['Wing racks', 'b', 50, 2]], payload: 560, g: 9, armor: 1,
  desc: 'Tough and dive-fast, flown by the Flying Tigers.' });
P('usa', 'p51d', 'North American P-51D Mustang', 3, 1944, { shape: 'mono', spd: 703, clb: 16, turn: 18, roll: 100, mass: 4580, span: 11.3, len: 9.8, guns: [['m2', 6, 'wing']], hp: [['Wing pylons', 'b', 500, 2], ['Rocket rails', 'r', 200, 2]], payload: 1100, g: 9, armor: 1,
  desc: 'Long-range escort fighter that carried the bombers all the way to Berlin.' });
P('usa', 'p47d', 'Republic P-47D Thunderbolt', 3, 1944, { shape: 'mono', spd: 690, clb: 14, turn: 21, roll: 95, mass: 6600, span: 12.4, len: 11.0, guns: [['m2', 8, 'wing']], hp: [['Centreline', 'b', 500, 1], ['Wing pylons', 'b', 500, 2], ['Rocket rails', 'r', 200, 2]], payload: 1600, g: 9, armor: 1.4,
  desc: 'The "Jug": eight .50s, a radial engine that could survive anything, and a huge bomb load.' });
P('usa', 'p38l', 'Lockheed P-38L Lightning', 3, 1944, { shape: 'twin', eng: 2, spd: 666, clb: 24, turn: 20, roll: 75, mass: 7900, span: 15.8, len: 11.5, guns: [['m2', 4, 'nose'], ['hispano', 1, 'nose']], hp: [['Inner pylons', 'b', 1000, 2], ['Rocket trees', 'r', 200, 2]], payload: 1800, g: 8, armor: 1,
  desc: 'Twin-boom interceptor whose concentrated nose guns need no convergence.' });
P('usa', 'f4u1d', 'Vought F4U-1D Corsair', 3, 1944, { shape: 'mono', spd: 671, clb: 16, turn: 19, roll: 110, mass: 5600, span: 12.5, len: 10.2, guns: [['m2', 6, 'wing']], hp: [['Stub pylons', 'b', 500, 2], ['Rocket rails', 'r', 200, 2]], payload: 1800, g: 9, armor: 1, gull: true,
  desc: 'Gull-winged naval fighter: "Whistling Death" to the Japanese pilots facing it.' });
P('usa', 'f80c', 'Lockheed F-80C Shooting Star', 4, 1948, { shape: 'jet_s', kind: J, spd: 956, clb: 35, turn: 26, roll: 120, mass: 7650, span: 11.8, len: 10.5, guns: [['m3', 6, 'nose']], hp: [['Wing pylons', 'br', 500, 2]], payload: 900, g: 8, aoa: 15,
  desc: 'America\'s first operational jet fighter, a workhorse over Korea.' });
P('usa', 'f86f', 'North American F-86F Sabre', 4, 1952, { shape: 'jet_sw', kind: J, spd: 1106, clb: 47, turn: 25, roll: 160, mass: 7700, span: 11.3, len: 11.4, guns: [['m3', 6, 'nose']], hp: [['Inner pylons', 'brm', 500, 2]], payload: 900, g: 8, aoa: 18, armor: 1,
  desc: 'The MiG killer of MiG Alley. Later blocks carried the first Sidewinders.' });
P('usa', 'f100d', 'North American F-100D Super Sabre', 5, 1956, { shape: 'jet_sw', kind: J, ab: true, spd: 1390, clb: 110, turn: 30, roll: 160, mass: 13500, span: 11.8, len: 15.2, guns: [['m39', 4, 'nose']], hp: [['Wing pylons', 'brmg', 1000, 2], ['Outer pylons', 'brm', 500, 2]], payload: 3200, g: 7.3, aoa: 18, flares: 0,
  desc: 'The first USAF fighter capable of supersonic speed in level flight.' });
P('usa', 'f4e', 'McDonnell Douglas F-4E Phantom II', 5, 1967, { shape: 'jet_sw2', kind: J, eng: 2, ab: true, spd: 2370, clb: 210, turn: 27, roll: 150, mass: 18800, span: 11.7, len: 19.2, crew: ['pilot', 'rio'], guns: [['m61', 1, 'nose']], hp: [['Sparrow wells', 'm', 250, 4], ['Inner pylons', 'bmrg', 1400, 2], ['Outer pylons', 'brg', 1100, 2]], payload: 8400, g: 7.3, aoa: 22, radar: true, flares: 30,
  desc: 'Two-seat brute that ruled the 1960s skies, finally with an internal gun.' });
P('usa', 'f15c', 'McDonnell Douglas F-15C Eagle', 6, 1979, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 2655, clb: 254, turn: 19, roll: 260, mass: 20200, span: 13.0, len: 19.4, guns: [['m61', 1, 'nose']], hp: [['Fuselage stations', 'm', 250, 4], ['Wing pylons', 'mbr', 1000, 2], ['Wing rails', 'm', 100, 2]], payload: 7300, g: 9, aoa: 30, radar: true, flares: 60,
  desc: 'Undefeated in air combat: over 100 kills, no losses.' });
P('usa', 'f16c', 'General Dynamics F-16C Fighting Falcon', 6, 1984, { shape: 'jet_sw', kind: J, ab: true, spd: 2120, clb: 254, turn: 17, roll: 320, mass: 12000, span: 9.96, len: 15.0, guns: [['m61', 1, 'wing']], hp: [['Wingtip rails', 'm', 100, 2], ['Outer pylons', 'mr', 450, 2], ['Inner pylons', 'brmg', 1000, 2], ['Centreline', 'bg', 1000, 1]], payload: 7700, g: 9, aoa: 26, radar: true, flares: 60,
  desc: 'Fly-by-wire lightweight dogfighter: a 9 G turn and a bubble canopy.' });
P('usa', 'fa18e', 'Boeing F/A-18E Super Hornet', 7, 1999, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 1915, clb: 228, turn: 18, roll: 240, mass: 21300, span: 13.6, len: 18.3, guns: [['m61', 1, 'nose']], hp: [['Wingtip rails', 'm', 100, 2], ['Outer pylons', 'mbr', 500, 2], ['Mid pylons', 'mbr', 1000, 2], ['Inner pylons', 'mbg', 1000, 2], ['Fuselage', 'm', 250, 2]], payload: 8000, g: 7.5, aoa: 40, radar: true, flares: 60,
  desc: 'Carrier strike fighter with superb high-alpha handling.' });
P('usa', 'f22a', 'Lockheed Martin F-22A Raptor', 7, 2005, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 2410, clb: 290, turn: 15, roll: 300, mass: 29300, span: 13.6, len: 18.9, guns: [['m61', 1, 'wing']], hp: [['Side bays', 'm', 100, 2], ['Main bay', 'mb', 500, 4]], payload: 2300, g: 9, aoa: 60, radar: true, flares: 60, stealth: 0.4,
  desc: 'Stealthy, supercruising air-dominance fighter with thrust vectoring.' });

// ------------------------------------------------------------------ Germany
P('ger', 'albd3', 'Albatros D.III', 1, 1917, { shape: 'bi', spd: 175, clb: 4.2, turn: 13, roll: 90, mass: 890, span: 9.0, len: 7.3, guns: [['spandau', 2, 'sync']], hp: [], payload: 0, g: 5.5, starter: true,
  desc: 'Sleek sesquiplane that gave Jasta 11 dominance during "Bloody April".' });
P('ger', 'dr1', 'Fokker Dr.I', 1, 1917, { shape: 'tri', spd: 185, clb: 5.7, turn: 9.5, roll: 120, mass: 590, span: 7.2, len: 5.8, guns: [['spandau', 2, 'sync']], hp: [], payload: 0, g: 5.5,
  desc: 'The Red Baron\'s triplane: slow but turns on a pfennig.' });
P('ger', 'fd7', 'Fokker D.VII', 1, 1918, { shape: 'bi', spd: 200, clb: 5.5, turn: 12, roll: 95, mass: 880, span: 8.9, len: 7.0, guns: [['spandau', 2, 'sync']], hp: [['Wing racks', 'b', 10, 2]], payload: 20, g: 6.5,
  desc: 'So good the Armistice specifically demanded every one be surrendered.' });
P('ger', 'he51', 'Heinkel He 51 B', 2, 1935, { shape: 'bi', spd: 330, clb: 9, turn: 13, roll: 100, mass: 1900, span: 11.0, len: 8.4, guns: [['mg17', 2, 'sync']], hp: [['Belly rack', 'b', 60, 1], ['Wing racks', 'b', 10, 4]], payload: 100, g: 7,
  desc: 'Early Luftwaffe fighter, used for ground attack in Spain.' });
P('ger', 'bf109e', 'Messerschmitt Bf 109 E-3', 3, 1940, { shape: 'mono', spd: 560, clb: 15.4, turn: 18.5, roll: 105, mass: 2610, span: 9.9, len: 8.6, guns: [['mg17', 2, 'sync'], ['mgff', 2, 'wing']], hp: [['Centreline', 'b', 250, 1]], payload: 250, g: 9, armor: 1,
  desc: 'The "Emil", backbone of the Luftwaffe over France and Britain.' });
P('ger', 'bf109g', 'Messerschmitt Bf 109 G-6', 3, 1943, { shape: 'mono', spd: 630, clb: 17, turn: 19, roll: 100, mass: 3150, span: 9.9, len: 9.0, guns: [['mg131', 2, 'sync'], ['mg151', 1, 'nose']], hp: [['Centreline', 'b', 500, 1], ['Underwing', 'g', 140, 2]], payload: 640, g: 9, armor: 1,
  desc: 'The most produced Gustav: optional cannon gondolas under the wings.' });
P('ger', 'fw190a', 'Focke-Wulf Fw 190 A-8', 3, 1944, { shape: 'mono', spd: 650, clb: 15, turn: 20, roll: 160, mass: 4400, span: 10.5, len: 9.0, guns: [['mg131', 2, 'sync'], ['mg151', 4, 'wing']], hp: [['Centreline', 'b', 500, 1], ['Wing racks', 'b', 50, 4]], payload: 700, g: 9, armor: 1.4,
  desc: 'Butcher-bird bomber destroyer with a lightning roll rate.' });
P('ger', 'me262', 'Messerschmitt Me 262 A-1a', 3, 1944, { shape: 'jet_s2', kind: J, eng: 2, spd: 870, clb: 20, turn: 26, roll: 75, mass: 6400, span: 12.6, len: 10.6, guns: [['mk108', 4, 'nose']], hp: [['R4M racks', 'r', 50, 2], ['Nose pylons', 'b', 500, 2]], payload: 1000, g: 7, aoa: 14, armor: 1,
  desc: 'The world\'s first operational jet fighter: four 30 mm cannon.' });
P('ger', 'sabre6', 'Canadair Sabre Mk 6 (Luftwaffe)', 4, 1957, { shape: 'jet_sw', kind: J, spd: 1142, clb: 60, turn: 24, roll: 160, mass: 6700, span: 11.6, len: 11.4, guns: [['m3', 6, 'nose']], hp: [['Inner pylons', 'brm', 500, 2]], payload: 900, g: 8, aoa: 18,
  desc: 'The best-performing Sabre, equipping the new Bundesluftwaffe.' });
P('ger', 'f104g', 'Lockheed F-104G Starfighter', 5, 1960, { shape: 'jet_s', kind: J, ab: true, spd: 2125, clb: 250, turn: 40, roll: 220, mass: 13170, span: 6.7, len: 16.7, guns: [['m61', 1, 'nose']], hp: [['Wingtip rails', 'm', 100, 2], ['Wing pylons', 'brm', 450, 2], ['Centreline', 'b', 1000, 1]], payload: 1800, g: 7.3, aoa: 15, radar: true, flares: 20, tTail: true,
  desc: '"Missile with a man in it": blistering speed, terrible turning.' });
P('ger', 'mig21mf', 'MiG-21MF (NVA)', 5, 1972, { shape: 'jet_d', kind: J, ab: true, spd: 2230, clb: 225, turn: 22, roll: 210, mass: 8200, span: 7.2, len: 15.8, guns: [['gsh23', 1, 'nose']], hp: [['Inner pylons', 'brmg', 500, 2], ['Outer pylons', 'mr', 250, 2]], payload: 1500, g: 8.5, aoa: 22, radar: true, flares: 20, bloc: 'east',
  desc: 'East German Fishbed: small, fast and hard to see.' });
P('ger', 'mig29g', 'MiG-29G Fulcrum', 6, 1991, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 2400, clb: 330, turn: 16, roll: 280, mass: 15300, span: 11.4, len: 17.3, guns: [['gsh30', 1, 'wing']], hp: [['Outer pylons', 'm', 150, 2], ['Mid pylons', 'mr', 500, 2], ['Inner pylons', 'mbr', 600, 2]], payload: 3500, g: 9, aoa: 30, radar: true, flares: 60, bloc: 'east',
  desc: 'Inherited from the NVA at reunification and flown by the Luftwaffe until 2004.' });
P('ger', 'ef2000g', 'Eurofighter Typhoon (Luftwaffe)', 7, 2004, { shape: 'jet_dc', kind: J, eng: 2, ab: true, spd: 2495, clb: 315, turn: 15, roll: 290, mass: 16000, span: 10.95, len: 15.96, guns: [['bk27', 1, 'nose']], hp: [['Wingtip pods', 'm', 100, 2], ['Outer pylons', 'mr', 300, 2], ['Mid pylons', 'mbr', 1000, 2], ['Fuselage wells', 'm', 250, 4]], payload: 7500, g: 9, aoa: 32, radar: true, flares: 60,
  desc: 'Unstable canard-delta: tremendous climb and sustained turn.' });

// ------------------------------------------------------------------ Britain
P('uk', 'camel', 'Sopwith Camel F.1', 1, 1917, { shape: 'bi', spd: 185, clb: 5, turn: 9.5, roll: 130, mass: 660, span: 8.5, len: 5.7, guns: [['vickers', 2, 'sync']], hp: [['Bomb racks', 'b', 10, 4]], payload: 40, g: 5.5, starter: true,
  desc: 'Vicious torque made it deadly to novices and to 1,294 enemy aircraft.' });
P('uk', 'se5a', 'Royal Aircraft Factory S.E.5a', 1, 1917, { shape: 'bi', spd: 222, clb: 5.2, turn: 13, roll: 90, mass: 880, span: 8.1, len: 6.4, guns: [['vickers', 1, 'sync']], hp: [['Upper wing', 'g', 15, 1], ['Bomb racks', 'b', 10, 4]], payload: 50, g: 6.5,
  desc: 'Fast, stable gun platform: McCudden and Mannock\'s mount.' });
P('uk', 'gladiator', 'Gloster Gladiator Mk I', 2, 1937, { shape: 'bi', spd: 407, clb: 11.2, turn: 11, roll: 105, mass: 2080, span: 9.8, len: 8.4, guns: [['browning303', 4, 'wing']], hp: [], payload: 0, g: 7,
  desc: 'The RAF\'s last biplane fighter, defender of Malta.' });
P('uk', 'hurri1', 'Hawker Hurricane Mk I', 3, 1940, { shape: 'mono', spd: 520, clb: 12.5, turn: 16.5, roll: 85, mass: 3000, span: 12.2, len: 9.8, guns: [['browning303', 8, 'wing']], hp: [['Wing racks', 'b', 250, 2]], payload: 500, g: 8.5, armor: 1,
  desc: 'Shot down more aircraft in the Battle of Britain than all other defences combined.' });
P('uk', 'spit9', 'Supermarine Spitfire LF Mk IX', 3, 1943, { shape: 'mono', spd: 650, clb: 22, turn: 16, roll: 90, mass: 3400, span: 11.2, len: 9.5, guns: [['hispano', 2, 'wing'], ['browning303', 4, 'wing']], hp: [['Centreline', 'b', 250, 1], ['Wing racks', 'b', 250, 2]], payload: 450, g: 9, armor: 1, ellipse: true,
  desc: 'Elliptical wings and a Merlin 66: one of the finest dogfighters ever built.' });
P('uk', 'typhoon1b', 'Hawker Typhoon Mk Ib', 3, 1943, { shape: 'mono', spd: 663, clb: 13.5, turn: 21, roll: 85, mass: 5200, span: 12.7, len: 9.7, guns: [['hispano', 4, 'wing']], hp: [['Wing pylons', 'b', 500, 2], ['Rocket rails', 'r', 140, 2]], payload: 900, g: 8.5, armor: 1.4,
  desc: 'Rocket-firing tank buster that wrecked German armour in Normandy.' });
P('uk', 'meteor8', 'Gloster Meteor F.8', 4, 1950, { shape: 'jet_s2', kind: J, eng: 2, spd: 965, clb: 36, turn: 26, roll: 90, mass: 7120, span: 11.3, len: 13.6, guns: [['hispano', 4, 'nose']], hp: [['Wing pylons', 'br', 500, 2]], payload: 900, g: 7, aoa: 15,
  desc: 'Britain\'s first jet, refined into a capable day fighter.' });
P('uk', 'hunter6', 'Hawker Hunter F.6', 4, 1955, { shape: 'jet_sw', kind: J, spd: 1150, clb: 87, turn: 22, roll: 160, mass: 8050, span: 10.3, len: 14.0, guns: [['aden', 4, 'nose']], hp: [['Inner pylons', 'br', 500, 2], ['Outer pylons', 'r', 250, 2]], payload: 1800, g: 7.5, aoa: 18,
  desc: 'Beautiful, beloved, and armed with four 30 mm ADENs.' });
P('uk', 'lightning', 'English Electric Lightning F.6', 5, 1965, { shape: 'jet_sw', kind: J, eng: 2, ab: true, spd: 2100, clb: 250, turn: 25, roll: 210, mass: 18900, span: 10.6, len: 16.8, guns: [['aden', 2, 'nose']], hp: [['Missile pylons', 'm', 150, 2]], payload: 300, g: 7, aoa: 20, radar: true, flares: 20,
  desc: 'Stacked engines and an astonishing climb rate: the RAF\'s great interceptor.' });
P('uk', 'tornadof3', 'Panavia Tornado F.3', 6, 1986, { shape: 'jet_sw2', kind: J, eng: 2, ab: true, spd: 2400, clb: 230, turn: 23, roll: 180, mass: 22500, span: 13.9, len: 18.7, crew: ['pilot', 'wso'], guns: [['bk27', 1, 'nose']], hp: [['Belly wells', 'm', 250, 4], ['Inner wing', 'mb', 1000, 2]], payload: 5800, g: 7.5, aoa: 22, radar: true, flares: 60,
  desc: 'Long-range swing-wing interceptor guarding the UK air defence region.' });
P('uk', 'ef2000uk', 'Eurofighter Typhoon FGR4', 7, 2007, { shape: 'jet_dc', kind: J, eng: 2, ab: true, spd: 2495, clb: 315, turn: 15, roll: 290, mass: 16000, span: 10.95, len: 15.96, guns: [['bk27', 1, 'nose']], hp: [['Wingtip pods', 'm', 100, 2], ['Outer pylons', 'mr', 300, 2], ['Mid pylons', 'mbr', 1000, 2], ['Fuselage wells', 'm', 250, 4]], payload: 7500, g: 9, aoa: 32, radar: true, flares: 60,
  desc: 'The RAF\'s swing-role front-line fighter.' });

// ------------------------------------------------------------------ USSR / Russia
P('ussr', 'n17ru', 'Nieuport 17 (Imperial Russian)', 1, 1916, { shape: 'bi', spd: 165, clb: 4.0, turn: 11, roll: 105, mass: 560, span: 8.2, len: 5.8, guns: [['lewis', 1, 'wing']], hp: [['Interplane struts', 'r', 15, 2]], payload: 30, g: 5, starter: true,
  desc: 'Sesquiplane flown by Kazakov, Russia\'s top ace of the Great War.' });
P('ussr', 'i15', 'Polikarpov I-15bis', 2, 1937, { shape: 'bi', spd: 370, clb: 9, turn: 10, roll: 110, mass: 1650, span: 10.2, len: 6.3, guns: [['pv1', 4, 'sync']], hp: [['Wing racks', 'br', 50, 4]], payload: 150, g: 7,
  desc: 'Agile "Chaika" of the Spanish Civil War and Khalkhin Gol.' });
P('ussr', 'i16', 'Polikarpov I-16 Type 24', 2, 1938, { shape: 'mono', spd: 489, clb: 14, turn: 14, roll: 150, mass: 1880, span: 9.0, len: 6.1, guns: [['shkas', 4, 'wing']], hp: [['Wing racks', 'br', 100, 2], ['Rocket rails', 'r', 30, 2]], payload: 300, g: 8, stubby: true,
  desc: 'Stubby "Ishak": the first low-wing fighter with retractable gear.' });
P('ussr', 'yak3', 'Yakovlev Yak-3', 3, 1944, { shape: 'mono', spd: 646, clb: 21, turn: 16, roll: 110, mass: 2690, span: 9.2, len: 8.5, guns: [['shvak', 1, 'nose'], ['ubs', 2, 'sync']], hp: [], payload: 0, g: 9,
  desc: 'Light and deadly low-altitude dogfighter, favoured by Normandie-Niémen.' });
P('ussr', 'la5fn', 'Lavochkin La-5FN', 3, 1943, { shape: 'mono', spd: 648, clb: 17, turn: 18.5, roll: 110, mass: 3360, span: 9.8, len: 8.7, guns: [['shvak', 2, 'sync']], hp: [['Wing racks', 'b', 100, 2]], payload: 200, g: 9, armor: 1,
  desc: 'Radial-engine fighter that won air superiority at Kursk.' });
P('ussr', 'il2', 'Ilyushin Il-2M Shturmovik', 3, 1943, { shape: 'mono', spd: 410, clb: 7.5, turn: 23, roll: 70, mass: 6160, span: 14.6, len: 11.6, crew: ['pilot', 'gunner'], turrets: [['ubs', 1, 'rear']], guns: [['vya23', 2, 'wing'], ['shkas', 2, 'wing']], hp: [['Bomb bays', 'b', 100, 4], ['Rocket rails', 'r', 30, 4]], payload: 600, g: 6.5, armor: 3, role: 'attack',
  desc: 'The flying tank: an armoured bathtub around crew and engine.' });
P('ussr', 'mig15', 'Mikoyan-Gurevich MiG-15bis', 4, 1950, { shape: 'jet_sw', kind: J, spd: 1076, clb: 51, turn: 23, roll: 150, mass: 5050, span: 10.1, len: 10.1, guns: [['n37', 1, 'nose'], ['nr23', 2, 'nose']], hp: [['Wing pylons', 'b', 250, 2]], payload: 500, g: 8, aoa: 17, tTail: true,
  desc: 'The shock of Korea: heavy cannon built to kill B-29s.' });
P('ussr', 'mig17', 'Mikoyan-Gurevich MiG-17F', 4, 1953, { shape: 'jet_sw', kind: J, ab: true, spd: 1145, clb: 65, turn: 21, roll: 160, mass: 6070, span: 9.6, len: 11.3, guns: [['n37', 1, 'nose'], ['nr23', 2, 'nose']], hp: [['Wing pylons', 'br', 250, 2]], payload: 500, g: 8, aoa: 18,
  desc: 'Agile subsonic gunfighter that troubled Phantoms over Vietnam.' });
P('ussr', 'mig21bis', 'Mikoyan-Gurevich MiG-21bis', 5, 1972, { shape: 'jet_d', kind: J, ab: true, spd: 2230, clb: 225, turn: 21, roll: 210, mass: 8700, span: 7.2, len: 15.8, guns: [['gsh23', 1, 'nose']], hp: [['Inner pylons', 'brmg', 500, 2], ['Outer pylons', 'mr', 250, 2]], payload: 2000, g: 8.5, aoa: 22, radar: true, flares: 20,
  desc: 'The most-produced supersonic jet in history.' });
P('ussr', 'mig23', 'Mikoyan MiG-23MLD', 5, 1975, { shape: 'jet_sw2', kind: J, ab: true, spd: 2500, clb: 240, turn: 25, roll: 180, mass: 15700, span: 13.97, len: 16.7, guns: [['gsh23', 1, 'nose']], hp: [['Glove pylons', 'mb', 500, 2], ['Wing pylons', 'mr', 500, 2], ['Belly', 'bg', 500, 1]], payload: 3000, g: 7.5, aoa: 22, radar: true, flares: 30,
  desc: 'Variable-geometry Flogger, the Soviet answer to the Phantom.' });
P('ussr', 'mig29', 'Mikoyan MiG-29 (9.12)', 6, 1983, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 2400, clb: 330, turn: 16, roll: 280, mass: 15300, span: 11.4, len: 17.3, guns: [['gsh30', 1, 'wing']], hp: [['Outer pylons', 'm', 150, 2], ['Mid pylons', 'mr', 500, 2], ['Inner pylons', 'mbr', 600, 2]], payload: 3500, g: 9, aoa: 30, radar: true, flares: 60,
  desc: 'Agile Fulcrum with the R-73 and helmet sight: deadly within visual range.' });
P('ussr', 'su27', 'Sukhoi Su-27S Flanker', 6, 1985, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 2500, clb: 300, turn: 17, roll: 260, mass: 23400, span: 14.7, len: 21.9, guns: [['gsh30', 1, 'wing']], hp: [['Wingtip rails', 'm', 120, 2], ['Outer pylons', 'm', 260, 2], ['Inner pylons', 'mbr', 600, 2], ['Intake pylons', 'mb', 600, 2], ['Centreline', 'mb', 600, 2]], payload: 6000, g: 9, aoa: 40, radar: true, flares: 90,
  desc: 'Enormous range and ten missiles: the Cobra manoeuvre made it famous.' });
P('ussr', 'su35s', 'Sukhoi Su-35S', 7, 2014, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 2500, clb: 300, turn: 15, roll: 280, mass: 25300, span: 15.3, len: 21.9, guns: [['gsh30', 1, 'wing']], hp: [['Wingtip rails', 'm', 120, 2], ['Outer pylons', 'mr', 300, 2], ['Mid pylons', 'mbr', 600, 2], ['Inner pylons', 'mbr', 1500, 2], ['Intake pylons', 'mb', 600, 2], ['Centreline', 'mb', 600, 2]], payload: 8000, g: 9, aoa: 60, radar: true, flares: 96,
  desc: 'Thrust-vectoring super-manoeuvrable Flanker.' });
P('ussr', 'su57', 'Sukhoi Su-57', 7, 2020, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 2600, clb: 330, turn: 14, roll: 290, mass: 29300, span: 14.1, len: 20.1, guns: [['gsh30', 1, 'wing']], hp: [['Side bays', 'm', 120, 2], ['Main bays', 'mb', 600, 4]], payload: 4000, g: 9, aoa: 60, radar: true, flares: 96, stealth: 0.3,
  desc: 'Russia\'s fifth-generation fighter with 3D thrust vectoring.' });

// ------------------------------------------------------------------ Japan
P('jpn', 'n24ko3', 'Nieuport 24 (Ko 3)', 1, 1918, { shape: 'bi', spd: 176, clb: 4.3, turn: 11, roll: 105, mass: 550, span: 8.2, len: 5.9, guns: [['vickers', 1, 'sync']], hp: [], payload: 0, g: 5, starter: true,
  desc: 'French design built for the Imperial Japanese Army as the Ko 3.' });
P('jpn', 'ki10', 'Kawasaki Ki-10-II', 2, 1935, { shape: 'bi', spd: 400, clb: 10, turn: 10.5, roll: 115, mass: 1740, span: 10.0, len: 7.6, guns: [['type89', 2, 'sync']], hp: [], payload: 0, g: 7,
  desc: 'The Army\'s last biplane fighter, superbly agile.' });
P('jpn', 'ki27', 'Nakajima Ki-27b', 2, 1938, { shape: 'mono', spd: 470, clb: 12.5, turn: 12, roll: 110, mass: 1790, span: 11.3, len: 7.5, guns: [['type89', 2, 'sync']], hp: [['Wing racks', 'b', 25, 4]], payload: 100, g: 7.5, fixedGear: true,
  desc: 'Fixed-gear monoplane with an incredible turn: Nomonhan veteran.' });
P('jpn', 'a6m2', 'Mitsubishi A6M2 Zero', 3, 1940, { shape: 'mono', spd: 533, clb: 15.7, turn: 12.5, roll: 75, mass: 2410, span: 12.0, len: 9.06, guns: [['type92', 2, 'sync'], ['type99', 2, 'wing']], hp: [['Wing racks', 'b', 60, 2]], payload: 120, g: 7, sealing: false,
  desc: 'Light, long-legged and unmatched in a slow turning fight, but no armour.' });
P('jpn', 'ki43', 'Nakajima Ki-43-II Hayabusa', 3, 1942, { shape: 'mono', spd: 530, clb: 16, turn: 12, roll: 95, mass: 2590, span: 10.8, len: 8.9, guns: [['ho103', 2, 'sync']], hp: [['Wing racks', 'b', 250, 2]], payload: 500, g: 7, sealing: false,
  desc: '"Oscar", the Army\'s most numerous fighter.' });
P('jpn', 'n1k2', 'Kawanishi N1K2-J Shiden-Kai', 3, 1945, { shape: 'mono', spd: 594, clb: 16, turn: 14, roll: 100, mass: 4000, span: 12.0, len: 9.3, guns: [['type99', 4, 'wing']], hp: [['Wing racks', 'b', 250, 2]], payload: 500, g: 8.5, armor: 1,
  desc: 'Automatic combat flaps and four cannon: a match for the Hellcat.' });
P('jpn', 'ki84', 'Nakajima Ki-84 Hayate', 3, 1944, { shape: 'mono', spd: 660, clb: 18, turn: 15, roll: 100, mass: 3750, span: 11.2, len: 9.9, guns: [['ho103', 2, 'sync'], ['ho5', 2, 'wing']], hp: [['Wing racks', 'b', 250, 2]], payload: 500, g: 8.5, armor: 1,
  desc: 'Japan\'s best wartime fighter when its engine ran right.' });
P('jpn', 'f86fj', 'F-86F-40 Sabre (JASDF)', 4, 1955, { shape: 'jet_sw', kind: J, spd: 1106, clb: 47, turn: 24, roll: 160, mass: 7700, span: 11.9, len: 11.4, guns: [['m3', 6, 'nose']], hp: [['Inner pylons', 'brm', 500, 2]], payload: 900, g: 8, aoa: 18,
  desc: 'Extended-wing Sabre that founded the Japan Air Self-Defense Force\'s fighter arm.' });
P('jpn', 'f104j', 'Mitsubishi F-104J Eiko', 5, 1962, { shape: 'jet_s', kind: J, ab: true, spd: 2125, clb: 250, turn: 40, roll: 220, mass: 13000, span: 6.7, len: 16.7, guns: [['m61', 1, 'nose']], hp: [['Wingtip rails', 'm', 100, 2], ['Wing pylons', 'm', 100, 2]], payload: 600, g: 7.3, aoa: 15, radar: true, flares: 20, tTail: true,
  desc: 'Licence-built pure interceptor, "Glory" in Japanese service.' });
P('jpn', 'f4ej', 'Mitsubishi F-4EJ Kai', 5, 1971, { shape: 'jet_sw2', kind: J, eng: 2, ab: true, spd: 2370, clb: 210, turn: 27, roll: 150, mass: 18800, span: 11.7, len: 19.2, crew: ['pilot', 'rio'], guns: [['m61', 1, 'nose']], hp: [['Sparrow wells', 'm', 250, 4], ['Inner pylons', 'bm', 1400, 2], ['Outer pylons', 'brg', 1100, 2]], payload: 8400, g: 7.3, aoa: 22, radar: true, flares: 30,
  desc: 'The last Phantoms in Japanese service flew until 2021.' });
P('jpn', 'f15j', 'Mitsubishi F-15J Eagle', 6, 1981, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 2655, clb: 254, turn: 19, roll: 260, mass: 20200, span: 13.0, len: 19.4, guns: [['m61', 1, 'nose']], hp: [['Fuselage stations', 'm', 250, 4], ['Wing pylons', 'mbr', 1000, 2], ['Wing rails', 'm', 100, 2]], payload: 7300, g: 9, aoa: 30, radar: true, flares: 60,
  desc: 'Japan\'s licence-built Eagle, the core of its air defence.' });
P('jpn', 'f2a', 'Mitsubishi F-2A', 7, 2000, { shape: 'jet_sw', kind: J, ab: true, spd: 2120, clb: 254, turn: 17, roll: 310, mass: 18100, span: 11.1, len: 15.5, guns: [['m61', 1, 'wing']], hp: [['Wingtip rails', 'm', 100, 2], ['Outer pylons', 'm', 300, 2], ['Mid pylons', 'mbr', 1000, 2], ['Inner pylons', 'mbr', 1000, 2], ['Centreline', 'bg', 1000, 1]], payload: 8000, g: 9, aoa: 26, radar: true, flares: 60,
  desc: 'Enlarged composite-wing F-16 derivative with an AESA radar.' });

// ------------------------------------------------------------------ France
P('fra', 'n17', 'Nieuport 17', 1, 1916, { shape: 'bi', spd: 165, clb: 4.0, turn: 11, roll: 105, mass: 560, span: 8.2, len: 5.8, guns: [['vickers', 1, 'sync']], hp: [['Upper wing', 'g', 15, 1], ['Interplane struts', 'r', 15, 2]], payload: 30, g: 5, starter: true,
  desc: 'Agile sesquiplane that helped end the "Fokker Scourge". Can carry Le Prieur rockets.' });
P('fra', 'spad13', 'SPAD S.XIII', 1, 1917, { shape: 'bi', spd: 218, clb: 5.5, turn: 14, roll: 85, mass: 820, span: 8.1, len: 6.3, guns: [['vickers', 2, 'sync']], hp: [['Wing racks', 'b', 10, 2]], payload: 20, g: 6,
  desc: 'Guynemer and Fonck\'s fast, sturdy fighter: 8,472 were built.' });
P('fra', 'd510', 'Dewoitine D.510', 2, 1935, { shape: 'mono', spd: 402, clb: 12, turn: 14, roll: 110, mass: 1930, span: 12.1, len: 7.9, guns: [['hs404', 1, 'nose'], ['mac34', 2, 'wing']], hp: [], payload: 0, g: 7.5, fixedGear: true,
  desc: 'Engine-mounted 20 mm cannon firing through the propeller hub.' });
P('fra', 'ms406', 'Morane-Saulnier M.S.406', 3, 1939, { shape: 'mono', spd: 486, clb: 11, turn: 16, roll: 90, mass: 2540, span: 10.6, len: 8.2, guns: [['hs404', 1, 'nose'], ['mac34', 2, 'wing']], hp: [], payload: 0, g: 8,
  desc: 'France\'s most numerous fighter in 1940.' });
P('fra', 'd520', 'Dewoitine D.520', 3, 1940, { shape: 'mono', spd: 535, clb: 13, turn: 16, roll: 100, mass: 2790, span: 10.2, len: 8.6, guns: [['hs404', 1, 'nose'], ['mac34', 4, 'wing']], hp: [], payload: 0, g: 8.5, armor: 1,
  desc: 'The best French fighter of the Battle of France.' });
P('fra', 'ouragan', 'Dassault MD 450 Ouragan', 4, 1952, { shape: 'jet_s', kind: J, spd: 940, clb: 38, turn: 25, roll: 120, mass: 7900, span: 13.2, len: 10.7, guns: [['hs404', 4, 'nose']], hp: [['Wing pylons', 'br', 500, 2]], payload: 900, g: 7.5, aoa: 15,
  desc: 'Dassault\'s first jet fighter.' });
P('fra', 'mystere4', 'Dassault Mystère IV A', 4, 1955, { shape: 'jet_sw', kind: J, spd: 1120, clb: 45, turn: 23, roll: 160, mass: 8510, span: 11.1, len: 12.9, guns: [['defa', 2, 'nose']], hp: [['Wing pylons', 'brm', 500, 2]], payload: 1000, g: 7.5, aoa: 18,
  desc: 'Swept-wing fighter that fought in Suez and the Six-Day War.' });
P('fra', 'mirage3c', 'Dassault Mirage IIIC', 5, 1961, { shape: 'jet_d', kind: J, ab: true, spd: 2350, clb: 200, turn: 24, roll: 200, mass: 12700, span: 8.2, len: 15.0, guns: [['defa', 2, 'nose']], hp: [['Wing pylons', 'mbr', 500, 2], ['Centreline', 'mb', 500, 1]], payload: 2000, g: 7, aoa: 25, radar: true, flares: 20,
  desc: 'The delta that made Dassault famous, with an optional rocket booster.' });
P('fra', 'm2000c', 'Dassault Mirage 2000C', 6, 1984, { shape: 'jet_d', kind: J, ab: true, spd: 2530, clb: 285, turn: 17, roll: 270, mass: 13800, span: 9.13, len: 14.36, guns: [['defa', 2, 'nose']], hp: [['Outer pylons', 'm', 150, 2], ['Inner pylons', 'mbr', 1000, 2], ['Fuselage', 'mb', 500, 2]], payload: 6300, g: 9, aoa: 30, radar: true, flares: 60,
  desc: 'Fly-by-wire delta: fast, agile and with superb high-alpha handling.' });
P('fra', 'rafalec', 'Dassault Rafale C', 7, 2001, { shape: 'jet_dc', kind: J, eng: 2, ab: true, spd: 1912, clb: 305, turn: 15, roll: 290, mass: 15000, span: 10.9, len: 15.3, guns: [['giat30', 1, 'nose']], hp: [['Wingtip rails', 'm', 120, 2], ['Outer pylons', 'mr', 500, 2], ['Inner pylons', 'mbr', 1300, 2], ['Fuselage', 'm', 250, 4]], payload: 9500, g: 9, aoa: 32, radar: true, flares: 80,
  desc: 'Omnirole canard-delta with SPECTRA self-protection.' });

// ------------------------------------------------------------------ AI-only aircraft (mission bombers and attackers)
const AIP = (n, id, name, era, year, c) => P(n, id, name, era, year, Object.assign({ aiOnly: true, role: 'bomber', cost: 0 }, c));
AIP('ger', 'gotha', 'Gotha G.V', 1, 1917, { shape: 'bomber2', bi: true, eng: 2, spd: 140, clb: 2.5, turn: 30, roll: 30, mass: 3980, span: 23.7, len: 12.4, crew: ['pilot', 'gunner', 'gunner'], turrets: [['parab', 1, 'dorsal'], ['parab', 1, 'ventral']], guns: [], hp: [['Bomb bay', 'b', 50, 6]], payload: 500, g: 3 });
AIP('uk', 'ho400', 'Handley Page O/400', 1, 1918, { shape: 'bomber2', bi: true, eng: 2, spd: 157, clb: 2, turn: 32, roll: 28, mass: 6060, span: 30.5, len: 19.2, crew: ['pilot', 'gunner', 'gunner'], turrets: [['lewis', 2, 'dorsal'], ['lewis', 1, 'ventral']], guns: [], hp: [['Bomb bay', 'b', 50, 8]], payload: 900, g: 3 });
AIP('ger', 'he111', 'Heinkel He 111 H-3', 3, 1940, { shape: 'bomber2', eng: 2, spd: 405, clb: 4, turn: 40, roll: 40, mass: 12000, span: 22.6, len: 16.4, crew: ['pilot', 'gunner', 'gunner', 'gunner'], turrets: [['mg15', 1, 'dorsal'], ['mg15', 1, 'ventral'], ['mg15', 1, 'nose']], guns: [], hp: [['Bomb bay', 'b', 250, 8]], payload: 2000, g: 3.5 });
AIP('ger', 'ju87', 'Junkers Ju 87 B-2 Stuka', 3, 1940, { shape: 'mono', spd: 390, clb: 6, turn: 22, roll: 70, mass: 4400, span: 13.8, len: 11.0, crew: ['pilot', 'gunner'], turrets: [['mg15', 1, 'rear']], guns: [['mg17', 2, 'wing']], hp: [['Centreline', 'b', 500, 1], ['Wing racks', 'b', 50, 4]], payload: 700, g: 6, role: 'attack', fixedGear: true, gull: true });
AIP('usa', 'b17g', 'Boeing B-17G Flying Fortress', 3, 1943, { shape: 'bomber4', eng: 4, spd: 462, clb: 4.6, turn: 45, roll: 35, mass: 25000, span: 31.6, len: 22.7, crew: ['pilot', 'copilot', 'gunner', 'gunner', 'gunner', 'gunner'], turrets: [['m2', 2, 'dorsal'], ['m2', 2, 'ventral'], ['m2', 2, 'tail'], ['m2', 2, 'nose']], guns: [], hp: [['Bomb bay', 'b', 500, 6]], payload: 2700, g: 3 });
AIP('jpn', 'b5n', 'Nakajima B5N2 "Kate"', 3, 1941, { shape: 'mono', spd: 378, clb: 7, turn: 24, roll: 60, mass: 3800, span: 15.5, len: 10.3, crew: ['pilot', 'gunner'], turrets: [['type92', 1, 'rear']], guns: [], hp: [['Centreline', 'b', 800, 1]], payload: 800, g: 5, role: 'attack' });
AIP('ussr', 'pe2', 'Petlyakov Pe-2', 3, 1942, { shape: 'twin', eng: 2, spd: 540, clb: 7, turn: 30, roll: 60, mass: 7500, span: 17.2, len: 12.7, crew: ['pilot', 'gunner'], turrets: [['ubs', 1, 'dorsal']], guns: [['ubs', 1, 'nose']], hp: [['Bomb bay', 'b', 250, 4]], payload: 1000, g: 5 });
AIP('usa', 'b29', 'Boeing B-29 Superfortress', 4, 1950, { shape: 'bomber4', eng: 4, spd: 574, clb: 4.8, turn: 50, roll: 30, mass: 54000, span: 43.1, len: 30.2, crew: ['pilot', 'copilot', 'gunner', 'gunner', 'gunner'], turrets: [['m2', 2, 'dorsal'], ['m2', 2, 'ventral'], ['m2', 2, 'tail']], guns: [], hp: [['Bomb bays', 'b', 1000, 8]], payload: 9000, g: 3 });
AIP('ussr', 'tu16', 'Tupolev Tu-16 Badger', 5, 1957, { shape: 'jet_bomber', kind: J, eng: 2, spd: 1050, clb: 20, turn: 55, roll: 40, mass: 75000, span: 33, len: 34.8, crew: ['pilot', 'copilot', 'gunner', 'gunner'], turrets: [['nr23', 2, 'dorsal'], ['nr23', 2, 'tail']], guns: [], hp: [['Bomb bay', 'b', 1000, 6]], payload: 9000, g: 3 });
AIP('usa', 'f105', 'Republic F-105D Thunderchief', 5, 1964, { shape: 'jet_sw', kind: J, ab: true, spd: 2200, clb: 190, turn: 35, roll: 140, mass: 23800, span: 10.6, len: 19.6, guns: [['m61', 1, 'nose']], hp: [['Bomb bay', 'b', 1000, 1], ['Wing pylons', 'b', 1000, 4]], payload: 6300, g: 8.67, role: 'attack', flares: 20 });
AIP('usa', 'a4', 'Douglas A-4 Skyhawk', 5, 1970, { shape: 'jet_d', kind: J, spd: 1080, clb: 43, turn: 22, roll: 200, mass: 11100, span: 8.4, len: 12.2, guns: [['m3cannon', 2, 'wing']], hp: [['Pylons', 'b', 500, 4]], payload: 4500, g: 8, role: 'attack', flares: 20 });
AIP('ussr', 'su24', 'Sukhoi Su-24M Fencer', 6, 1983, { shape: 'jet_sw2', kind: J, eng: 2, ab: true, spd: 1700, clb: 150, turn: 35, roll: 120, mass: 38000, span: 17.6, len: 22.5, crew: ['pilot', 'wso'], guns: [['gsh23', 1, 'nose']], hp: [['Pylons', 'b', 1000, 6]], payload: 8000, g: 6, role: 'attack', flares: 60 });
AIP('usa', 'f15e', 'McDonnell Douglas F-15E Strike Eagle', 7, 1998, { shape: 'jet_tt', kind: J, eng: 2, ab: true, spd: 2655, clb: 254, turn: 20, roll: 240, mass: 30000, span: 13.0, len: 19.4, crew: ['pilot', 'wso'], guns: [['m61', 1, 'nose']], hp: [['CFT stations', 'b', 1000, 6], ['Wing rails', 'm', 100, 2]], payload: 10400, g: 9, aoa: 30, role: 'attack', radar: true, flares: 60 });

// ---- lookups
const MAKERS = ['North American', 'Focke-Wulf', 'Messerschmitt', 'Lockheed Martin', 'Lockheed', 'Republic', 'Curtiss', 'Vought', 'Boeing', 'McDonnell Douglas', 'General Dynamics', 'Sopwith', 'Royal Aircraft Factory', 'Gloster', 'Hawker', 'Supermarine', 'English Electric', 'Panavia', 'Polikarpov', 'Yakovlev', 'Lavochkin', 'Ilyushin', 'Mikoyan-Gurevich', 'Mikoyan', 'Sukhoi', 'Kawasaki', 'Nakajima', 'Mitsubishi', 'Kawanishi', 'Dewoitine', 'Morane-Saulnier', 'Dassault', 'Heinkel', 'Fokker', 'Albatros', 'Junkers', 'Petlyakov', 'Tupolev', 'Douglas', 'Handley Page', 'Canadair'];
for (const p of PLANE_LIST) { let n = p.name; for (const mk of MAKERS) if (n.startsWith(mk + ' ')) { n = n.slice(mk.length + 1); break; } p.short = n.replace(/ \((USAS|Luftwaffe|NVA|JASDF|Imperial Russian|Ko 3)\)/, ''); }
const planesOf = (nation, includeAI) => PLANE_LIST.filter(p => p.nation === nation && (includeAI || !p.aiOnly)).sort((a, b) => a.era - b.era || a.year - b.year);
// fighters of an era (falling back to the nearest era that has any) for bots
function botPlanes(era, nation, role) {
  const pool = r => PLANE_LIST.filter(p => (!nation || p.nation === nation) && (role ? p.role === role : !p.aiOnly));
  for (let d = 0; d <= 6; d++) for (const e of [era - d, era + d]) { const l = pool().filter(p => p.era === e); if (l.length) return l; }
  return nation ? botPlanes(era, null, role) : PLANE_LIST.filter(p => !p.aiOnly);
}
function bomberPlanes(era, nation) {
  const all = PLANE_LIST.filter(p => p.aiOnly && (p.role === 'bomber' || p.role === 'attack'));
  let best = null, bd = 99; for (const p of all) { const d = Math.abs(p.era - era) * 10 + (nation && p.nation !== nation ? 3 : 0); if (d < bd) { bd = d; best = p; } }
  return all.filter(p => p.era === best.era && (!nation || p.nation === nation || best.nation !== nation));
}
// which stores a plane may mount at a station
function storeAllowed(plane, storeId, station) {
  const s = STORES[storeId]; if (!s) return false;
  if (station && !station[1].includes(s.kind)) return false;
  if (station && s.mass > station[2]) return false;
  if (plane.era < s.eras[0] || plane.era > s.eras[1]) return false;
  if (s.nat && !s.nat.includes(plane.nation)) return false;
  if (s.bloc && s.bloc !== plane.bloc) return false;
  if (s.kind === 'm' && s.radar && !plane.radar) return false;
  return true;
}
function storesFor(plane) {
  const out = []; for (const id in STORES) if (plane.hp.some(st => storeAllowed(plane, id, st))) out.push(id);
  return out;
}
