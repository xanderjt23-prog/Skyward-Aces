// node tools/tests/cdp.mjs tools/tests/soundprobe.mjs : decodes each recorded sample and prints its length and a loudness
// profile (RMS per 0.5 s), to choose loop regions
import path from 'path'; import fs from 'fs';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const keys = fs.readdirSync('assets/sounds').filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));
  for (const k of keys) {
    const src = fs.readFileSync('assets/sounds/' + k + '.js', 'utf8');
    const r = await t.eval(`(async () => { ${src}; const s = window.SKY_SAMPLES['${k}'], bin = Uint8Array.from(atob(s.b64), c => c.charCodeAt(0));
      const ctx = new OfflineAudioContext(1, 44100, 44100), b = await ctx.decodeAudioData(bin.buffer); const d = b.getChannelData(0), w = Math.floor(b.sampleRate / 2), prof = [];
      for (let i = 0; i + w <= d.length; i += w) { let e = 0; for (let j = 0; j < w; j++) e += d[i + j] * d[i + j]; prof.push(Math.sqrt(e / w).toFixed(3)); }
      return b.duration.toFixed(2) + ' s, ' + b.numberOfChannels + ' ch, ' + b.sampleRate + ' Hz | ' + prof.join(' '); })()`);
    console.log(k.padEnd(12), String(r).slice(0, 700));
  }
}
