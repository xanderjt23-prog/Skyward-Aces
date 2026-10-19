// ============================================================================
// Paint schemes ("decals") the player can buy per aircraft with coins. Every scheme is one the type really wore in
// service, named after it; the colours approximate the period paint standards (FS 595 / RLM / RAF / Soviet AMT
// numbers given in the descriptions). pattern: 0 one colour over another (top / underside), 1 two-tone
// disruptive, 2 three-tone, 3 splinter, 4 mottle, 5 stealth greys; c: the camouflage colours; metal: bare aluminium
// (shinier). The markings stay the nation's.
// ============================================================================
const LIVERIES = [
  // ---- USA
  { id: 'usaaf_nm', name: 'Natural metal (USAAF 1944-45)', desc: 'Camouflage paint was dropped from early 1944: bare polished aluminium, faster and lighter.', planes: ['p51d', 'p47d', 'b17g', 'b25j'], top: 0xc5c9cd, bot: 0xbfc3c7, pattern: 0, metal: true },
  { id: 'raf_kitty', name: 'RAF Kittyhawk desert scheme', desc: 'Kittyhawk Ia in North Africa: Dark Earth and Middle Stone over Azure Blue.', planes: ['p40e'], top: 0x7a6447, bot: 0x8fa9c6, pattern: 1, c: [0x7a6447, 0xb59c6c, 0xb59c6c] },
  { id: 'usn_tri', name: 'US Navy tri-colour (1943)', desc: 'Non-specular Sea Blue upper surfaces, Intermediate Blue sides, Insignia White undersides.', planes: ['f4u1d', 'f6f5', 'sbd'], top: 0x2e4560, bot: 0xe6e8e6, pattern: 1, c: [0x2e4560, 0x55708d, 0x55708d] },
  { id: 'usn_gsb', name: 'Glossy Sea Blue (1944-45)', desc: 'From 1944 Navy fighters were painted overall Glossy Sea Blue (ANA 623).', planes: ['f4u1d', 'f6f5'], top: 0x1d2c44, bot: 0x1d2c44, pattern: 0 },
  { id: 'usn_bluegray', name: 'Blue Gray over Light Gray (1941)', desc: 'The 1941 Navy scheme: Blue Gray upper surfaces over Light Gray.', planes: ['sbd'], top: 0x5b6f80, bot: 0xb5bbbd, pattern: 0 },
  { id: 'usaf_nm50', name: 'Natural metal (1950s-early 1960s)', desc: 'Before Vietnam camouflage, USAF fighter-bombers flew in bare aluminium.', planes: ['f100d', 'f105'], top: 0xc2c6ca, bot: 0xbcc0c4, pattern: 0, metal: true },
  { id: 'hill2', name: 'Hill Gray II (1980s)', desc: 'Two greys, FS 36118 Gunship Gray and FS 36270, applied to late F-4Es.', planes: ['f4e'], top: 0x5b6266, bot: 0x8e959a, pattern: 1, c: [0x5b6266, 0x8e959a, 0x8e959a] },
  { id: 'euro1', name: 'European I (1980s)', desc: 'The wrap-around NATO scheme for Central Europe: FS 34092 and 34102 greens with FS 36081 grey.', planes: ['f4e', 'a10a', 'f111f'], top: 0x3b4636, bot: 0x3b4636, pattern: 2, c: [0x2f3a2d, 0x4f5b3a, 0x3d4245] },
  { id: 'asblue', name: 'Air Superiority Blue (1970s)', desc: 'The first F-15As wore FS 35450 Air Superiority Blue.', planes: ['f15c'], top: 0x7f99b3, bot: 0x8aa2ba, pattern: 0 },
  { id: 'nellis_desert', name: 'Aggressor desert splinter (Nellis)', desc: 'USAF Aggressor F-16s mimicked threat aircraft with tan and brown splinter camouflage.', planes: ['f16c'], top: 0xb59a6b, bot: 0xb8b2a2, pattern: 3, c: [0xc2a675, 0x8a6a45, 0x6b5a45] },
  { id: 'ghost_a10', name: 'Compass Ghost Gray (A-10C era)', desc: 'From the late 1990s the A-10 changed to two-tone Compass Ghost Grays.', planes: ['a10a'], top: 0x7c8287, bot: 0x9da4a9, pattern: 1, c: [0x737a7f, 0x8d949a, 0x8d949a] },
  { id: 'tps_f14', name: 'Tactical Paint Scheme (1980s)', desc: 'Low-visibility greys replaced the Gull Gray and white of the early Tomcats.', planes: ['f14a'], top: 0x7f878d, bot: 0x9aa2a8, pattern: 1, c: [0x737b81, 0x8e969c, 0x8e969c] },
  { id: 'gunship_f111', name: 'Gunship Gray (1990s)', desc: 'F-111Fs ended their service in overall FS 36118 Gunship Gray.', planes: ['f111f'], top: 0x50575c, bot: 0x50575c, pattern: 0 },
  // ---- Germany
  { id: 'rlm707165', name: 'RLM 70/71 over 65 (1939-40)', desc: 'Black Green and Dark Green splinter over Light Blue: the early-war fighter scheme.', planes: ['bf109e'], top: 0x37402d, bot: 0x8fa5b5, pattern: 3, c: [0x2f382a, 0x3f4a33, 0x2f382a] },
  { id: 'rlm7978', name: 'Tropical RLM 79/78 (North Africa)', desc: 'Sand Yellow upper surfaces over Light Blue for the desert campaign.', planes: ['bf109e', 'bf109g', 'ju87', 'ju88'], top: 0xb7955f, bot: 0x8fa9c0, pattern: 0 },
  { id: 'winter_ger', name: 'Winter whitewash (Eastern Front)', desc: 'A temporary white distemper painted over the camouflage in the Russian winter.', planes: ['bf109g', 'fw190a', 'ju87', 'he111'], top: 0xdfe2df, bot: 0x9eb1c4, pattern: 4, c: [0xe4e6e2, 0x6c7461, 0xd5d8d3] },
  { id: 'rlm8182', name: 'RLM 81/82 over 76 (1944-45)', desc: 'The late-war Brown Violet and Light Green over Light Blue.', planes: ['fw190a', 'fw190d9', 'me262', 'bf109g'], top: 0x5a5638, bot: 0xa7b5b9, pattern: 3, c: [0x55523a, 0x6e7a4a, 0x55523a] },
  { id: 'red_baron', name: 'Jasta 11 red (Richthofen)', desc: 'Manfred von Richthofen flew his Fokker Dr.I and Albatros D.III painted red.', planes: ['dr1', 'albd3'], top: 0xa3201c, bot: 0xa3201c, pattern: 0 },
  { id: 'ger_nm104', name: 'Natural metal (early F-104G)', desc: 'The first Luftwaffe Starfighters were delivered in bare aluminium.', planes: ['f104g'], top: 0xc1c5c9, bot: 0xbcc0c4, pattern: 0, metal: true },
  { id: 'norm83', name: 'Norm 83 (Luftwaffe late 1980s)', desc: 'Three greens wrapped around the whole aircraft for low-level flying over Germany.', planes: ['tornadoids'], top: 0x3c4a35, bot: 0x3c4a35, pattern: 2, c: [0x3c4a35, 0x58673f, 0x2f362d] },
  // ---- Britain
  { id: 'raf_desert', name: 'RAF desert scheme', desc: 'Dark Earth and Middle Stone over Azure Blue, used in North Africa and the Mediterranean.', planes: ['spit9', 'hurri1'], top: 0x7a6447, bot: 0x8fa9c6, pattern: 1, c: [0x7a6447, 0xb59c6c, 0xb59c6c] },
  { id: 'raf_night', name: 'Special Night (night intruder)', desc: 'Hurricane IIC night intruders were painted in matt Special Night black.', planes: ['hurri1'], top: 0x1b1c1e, bot: 0x1b1c1e, pattern: 0 },
  { id: 'raf_1939', name: 'Dark Earth / Dark Green (1939)', desc: 'Shadow-shading over Sky, the scheme the Gladiators took to war.', planes: ['gladiator'], top: 0x5d5a3f, bot: 0xb8c4b0, pattern: 1, c: [0x5d5a3f, 0x6b5737, 0x6b5737] },
  { id: 'black_arrows', name: 'Black Arrows (No. 111 Squadron)', desc: 'The RAF display team flew gloss-black Hunter F.6s from 1957.', planes: ['hunter6'], top: 0x101113, bot: 0x101113, pattern: 0 },
  { id: 'lightning_green', name: 'Dark Green over natural metal (1970s)', desc: 'Lightnings in RAF Germany were given Dark Green upper surfaces.', planes: ['lightning'], top: 0x3c4630, bot: 0xbfc3c7, pattern: 0 },
  { id: 'lightning_grey', name: 'Barley Grey (1980s)', desc: 'The last Lightnings wore the air-defence greys.', planes: ['lightning'], top: 0x8f9696, bot: 0xa7aeae, pattern: 0 },
  // ---- USSR
  { id: 'winter_vvs', name: 'Winter white (VVS)', desc: 'Soviet fighters and Shturmoviks were painted white over their camouflage for winter.', planes: ['yak3', 'yak9u', 'la5fn', 'i16', 'il2'], top: 0xe1e4e0, bot: 0xa9b8c4, pattern: 4, c: [0xe4e6e2, 0x5b6b45, 0xd6d9d4] },
  { id: 'amt_green', name: 'AMT-4 green and AMT-6 black (1942)', desc: 'The 1941-43 two-tone camouflage over AMT-7 light blue.', planes: ['yak3', 'la5fn', 'i16', 'il2', 'yak9u'], top: 0x4c5a32, bot: 0x9fb1bd, pattern: 1, c: [0x4c5a32, 0x22241f, 0x22241f] },
  { id: 'vvs_nm', name: 'Natural metal', desc: 'Early MiG-21s were left in bare aluminium.', planes: ['mig21bis'], top: 0xc0c4c8, bot: 0xbabec2, pattern: 0, metal: true },
  // ---- Japan
  { id: 'ameiro', name: 'Ameiro amber grey (1941)', desc: 'At Pearl Harbor the A6M2 was painted an overall glossy grey-green ("ameiro").', planes: ['a6m2'], top: 0xb3ad8c, bot: 0xb3ad8c, pattern: 0 },
  { id: 'ki_nm', name: 'Natural metal', desc: 'Many Army fighters were delivered in bare aluminium, with field-applied green mottle or none.', planes: ['ki43', 'ki61'], top: 0xc1c5c9, bot: 0xbcc0c4, pattern: 0, metal: true },
  { id: 'ki_mottle', name: 'Green mottle over natural metal', desc: 'Field-applied dark green blotches over bare metal, typical of 1943-44.', planes: ['ki43', 'ki61'], top: 0x4f5d3a, bot: 0xbcc0c4, pattern: 4, c: [0x3f4d30, 0xbfc3c7, 0x3f4d30] },
  { id: 'jasdf_aggr', name: 'Aggressor blue (Tactical Fighter Training Group)', desc: 'The JASDF aggressor F-15Js wear bold multi-tone camouflage; this is one of the blue schemes.', planes: ['f15j'], top: 0x4f6f98, bot: 0x9db1c6, pattern: 3, c: [0x2f4d78, 0x6f8fb8, 0xa7bdd2] },
  { id: 'f4ej_sea', name: 'Maritime blue camouflage', desc: 'Anti-shipping F-4EJ Kais were repainted in two-tone sea blue.', planes: ['f4ej'], top: 0x3d5a7a, bot: 0x8ea6bd, pattern: 1, c: [0x3d5a7a, 0x5f7f9e, 0x5f7f9e] },
  // ---- France
  { id: 'fr_nm', name: 'Natural metal (1960s)', desc: 'The first Mirage IIICs served in bare metal.', planes: ['mirage3c'], top: 0xc2c6ca, bot: 0xbcc0c4, pattern: 0, metal: true },
  { id: 'daguet', name: 'Desert sand (Operation Daguet, 1991)', desc: 'French Jaguars in the Gulf War were painted in temporary sand.', planes: ['jaguar'], top: 0xc8ae84, bot: 0xc8ae84, pattern: 0 },
];
const LIVERY = {}; for (const l of LIVERIES) { LIVERY[l.id] = l; if (!l.c) l.c = [l.top, l.top, l.top]; }
const liveriesFor = id => LIVERIES.filter(l => l.planes.includes(id));
const liveryPrice = pl => 600 + pl.era * pl.era * 180;
