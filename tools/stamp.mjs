// node tools/stamp.mjs : stamps index.html for publishing. Every local script and stylesheet gets ?v=<hash of its
// contents>, so a browser fetches a file again as soon as it changes (and keeps using its cached copy while it hasn't),
// and <meta name="build"> gets one hash over all of them, shown in the menu so you can see which version is loaded.
// Runs by itself before every commit (tools/install-hooks.mjs); `node tools/stamp.mjs --check` exits 1 when out of date.
import fs from 'fs';
import crypto from 'crypto';
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
// hash the text as committed (line endings normalised), so Windows and the server agree
const fileHash = p => hash(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
const src = fs.readFileSync('index.html', 'utf8');
const all = [];
let out = src.replace(/((?:src|href)=")((?:js|vendor|css)\/[^"?]+)(?:\?v=[0-9a-f]*)?(")/g, (m, a, p, b) => { const h = fileHash(p); all.push(h); return `${a}${p}?v=${h}${b}`; });
const build = hash(all.join(''));
out = out.replace(/<meta name="build" content="[^"]*">/, `<meta name="build" content="${build}">`);
if (process.argv.includes('--check')) { if (out !== src) { console.log('index.html is not stamped for the current files: run node tools/stamp.mjs'); process.exit(1); } console.log('stamped, build ' + build); process.exit(0); }
if (out !== src) fs.writeFileSync('index.html', out);
console.log('build ' + build + ' (' + all.length + ' files)');
