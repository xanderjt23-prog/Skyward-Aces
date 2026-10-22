// node tools/factcheck.mjs [ids...] : checks the aircraft database against Wikipedia. For every aircraft it reads the
// article's specification block ({{Aircraft specs}} template, or the older bulleted "Specifications" list) and writes
//   tools/factcheck.json   the raw figures and equipment per aircraft (engines, avionics / radar, armament, speed...)
//   tools/factcheck.txt    every figure that differs from the game's by more than 12%, for review
// The article is the one the photo came from (js/photocredits.js) or the TITLE given in tools/fetch_photos.mjs.
import fs from 'fs';
const UA = { 'User-Agent': 'SkywardAcesFactCheck/1.0 (personal hobby game; one-off read of aircraft specifications)' };
const ctx = {}; new Function('ctx', ['js/data.js', 'js/planes.js', 'js/bombers.js', 'js/photocredits.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\nctx.PL = PLANE_LIST; ctx.CR = PHOTO_CREDITS;')(ctx);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(params) { const u = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams(Object.assign({ format: 'json', formatversion: 2 }, params));
  for (let k = 0; k < 6; k++) { let r; try { r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); } catch (e) { await sleep(3000); continue; } if (r.ok) return r.json(); await sleep(r.status === 429 ? 20000 * (k + 1) : 3000); } throw new Error('api'); }
// the {{Aircraft specs ...}} template: its top-level |name=value parameters
function specs(wt) {
  const i = wt.search(/\{\{\s*(Aircraft specs|Aircraft specifications|aerospecs)/i); if (i < 0) return null;
  let d = 0, j = i; for (; j < wt.length; j++) { if (wt.startsWith('{{', j)) { d++; j++; } else if (wt.startsWith('}}', j)) { d--; j++; if (!d) break; } }
  const body = wt.slice(i + 2, j - 1), out = {}; let depth = 0, cur = '';
  for (let k = 0; k < body.length; k++) { const c = body[k], two = body.slice(k, k + 2); if (two === '{{' || two === '[[') { depth++; cur += two; k++; continue; } if (two === '}}' || two === ']]') { depth--; cur += two; k++; continue; }
    if (c === '|' && depth === 0) { const e = cur.indexOf('='); if (e > 0) out[cur.slice(0, e).trim().toLowerCase()] = cur.slice(e + 1).trim(); cur = ''; } else cur += c; }
  const e = cur.indexOf('='); if (e > 0) out[cur.slice(0, e).trim().toLowerCase()] = cur.slice(e + 1).trim();
  return out;
}
const clean = s => String(s || '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/\{\{(?:convert|cvt)\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi, '$1 $2').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{[^}]*\}\}/g, '').replace(/<br\s*\/?>/g, '; ').replace(/'''?/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const num = s => { const m = String(s || '').replace(/,/g, '').match(/[\d.]+/); return m ? +m[0] : null; };
const out = {}, report = [], only = process.argv.slice(2);
for (const pl of ctx.PL) {
  if (only.length && !only.includes(pl.id)) continue;
  const title = (ctx.CR['planes/' + pl.id] || {}).article; if (!title) { report.push(pl.id + ': no article known'); continue; }
  try {
    const j = await api({ action: 'parse', page: title, prop: 'wikitext', redirects: 1 }); const wt = j.parse && j.parse.wikitext; if (!wt) { report.push(pl.id + ': no text'); continue; }
    const s = specs(wt); if (!s) { report.push(pl.id + ': no {{Aircraft specs}} in "' + title + '"'); continue; }
    const kmh = num(s['max speed kmh']) || (num(s['max speed kts']) && num(s['max speed kts']) * 1.852) || (num(s['max speed mph']) && num(s['max speed mph']) * 1.609) || null;
    const f = { article: title, variant: clean(s.ref || s['prime units?'] || ''), crew: clean(s.crew), length: num(s['length m']), span: num(s['span m']), speed: kmh && Math.round(kmh), mach: num(s['max speed mach']),
      climb: num(s['climb rate ms']) || (num(s['climb rate ftmin']) && +(num(s['climb rate ftmin']) * 0.00508).toFixed(1)), ceiling: num(s['ceiling m']), gross: num(s['gross weight kg']), maxTO: num(s['max takeoff weight kg']),
      engines: [1, 2].map(n => s[`eng${n} number`] || s[`eng${n} name`] ? clean(`${s[`eng${n} number`] || ''} × ${s[`eng${n} name`] || ''} ${s[`eng${n} type`] || ''} ${s[`eng${n} hp`] ? s[`eng${n} hp`] + ' hp' : ''}${s[`eng${n} kw`] ? ' (' + s[`eng${n} kw`] + ' kW)' : ''}${s[`eng${n} lbf`] ? ' ' + s[`eng${n} lbf`] + ' lbf' : ''}${s[`eng${n} kn`] ? ' (' + s[`eng${n} kn`] + ' kN)' : ''}${s[`eng${n} kn-ab`] ? ', ' + s[`eng${n} kn-ab`] + ' kN with afterburner' : ''}`) : null).filter(Boolean),
      avionics: clean(s.avionics), guns: clean(s.guns), missiles: clean(s.missiles), g: num(s['g limits']) };
    out[pl.id] = f;
    const cmp = (name, game, wiki) => { if (!game || !wiki) return; const r = game / wiki; if (r > 1.12 || r < 0.88) report.push(`${pl.id} (${pl.name}): ${name} game ${game} vs Wikipedia ${wiki} (${title})`); };
    cmp('top speed km/h', pl.spd, f.speed); cmp('climb m/s', pl.clb, f.climb); cmp('span m', pl.span, f.span); cmp('length m', pl.len, f.length);
    process.stdout.write('.'); await sleep(1200);
  } catch (e) { report.push(pl.id + ': error ' + e.message); }
}
let prev = {}; try { prev = JSON.parse(fs.readFileSync('tools/factcheck.json', 'utf8')); } catch (e) {}
fs.writeFileSync('tools/factcheck.json', JSON.stringify(Object.assign(prev, out), null, 1));
fs.writeFileSync('tools/factcheck.txt', report.join('\n') + '\n');
console.log('\n' + Object.keys(out).length + ' aircraft read; ' + report.length + ' notes (tools/factcheck.txt)');
