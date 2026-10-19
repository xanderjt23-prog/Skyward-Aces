// node tools/prepare_shot.mjs <in.wav> <key> <seconds> "<credit json>" : cuts the first gunshot out of a PCM WAV recording
// (from 5 ms before its onset, `seconds` long), mixes it to mono, resamples to 22.05 kHz 16-bit, and writes it as
// assets/sounds/<key>.js (window.SKY_SAMPLES[key] = WAV base64) plus an entry in assets/sounds/extra_credits.json
import fs from 'fs'; import path from 'path';
const [, , inp, key, secs, creditJson] = process.argv;
const buf = fs.readFileSync(inp);
if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
let off = 12, fmt = null, data = null;
while (off + 8 <= buf.length) { const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
  if (id === 'fmt ') fmt = { format: buf.readUInt16LE(off + 8), ch: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
  if (id === 'data') data = buf.subarray(off + 8, Math.min(buf.length, off + 8 + size));
  off += 8 + size + (size & 1); }
if (!fmt || !data || (fmt.format !== 1 && fmt.format !== 0xfffe)) throw new Error('unsupported WAV');
const bps = fmt.bits / 8, frames = Math.floor(data.length / (bps * fmt.ch)), mono = new Float32Array(frames);
const read = i => fmt.bits === 16 ? data.readInt16LE(i) / 32768 : fmt.bits === 24 ? data.readIntLE(i, 3) / 8388608 : fmt.bits === 32 ? data.readInt32LE(i) / 2147483648 : (data[i] - 128) / 128;
for (let f = 0; f < frames; f++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += read((f * fmt.ch + c) * bps); mono[f] = s / fmt.ch; }
let peak = 0; for (const v of mono) peak = Math.max(peak, Math.abs(v));
const cred = JSON.parse(creditJson), onset = cred.start != null ? Math.round(cred.start * fmt.rate) : Math.max(0, mono.findIndex(v => Math.abs(v) > peak * 0.25) - Math.round(fmt.rate * 0.005)); // a fixed start (loops) or the first shot
const len = Math.min(frames - onset, Math.round(fmt.rate * +secs)), out = 22050, n = Math.floor(len * out / fmt.rate), pcm = Buffer.alloc(44 + n * 2);
for (let i = 0; i < n; i++) { // box-filter resample, then a short fade at the end
  const a = onset + i * fmt.rate / out, b = a + fmt.rate / out; let s = 0, k = 0; for (let j = Math.floor(a); j < Math.min(frames, Math.ceil(b)); j++) { s += mono[j]; k++; }
  const fade = cred.start != null ? 1 : Math.min(1, (n - i) / (out * 0.03)); pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s / Math.max(1, k) / peak * 0.95 * fade * 32767))), 44 + i * 2); }
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(out, 24); pcm.writeUInt32LE(out * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
const dir = path.resolve('assets/sounds'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, key + '.js'), `(window.SKY_SAMPLES = window.SKY_SAMPLES || {})[${JSON.stringify(key)}] = { mime: "audio/wav", b64: ${JSON.stringify(pcm.toString('base64'))} };\n`);
const cf = path.join(dir, 'extra_credits.json'), list = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : [];
const c = Object.assign({ key }, cred); delete c.start; const i = list.findIndex(x => x.key === key); if (i >= 0) list[i] = c; else list.push(c);
fs.writeFileSync(cf, JSON.stringify(list, null, 1));
console.log(key, fmt.rate + ' Hz ' + fmt.bits + ' bit ' + fmt.ch + ' ch ->', n, 'samples,', Math.round(pcm.length / 1024) + ' KB');
