// node tools/fetch_photos.mjs [planes|stores] [ids...] : real photographs for the hangar and the modifications menu.
// For every aircraft / weapon it finds the Wikipedia article (TITLE overrides below, otherwise a search), takes the
// article's lead image from Wikimedia Commons as a 400 px wide thumbnail into assets/photos/<kind>/<id>.jpg, and records
// the author, licence and file page in js/photocredits.js (shown under every photo).
import fs from 'fs';
import path from 'path';
const UA = { 'User-Agent': 'SkywardAcesPhotoFetcher/1.0 (personal hobby game; one-off thumbnail download)' };
const root = path.resolve('.');
// load the game data (plain scripts) to get the ids and names
const ctx = {}; const src = ['js/data.js', 'js/planes.js', 'js/bombers.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
new Function('ctx', src + '\nctx.PLANE_LIST = PLANE_LIST; ctx.STORES = STORES;')(ctx);
// article titles where a plain search on the name would land on the wrong page
const TITLE = {
  // aircraft: Wikipedia covers most types in one article per family
  p51d: 'North American P-51 Mustang', fw190d9: 'Focke-Wulf Fw 190 D', su7b: 'Sukhoi Su-7', mig17: 'Mikoyan-Gurevich MiG-17', la5fn: 'Lavochkin La-5', f1j: 'Mitsubishi F-1', p40e: 'Curtiss P-40 Warhawk', p47d: 'Republic P-47 Thunderbolt', g4m: 'Mitsubishi G4M', m2000d: 'Dassault Mirage 2000N/2000D', f4e: 'McDonnell Douglas F-4 Phantom II', f4ej: 'Mitsubishi F-4EJ', f16c: 'General Dynamics F-16 Fighting Falcon', f15c: 'McDonnell Douglas F-15 Eagle', f15j: 'Mitsubishi F-15J', f15e: 'McDonnell Douglas F-15E Strike Eagle',
  ef2000g: 'Eurofighter Typhoon', ef2000uk: 'Eurofighter Typhoon', mig29: 'Mikoyan MiG-29', mig29g: 'Mikoyan MiG-29', su27: 'Sukhoi Su-27', fa18e: 'Boeing F/A-18E/F Super Hornet', tornadoids: 'Panavia Tornado', tornadogr1: 'Panavia Tornado', tornadof3: 'Panavia Tornado ADV',
  bf109e: 'Messerschmitt Bf 109', bf109g: 'Messerschmitt Bf 109', fw190a: 'Focke-Wulf Fw 190', spit9: 'Supermarine Spitfire', b17g: 'Boeing B-17 Flying Fortress', b25j: 'North American B-25 Mitchell', ju87: 'Junkers Ju 87', lancaster: 'Avro Lancaster', b29: 'Boeing B-29 Superfortress',
  a10a: 'Fairchild Republic A-10 Thunderbolt II', f111f: 'General Dynamics F-111 Aardvark', su34: 'Sukhoi Su-34', su25: 'Sukhoi Su-25', f22a: 'Lockheed Martin F-22 Raptor', f35a: 'Lockheed Martin F-35 Lightning II', m2000c: 'Dassault Mirage 2000', m2000d: 'Dassault Mirage 2000D/N',
  // weapons
  aim9b: 'AIM-9 Sidewinder', aim9d: 'AIM-9 Sidewinder', aim9l: 'AIM-9 Sidewinder', aim9p: 'AIM-9 Sidewinder', aim9x: 'AIM-9 Sidewinder', aim7e: 'AIM-7 Sparrow', aim7f: 'AIM-7 Sparrow', aim7m: 'AIM-7 Sparrow', aim120: 'AIM-120 AMRAAM', aim120d: 'AIM-120 AMRAAM', aim54: 'AIM-54 Phoenix', aim4d: 'AIM-4 Falcon',
  r3s: 'K-13 (missile)', r13m: 'K-13 (missile)', r60: 'R-60 (missile)', r73: 'R-73 (missile)', r74: 'R-73 (missile)', r27r: 'R-27 (air-to-air missile)', r27er: 'R-27 (air-to-air missile)', r27et: 'R-27 (air-to-air missile)', r77: 'R-77', r771: 'R-77', r40t: 'Bisnovat R-40', r40r: 'Bisnovat R-40',
  firestreak: 'de Havilland Firestreak', redtop: 'Hawker Siddeley Red Top', skyflash: 'Skyflash', asraam: 'AIM-132 ASRAAM', meteor: 'Meteor (missile)', irist: 'IRIS-T', micair: 'MICA (missile)', micaem: 'MICA (missile)', magic1: 'R.550 Magic', magic2: 'R.550 Magic', r530: 'Matra R.530', s530d: 'Super 530', s530f: 'Super 530', aam3: 'AAM-3', aam4: 'AAM-4',
  mk81: 'Mark 81 bomb', mk82: 'Mark 82 bomb', mk82se: 'Mark 82 bomb', mk83: 'Mark 83 bomb', mk84: 'Mark 84 bomb', m117: 'M117 bomb', gbu12: 'GBU-12 Paveway II', gbu10: 'GBU-10 Paveway II', pw1000: 'Paveway', gbu38: 'Joint Direct Attack Munition', gbu31: 'Joint Direct Attack Munition', cbu87: 'CBU-87 Combined Effects Munition',
  an_m30: 'AN-M30 bomb', an_m57: 'AN-M57 bomb', an_m64: 'AN-M64 bomb', an_m65: 'AN-M65 bomb', an_m66: 'AN-M66 bomb', an_m1a2: 'AN-M1A2 cluster bomb', sc50: 'SC 50 bomb', sc250: 'SC 250 bomb', sc500: 'SC 500 bomb', sc1000: 'SC 1000 bomb', sc1800: 'SC 1800 bomb', sd250: 'SD 250 bomb', ab250: 'AB 250-2',
  hc4000: 'Blockbuster bomb', fab50: 'FAB-50', fab100: 'FAB-100', fab250: 'FAB-250', fab250m54: 'FAB-250', fab500: 'FAB-500', fab500m62: 'FAB-500', fab1000: 'FAB-1000', fab1500: 'FAB-1500', ofab250: 'FAB-250', rbk500: 'RBK-500', kab500: 'KAB-500L', kab500s: 'KAB-500S-E', ptab: 'PTAB (bomb)',
  bl755: 'BL755', belouga: 'BLG 66 Belouga', bap100: 'BAP 100', aasm: 'AASM Hammer', samp250: 'SAMP bomb', samp400: 'SAMP bomb', uk1000: '1000 lb General Purpose bomb', mc500: 'MC 500 lb bomb', mc1000: 'MC 1000 lb bomb', gp250: 'GP 250 lb bomb',
  cooper: 'Cooper bomb', rl112: 'Royal Laboratory 112 lb bomb', rl230: 'Royal Laboratory 230 lb bomb', puw12: 'P.u.W. bomb', puw50: 'P.u.W. bomb', puw100: 'P.u.W. bomb', puw300: 'P.u.W. bomb', ga10: 'Gros-Andreau bomb', ga50: 'Gros-Andreau bomb',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(host, params) { const u = `https://${host}/w/api.php?` + new URLSearchParams(Object.assign({ format: 'json', formatversion: 2 }, params)); for (let k = 0; k < 6; k++) { let r; try { r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); } catch (e) { await sleep(2000); continue; } if (r.ok) return r.json(); await sleep(r.status === 429 ? 20000 * (k + 1) : 3000 * (k + 1)); } throw new Error('api ' + u); }
async function leadImage(title) {
  const j = await api('en.wikipedia.org', { action: 'query', titles: title, prop: 'pageimages', piprop: 'name|thumbnail', pithumbsize: 400, redirects: 1 });
  const pg = j.query && j.query.pages && j.query.pages[0]; if (!pg || pg.missing || !pg.thumbnail) return null;
  return { title: pg.title, file: pg.pageimage, thumb: pg.thumbnail.source };
}
// no picture in the article: search Wikimedia Commons itself for a photograph (jpg) of it
async function commonsSearch(q) {
  const j = await api('commons.wikimedia.org', { action: 'query', list: 'search', srnamespace: 6, srsearch: q + ' filetype:bitmap', srlimit: 8 });
  const hit = (j.query.search || []).map(h => h.title).find(t => /\.(jpe?g|png)$/i.test(t)); if (!hit) return null;
  const k = await api('commons.wikimedia.org', { action: 'query', titles: hit, prop: 'imageinfo', iiprop: 'url', iiurlwidth: 400 });
  const ii = k.query.pages[0].imageinfo; if (!ii) return null;
  return { title: 'Wikimedia Commons: ' + q, file: hit.replace(/^File:/, ''), thumb: ii[0].thumburl || ii[0].url };
}
// Commons search words for things whose article has no usable picture
const COMMONS = { mk82: 'Mk 82 bomb', mk82se: 'Mk 82 Snakeye', mk84: 'Mk 84 bomb', cbu87: 'CBU-87', gbu10: 'GBU-10 Paveway', gbu38: 'GBU-38 JDAM', gbu31: 'GBU-31 JDAM', an_m30: 'AN-M30 bomb', an_m57: 'AN-M57 bomb', an_m64: 'AN-M64 bomb', an_m65: 'AN-M65 bomb', an_m66: 'AN-M66 bomb', an_m1a2: 'AN-M1A2 cluster bomb',
  sd250: 'SD 250 bomb', sc1000: 'SC 1000 bomb', sc1800: 'SC 1800 bomb', gp250: '250 lb GP bomb RAF', mc500: '500 lb MC bomb', mc1000: '1000 lb MC bomb', fab50: 'FAB-50 bomb', fab100: 'FAB-100 bomb', fab1000: 'FAB-1000 bomb', samp250: 'SAMP 250 bomb', samp400: 'SAMP 400 bomb', bap100: 'BAP 100', belouga: 'BLG 66 Belouga', rbk500: 'RBK-500',
  uk1000: '1000 lb bomb RAF', rs82: 'RS-82 rocket', rs132: 'RS-132 rocket', aam4: 'AAM-4 missile', rl112: '112 lb bomb 1918', rl230: '230 lb bomb 1918', puw12: 'PuW Bombe', puw50: 'PuW Bombe', puw100: 'PuW Bombe', puw300: 'PuW Bombe', ga10: 'Gros-Andreau bombe', ga50: 'Gros-Andreau bombe',
  m30: 'M30 bomb 100 lb', m31: 'M31 bomb 300 lb', m32: 'M32 bomb 600 lb', m33: 'M33 bomb 1100 lb', fra500: 'bombe 500 kg 1930', type94_60: 'Japanese 60 kg bomb', t99_25ap: 'Type 99 No. 25 bomb', t92_50: 'Japanese 50 kg bomb',
  f4ej: 'Mitsubishi F-4EJ Kai', g4m: 'Mitsubishi G4M Betty', p40e: 'P-40E Warhawk', p47d: 'P-47D Thunderbolt', m2000d: 'Mirage 2000D' };
// a curated Commons category (one per type): its first landscape photograph of a decent size
async function catFile(cat) {
  const j = await api('commons.wikimedia.org', { action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + cat, gcmtype: 'file', gcmlimit: 40, prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: 400 });
  const files = Object.values((j.query || {}).pages || {}).filter(p => /\.jpe?g$/i.test(p.title) && p.imageinfo && p.imageinfo[0].width >= 1000 && p.imageinfo[0].width > p.imageinfo[0].height * 1.25);
  const f = files[0]; if (!f) return null;
  return { title: 'Wikimedia Commons: Category:' + cat, file: f.title.replace(/^File:/, ''), thumb: f.imageinfo[0].thumburl };
}
const CAT = { bf109e: 'Messerschmitt Bf 109E-3', m2000d: 'Mirage 2000D', f4ej: 'Mitsubishi F-4 Kai', gbu38: 'GBU-38', gbu31: 'GBU-31', fab1500: 'FAB-1500', s24: 'S-24 rocket', rs82: 'RS-82 (rockets)', rs132: 'RS-132' };
// chosen by hand where a search or category gives a drawing or the wrong thing: an exact Commons file
const FILES = { bf109e: 'Bf 109E-3 in flight (1940).jpg' };
async function exactFile(name) { const j = await api('commons.wikimedia.org', { action: 'query', titles: 'File:' + name, prop: 'imageinfo', iiprop: 'url', iiurlwidth: 400 }); const p = j.query.pages[0]; if (!p || !p.imageinfo) return null; return { title: 'Wikimedia Commons', file: name, thumb: p.imageinfo[0].thumburl }; }
// where the article's picture is of something else: straight to a Commons search with these words
const FORCE = new Set(['bf109e', 'f4ej', 'm2000d', 'crv7', 's13', 'sneb', 's24', 'gp_m2', 'gp_upk23', 'gp_suu23', 'gp_gpu5', 'gbu38', 'gbu31', 'bap100', 'fab1500', 'sc1800', 'rs82', 'rs132', 'mc500', 'mc1000', 'gp250', 'uk1000', 't99_80', 't99_25']);
Object.assign(COMMONS, { bf109e: 'Bf 109 E-3', f4ej: 'F-4EJ Kai JASDF', m2000d: "Mirage 2000D Armée de l'air", crv7: 'CRV7 rocket', s13: 'B-13L rocket pod', sneb: 'SNEB rocket pod', s24: 'S-24 rocket', gp_m2: 'M2 Browning gun pod aircraft', gp_upk23: 'UPK-23-250', gp_suu23: 'SUU-23/A gun pod', gp_gpu5: 'GPU-5/A gun pod',
  gbu38: 'GBU-38 JDAM bomb', gbu31: 'GBU-31 JDAM bomb', bap100: 'BAP 100 bomb', fab1500: 'FAB-1500 bomb', sc1800: 'SC 1800 Satan bomb', rs82: 'RS-82 rocket museum', rs132: 'RS-132 rocket museum', mc500: '500 lb Medium Capacity bomb', mc1000: '1000 lb Medium Capacity bomb', gp250: '250 lb General Purpose bomb', uk1000: '1000 lb bomb Royal Air Force', t99_80: 'Type 99 No. 80 bomb', t99_25: 'Japanese 250 kg bomb' });
async function search(q) { const j = await api('en.wikipedia.org', { action: 'query', list: 'search', srsearch: q, srlimit: 1 }); return j.query.search[0] ? j.query.search[0].title : null; }
async function credit(file) {
  const j = await api('commons.wikimedia.org', { action: 'query', titles: 'File:' + file, prop: 'imageinfo', iiprop: 'extmetadata|url' });
  const ii = j.query.pages[0].imageinfo; if (!ii) { const j2 = await api('en.wikipedia.org', { action: 'query', titles: 'File:' + file, prop: 'imageinfo', iiprop: 'extmetadata|url' }); const i2 = j2.query.pages[0].imageinfo; if (!i2) return null; return meta(i2[0]); }
  return meta(ii[0]);
}
const strip = h => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
function meta(i) { const e = i.extmetadata || {}; return { author: strip(e.Artist && e.Artist.value).slice(0, 120) || 'unknown', licence: strip(e.LicenseShortName && e.LicenseShortName.value) || 'see file page', page: i.descriptionurl }; }
const kind = process.argv[2] || 'planes', only = process.argv.slice(3);
const items = kind === 'planes' ? ctx.PLANE_LIST.filter(p => !p.aiOnly || true).map(p => ({ id: p.id, name: p.name })) : Object.keys(ctx.STORES).map(id => ({ id, name: ctx.STORES[id].name }));
const credFile = path.join(root, 'js/photocredits.js');
let CRED = {}; if (fs.existsSync(credFile)) { const t = fs.readFileSync(credFile, 'utf8'); CRED = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }
const dir = path.join(root, 'assets/photos', kind); fs.mkdirSync(dir, { recursive: true });
let ok = 0, miss = [];
for (const it of items) {
  if (only.length && !only.includes(it.id)) continue;
  if (!only.length && CRED[kind + '/' + it.id] && fs.existsSync(path.join(root, CRED[kind + '/' + it.id].src))) continue; // already fetched (resume)
  try {
    const q = it.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/"[^"]*"/g, '').trim();
    let img0 = FILES[it.id] ? await exactFile(FILES[it.id]) : CAT[it.id] ? await catFile(CAT[it.id]) : null;
    let title = img0 ? null : FORCE.has(it.id) ? null : TITLE[it.id] || await search(q + (kind === 'planes' ? ' aircraft' : ''));
    let img = img0 || (title && await leadImage(title));
    if (!img && !TITLE[it.id] && !FORCE.has(it.id)) { title = await search(q); img = title && await leadImage(title); }
    if (!img) img = await commonsSearch(COMMONS[it.id] || q + (kind === 'stores' ? '' : ' aircraft'));
    if (!img) { miss.push(it.id + ' (' + it.name + ' -> ' + title + ')'); continue; }
    const r = await fetch(img.thumb, { headers: UA, signal: AbortSignal.timeout(30000) }); if (!r.ok) { miss.push(it.id + ' download ' + r.status); continue; }
    const buf = Buffer.from(await r.arrayBuffer()), ext = /\.png$/i.test(img.thumb) ? 'png' : 'jpg';
    fs.writeFileSync(path.join(dir, it.id + '.' + ext), buf);
    const c = await credit(img.file) || { author: 'unknown', licence: 'see file page', page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(img.file) };
    CRED[kind + '/' + it.id] = Object.assign({ src: `assets/photos/${kind}/${it.id}.${ext}`, article: img.title, file: img.file }, c); ok++;
    process.stdout.write('.'); save();
    await sleep(1500);
  } catch (e) { miss.push(it.id + ' error ' + e.message.slice(0, 80)); }
}
save();
function save() { fs.writeFileSync(credFile,'// Photographs (Wikimedia Commons lead images of the Wikipedia articles), written by tools/fetch_photos.mjs:\n// file, author and licence of each, shown under the photo in the hangar and the modifications menu.\nconst PHOTO_CREDITS = ' + JSON.stringify(CRED, null, 0).replace(/},"/g, '},\n"') + ';\n'); }
console.log('\n' + kind + ': ' + ok + ' photos; missing ' + miss.length + (miss.length ? ':\n  ' + miss.join('\n  ') : ''));
