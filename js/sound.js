// ============================================================================
// Sound: real recordings where we have them (assets/sounds, credited in CREDITS.md / js/soundcredits.js) - engine
// loops (a Rolls-Royce Merlin, a radial, a propeller cruise, a Saab Draken jet), gunshots recorded from the same
// rifle cartridges the aircraft machine guns fired (.30-06, 7.62x54R, Japanese 7.7 mm), a cannon, explosions and
// real fly-bys - layered with WebAudio synthesis that follows the aircraft (engine order, rpm, cylinders, spool).
// Everything that has no recording is synthesised. Modelled on how the real sounds are
// made rather than played from recordings:
//  - piston engines: exhaust pulses at the cylinder firing frequency (rpm/60 x
//    cylinders/2), a half-order rumble, uneven combustion, propeller wash;
//    rotary, inline and radial engines and multi-engine beat differ
//  - jets: broadband low roar, turbine whine rising with spool speed, afterburner rumble
//  - guns: one synthesised report per calibre class (rifle crack, .50 thump,
//    cannon boom), fired at the real rate of fire; Gatling guns as a continuous growl
//  - distance: sounds arrive late (speed of sound), quieter and duller
//  - Doppler fly-bys of nearby aircraft, wind rising with airspeed
// ============================================================================
const Sound = (() => {
  let ctx = null, master = null, sfx = null, noise = null, vol = 0.7;
  const L = { pos: new THREE.Vector3(), ok: false }, SPEED = 343;
  const B = {}; // generated sample buffers
  // ---- recordings: loaded once audio starts (each file is a small script, so it works from file:// pages too)
  const REC = {}, REC_KEYS = ['merlin', 'radial', 'propcruise', 'draken', 'spitfire', 'shot3006', 'shot3006far', 'shot762r', 'shotarisaka', 'cannon', 'expl1', 'expl2', 'expl3'];
  function loadRecordings() {
    for (const k of REC_KEYS) {
      const decode = () => { const sm = window.SKY_SAMPLES && window.SKY_SAMPLES[k]; if (!sm || !ctx) return; const bin = Uint8Array.from(atob(sm.b64), c => c.charCodeAt(0));
        ctx.decodeAudioData(bin.buffer).then(b => { REC[k] = b; delete window.SKY_SAMPLES[k]; if (eng && !eng.rec) attachRec(eng); }).catch(() => {}); };
      if (window.SKY_SAMPLES && window.SKY_SAMPLES[k]) { decode(); continue; }
      const sc = document.createElement('script'); sc.src = 'assets/sounds/' + k + '.js'; sc.onload = decode; document.head.appendChild(sc);
    }
  }
  // a piece of a recording: [start, end] in seconds
  const SEG = { merlin: [1, 11.5], radial: [4.6, 9.4], propcruise: [0.05, 5.95], draken: [40, 46.5], dpass: [12.6, 16.6], spass: [9, 14.5] };
  function playRec(key, gain, at, rate, filterHz, seg) {
    const b = REC[key]; if (!b) return null; const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1;
    const g = ctx.createGain(); g.gain.value = gain;
    if (filterHz) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz; s.connect(f); f.connect(g); } else s.connect(g);
    g.connect(sfx); if (seg) s.start(at || now(), seg[0], seg[1] - seg[0]); else s.start(at || now()); return s;
  }
  function init() {
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = vol;
    // gentle compression keeps big explosions from clipping
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    build(); loadRecordings();
  }
  function setVolume(v) { vol = v; if (master) master.gain.value = v; }
  function resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
  const now = () => ctx.currentTime;
  // ---- sample synthesis -----------------------------------------------------
  function synth(sec, fn) { const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); fn(d, ctx.sampleRate); let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i])); if (m > 0) for (let i = 0; i < n; i++) d[i] /= m; return b; }
  // one-pole low-pass in place
  const lp = (d, sr, f) => { const a = Math.exp(-2 * Math.PI * f / sr); let y = 0; for (let i = 0; i < d.length; i++) { y = d[i] * (1 - a) + y * a; d[i] = y; } };
  const hp = (d, sr, f) => { const a = Math.exp(-2 * Math.PI * f / sr); let y = 0, x0 = 0; for (let i = 0; i < d.length; i++) { const x = d[i]; y = a * (y + x - x0); x0 = x; d[i] = y; } };
  function gunshot(body, bodyHz, crack, len, far) {
    return synth(len, (d, sr) => {
      const n = d.length;
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-t / (len * 0.18)); }
      hp(d, sr, crack); // muzzle blast is broadband: keep the crack
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] = d[i] * 0.8 + Math.sin(2 * Math.PI * bodyHz * t * (1 - t * 2)) * Math.exp(-t / (len * 0.35)) * body; }
      if (far) { lp(d, sr, 900); lp(d, sr, 900); }
    });
  }
  function build() {
    // [near, far] variants
    B.rifle = [gunshot(0.35, 140, 1800, 0.08), gunshot(0.4, 140, 1800, 0.08, true)];
    B.hmg = [gunshot(0.7, 95, 900, 0.13), gunshot(0.8, 95, 900, 0.13, true)];
    B.cannon = [gunshot(1.0, 62, 500, 0.24), gunshot(1.0, 62, 500, 0.24, true)];
    B.heavy = [gunshot(1.0, 45, 300, 0.35), gunshot(1.0, 45, 300, 0.35, true)];
    // explosions: a pressure "thump" (falling sine) under a long rumbling noise tail
    const blast = (len, far) => synth(len, (d, sr) => {
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * (Math.exp(-t / (len * 0.22)) * 0.9 + Math.exp(-t / (len * 0.6)) * 0.25); }
      lp(d, sr, far ? 350 : 1400); if (!far) lp(d, sr, 2500);
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] += Math.sin(2 * Math.PI * (55 - 25 * t / len) * t) * Math.exp(-t / (len * 0.25)) * 1.4; }
    });
    B.boom = [blast(2.4), blast(3.2, true)];
    B.flak = [synth(1.4, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * (t < 0.01 ? 1 : Math.exp(-t / 0.35) * 0.6); } lp(d, sr, 1800); })];
    // hits on our own airframe: a hollow metallic knock with a ring
    B.hit = synth(0.25, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = ((Math.random() * 2 - 1) * Math.exp(-t / 0.012) + Math.sin(2 * Math.PI * 1300 * t) * Math.exp(-t / 0.05) * 0.5 + Math.sin(2 * Math.PI * 210 * t) * Math.exp(-t / 0.06)); } });
    B.whoosh = synth(1.6, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.min(1, t * 30) * Math.exp(-t / 0.7); } lp(d, sr, 2200); hp(d, sr, 250); });
    B.clunk = synth(0.3, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 120 * t) * Math.exp(-t / 0.05) + (Math.random() * 2 - 1) * Math.exp(-t / 0.01) * 0.4; } });
  }
  function play(buf, gain, at, rate, filterHz) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate || 1;
    const g = ctx.createGain(); g.gain.value = gain;
    if (filterHz) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz; s.connect(f); f.connect(g); } else s.connect(g);
    g.connect(sfx); s.start(at || now()); return s;
  }
  // distance model: inverse distance, air absorbs the highs, sound travels at 343 m/s
  function spatial(pos, ref) {
    if (!pos || !L.ok) return { d: 0, gain: 1, delay: 0, far: false };
    const d = L.pos.distanceTo(pos), r = ref || 40;
    return { d, gain: r / Math.max(r, d), delay: d / SPEED, far: d > 600 };
  }
  function setListener(p) { L.pos.copy(p); L.ok = true; }

  // ---- guns -----------------------------------------------------------------
  const gunState = new Map();
  const gunId = g => { for (const k in GUNS) if (GUNS[k] === g) return k; return ''; };
  function gunClass(g) { return g.cal <= 8 ? 'rifle' : g.cal < 15 ? 'hmg' : g.cal < 27 ? 'cannon' : 'heavy'; }
  // called every frame a gun group is firing: shots are scheduled at the real cyclic rate
  function fire(key, gun, barrels, pos, mine) {
    if (!ctx) return;
    const sp = mine ? { d: 0, gain: 1, delay: 0, far: false } : spatial(pos, 60);
    if (sp.gain < 0.02) return;
    let st = gunState.get(key); const t = now();
    if (!st) { st = { next: t + sp.delay, last: t }; gunState.set(key, st); }
    st.last = t;
    const rate = gun.rpm / 60 * barrels;
    if (rate > 45) { gatling(key, gun, rate, sp, mine); return; }
    if (st.next < t + sp.delay) st.next = t + sp.delay;
    const cls = gunClass(gun), buf = B[cls][sp.far ? 1 : 0];
    const base = (mine ? 0.32 : 0.5) * { rifle: 0.55, hmg: 0.8, cannon: 1, heavy: 1.1 }[cls];
    // recorded report: rifle calibres use the real cartridge (.30-06 / 7.62x54R / Japanese 7.7 mm); heavier guns the same report
    // played slower (deeper) over the synthesised body, cannon the recorded cannon played fast and short
    const rec = sp.far ? 'shot3006far' : cls === 'rifle' ? (/shkas|pv1/.test(gunId(gun)) ? 'shot762r' : /type8|type9/.test(gunId(gun)) ? 'shotarisaka' : 'shot3006') : cls === 'hmg' ? 'shot3006' : 'cannon';
    const rr = { rifle: 1, hmg: 0.78, cannon: 2.1, heavy: 1.6 }[cls], rg = { rifle: 0.9, hmg: 0.8, cannon: 0.55, heavy: 0.7 }[cls] * (mine ? 0.55 : 0.8);
    while (st.next < t + sp.delay + 0.06) { const j = 0.94 + Math.random() * 0.12, v = sp.gain * (0.85 + Math.random() * 0.3);
      const hasRec = REC[rec]; play(buf, base * v * (hasRec ? 0.55 : 1), st.next, j); if (hasRec) playRec(rec, rg * v, st.next, rr * j, sp.far ? 1500 : 0, cls === 'cannon' || cls === 'heavy' ? [0, 0.6] : null); st.next += 1 / rate; }
  }
  // above ~2700 rounds a minute the reports merge into a continuous growl at the firing rate (M61, GSh, GAU-8)
  const growls = new Map();
  function gatling(key, gun, rate, sp, mine) {
    let gr = growls.get(key); const t = now();
    if (!gr) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = Math.min(rate, 140);
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const am = ctx.createGain(); am.gain.value = 0; o.connect(am.gain); // the shots chop the noise at the firing rate
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = gun.cal >= 27 ? 900 : 1600;
      const g = ctx.createGain(); g.gain.value = 0;
      n.connect(am); am.connect(f); f.connect(g); o.connect(g); g.connect(sfx); o.start(); n.start(0, Math.random() * 2);
      gr = { o, n, g, f }; growls.set(key, gr);
    }
    gr.until = t + 0.12;
    const want = (mine ? 0.35 : 0.5) * sp.gain;
    gr.g.gain.setTargetAtTime(want, t + sp.delay, 0.02);
    gr.f.frequency.value = sp.far ? 500 : (gun.cal >= 27 ? 900 : 1600);
  }
  function tickGuns() {
    const t = now();
    for (const [k, gr] of growls) if (t > gr.until) { gr.g.gain.setTargetAtTime(0, t, 0.03); if (t > gr.until + 0.5) { try { gr.o.stop(); gr.n.stop(); } catch (e) {} growls.delete(k); } }
    for (const [k, st] of gunState) if (t - st.last > 2) gunState.delete(k);
  }
  // ---- one-shots ------------------------------------------------------------
  function boom(size, pos) {
    if (!ctx) return; const sp = spatial(pos, 120 * Math.max(0.5, size)); if (sp.gain < 0.01) return;
    const g0 = Math.min(1.4, 0.9 * Math.sqrt(size)) * sp.gain, at = now() + sp.delay, key = size > 2.2 ? 'expl3' : Math.random() < 0.5 ? 'expl1' : 'expl2';
    if (REC[key]) { playRec(key, g0 * 1.2, at, 0.9 + 0.2 / Math.max(0.6, size) + Math.random() * 0.08, sp.far ? 500 : 0); play(B.boom[sp.far ? 1 : 0], g0 * 0.45, at, 0.85); } // the recording, with the synthesised pressure thump under it
    else play(B.boom[sp.far ? 1 : 0], g0, at, 0.85 + 0.3 / Math.max(0.6, size));
  }
  function flak(pos) { if (!ctx) return; const sp = spatial(pos, 150); if (sp.gain < 0.02) return; play(B.flak[0], 0.8 * sp.gain, now() + sp.delay, 0.9 + Math.random() * 0.2, sp.far ? 700 : 0); }
  function hit(heavy) { if (!ctx) return; play(B.hit, heavy ? 0.9 : 0.5, now(), heavy ? 0.7 : 0.9 + Math.random() * 0.3); }
  function launch(pos, kind) { if (!ctx) return; const sp = spatial(pos, 80); if (sp.gain < 0.02) return; play(B.whoosh, (kind === 'missile' ? 0.8 : 0.5) * sp.gain, now() + sp.delay, kind === 'missile' ? 0.8 : 1.2); }
  function clunk() { if (ctx) play(B.clunk, 0.6, now(), 0.9 + Math.random() * 0.2); }
  // ---- cockpit tones --------------------------------------------------------
  let tone = null;
  // IR seeker: a warbling growl while searching, a steady high tone when locked. A radar missile has no seeker tone of
  // its own: only a short steady tone once the radar has locked
  function lockTone(state, radar) {
    if (!ctx) return; if (radar && state === 1) state = 0;
    if (!tone) { const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(); o.type = 'triangle'; lfo.frequency.value = 22; lg.gain.value = 0; lfo.connect(lg); lg.connect(o.frequency); g.gain.value = 0; o.connect(g); g.connect(master); o.start(); lfo.start(); tone = { o, lg, g }; }
    const t = now();
    tone.o.frequency.setTargetAtTime(state === 2 ? 1400 : 760, t, 0.03); tone.lg.gain.setTargetAtTime(state === 1 ? 90 : 0, t, 0.03); tone.g.gain.setTargetAtTime(state ? 0.05 : 0, t, 0.02);
  }
  let warnT = 0;
  function warn(t) { if (!ctx || t - warnT < 0.25) return; warnT = t; const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 1050; o.type = 'square'; g.gain.setValueAtTime(0.045, now()); g.gain.setValueAtTime(0, now() + 0.12); o.connect(g); g.connect(master); o.start(); o.stop(now() + 0.14); }

  // ---- the player's engine, wind and buffet --------------------------------
  const ROTARY = ['camel', 'dr1', 'n17', 'n17ru', 'n24ko3', 'n28'];
  const RADIAL = ['f6f5', 'p12', 'p26', 'p47d', 'f4u1d', 'fw190a', 'la5fn', 'a6m2', 'ki43', 'ki84', 'n1k2', 'i15', 'i16', 'gladiator', 'ki27', 'ki10', 'b17g', 'b29', 'b5n', 'sbd', 'b25j', 'a1h', 'd3a', 'g4m', 'tu2', 'ki21', 'b10', 'ms406', 'il2', 'yak3'];
  function engineKind(def) { if (def.kind === 'jet') return 'jet'; if (ROTARY.includes(def.id)) return 'rotary'; if (RADIAL.includes(def.id) && def.id !== 'il2' && def.id !== 'yak3' && def.id !== 'ms406') return 'radial'; return 'inline'; }
  const ENG = { rotary: { cyl: 9, rpm: [700, 1250] }, inline: { cyl: 12, rpm: [900, 2700] }, radial: { cyl: 14, rpm: [900, 2500] } };
  let eng = null;
  function engineStart(def) {
    if (!ctx) return; engineStop();
    const kind = engineKind(def), out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    const nodes = [], e = { kind, out, nodes, def, n: def.eng || 1, rpm: 0 };
    const src = () => { const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true; n.start(0, Math.random() * 2.5); nodes.push(n); return n; };
    // wind: always there, rises with airspeed
    const wn = src(), wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 0.6; const wg = ctx.createGain(); wg.gain.value = 0; wn.connect(wf); wf.connect(wg); wg.connect(master); e.wind = { f: wf, g: wg };
    // stall buffet: low noise beaten at ~10 Hz
    const bn = src(), bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 90; const bam = ctx.createGain(); bam.gain.value = 0; const blfo = ctx.createOscillator(); blfo.frequency.value = 9; blfo.connect(bam.gain); blfo.start(); nodes.push(blfo);
    const bg = ctx.createGain(); bg.gain.value = 0; bn.connect(bf); bf.connect(bam); bam.connect(bg); bg.connect(master); e.buffet = bg;
    if (kind === 'jet') {
      const rn = src(), rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 500; const rg = ctx.createGain(); rn.connect(rf); rf.connect(rg); rg.connect(out);
      const hn = src(), hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 1800; hf.Q.value = 1.2; const hg = ctx.createGain(); hn.connect(hf); hf.connect(hg); hg.connect(out);
      const w1 = ctx.createOscillator(), w2 = ctx.createOscillator(), wgain = ctx.createGain(); w1.type = 'sine'; w2.type = 'sine'; w1.connect(wgain); w2.connect(wgain); wgain.connect(out); w1.start(); w2.start(); nodes.push(w1, w2);
      const an = src(), af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 160; const ag = ctx.createGain(); ag.gain.value = 0; an.connect(af); af.connect(ag); ag.connect(out);
      Object.assign(e, { rf, rg, hf, hg, w1, w2, wgain, ag });
    } else {
      // exhaust pulses: a sawtooth train at the firing frequency per engine, slightly detuned between engines (the "beat" of twins and four-engined bombers)
      const spec = ENG[kind], lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.Q.value = 0.9; lpf.connect(out);
      e.osc = []; for (let i = 0; i < Math.min(4, e.n); i++) {
        const o = ctx.createOscillator(), half = ctx.createOscillator(), og = ctx.createGain(), hg = ctx.createGain(); o.type = 'sawtooth'; half.type = 'square';
        og.gain.value = 0.5 / Math.sqrt(e.n); hg.gain.value = kind === 'rotary' ? 0.35 : 0.18; o.connect(og); half.connect(hg); og.connect(lpf); hg.connect(lpf); o.start(); half.start(); nodes.push(o, half);
        e.osc.push({ o, half, detune: 1 + (i - (e.n - 1) / 2) * 0.012 });
      }
      // uneven combustion: random amplitude wobble
      const rough = src(), rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = kind === 'rotary' ? 25 : 14; const rg = ctx.createGain(); rg.gain.value = kind === 'radial' ? 0.35 : kind === 'rotary' ? 0.5 : 0.18;
      rough.connect(rf); rf.connect(rg); rg.connect(out.gain);
      // propeller wash: noise chopped at the blade-passing frequency
      const pn = src(), pf = ctx.createBiquadFilter(); pf.type = 'bandpass'; pf.frequency.value = 350; pf.Q.value = 0.7; const pam = ctx.createGain(); pam.gain.value = 0.5; const plfo = ctx.createOscillator(); plfo.type = 'sine'; plfo.connect(pam.gain); plfo.start(); nodes.push(plfo);
      const pg = ctx.createGain(); pg.gain.value = 0; pn.connect(pf); pf.connect(pam); pam.connect(pg); pg.connect(out);
      Object.assign(e, { spec, lpf, plfo, pg });
    }
    eng = e; attachRec(e);
  }
  // p: the player's aircraft
  function engineSet(p) {
    if (!eng || !ctx) return; const e = eng, t = now(), alive = p.alive && !p.wreck;
    const thrMax = p.dm ? Math.max(...p.dm.fx.thrust) : 1, running = alive && p.fuel > 0 && thrMax > 0, thr = Math.min(1.1, p.ctl.throttle);
    const speed = p.speed || 0, sf = speed / p.perf.vmax;
    // wind and buffet
    e.wind.f.frequency.setTargetAtTime(300 + speed * 3, t, 0.1); e.wind.g.gain.setTargetAtTime(alive ? Math.min(0.25, 0.22 * sf * sf + 0.01) : 0, t, 0.1);
    e.buffet.gain.setTargetAtTime(alive && (p.stalled || (p.gLoad || 1) > p.perf.gMax * 0.85) ? 0.5 : 0, t, 0.08);
    // damaged engines cough
    const cough = running && thrMax < 0.7 && Math.random() < 0.05 ? 0.4 : 1;
    if (e.kind === 'jet') {
      // spool: idle ~60% N1, full ~100%
      e.rpm += ((running ? 0.6 + 0.4 * Math.min(1, thr) : 0) - e.rpm) * 0.04;
      const n1 = e.rpm;
      e.rf.frequency.setTargetAtTime(250 + n1 * 600, t, 0.1); e.rg.gain.setTargetAtTime(0.25 * n1 * n1, t, 0.1);
      e.hg.gain.setTargetAtTime(0.08 * n1, t, 0.1); e.hf.frequency.setTargetAtTime(1200 + n1 * 1500, t, 0.1);
      e.w1.frequency.setTargetAtTime(1800 + n1 * 3200, t, 0.1); e.w2.frequency.setTargetAtTime((1800 + n1 * 3200) * 1.52, t, 0.1); e.wgain.gain.setTargetAtTime(0.012 * n1, t, 0.1);
      e.ag.gain.setTargetAtTime(p.afterburner && running ? 0.55 : 0, t, 0.15);
      e.out.gain.setTargetAtTime(running || n1 > 0.05 ? 0.9 * cough : 0, t, 0.08);
      if (e.rec && e.rec.main) { e.rec.main.s.playbackRate.setTargetAtTime(0.62 + 0.45 * n1 + (p.afterburner ? 0.05 : 0), t, 0.15); e.rec.main.g.gain.setTargetAtTime((0.5 + 5.5 * n1 * n1) * (p.afterburner ? 1.6 : 1), t, 0.15); }
    } else {
      const s = e.spec, target = running ? s.rpm[0] + (s.rpm[1] - s.rpm[0]) * Math.min(1, thr * 0.85 + sf * 0.2) * (thr > 1 ? 1.05 : 1) : 0;
      e.rpm += (target - e.rpm) * 0.05;
      const fire = e.rpm / 60 * s.cyl / 2; // firing frequency
      for (const o of e.osc) { o.o.frequency.setTargetAtTime(Math.max(5, fire * o.detune), t, 0.05); o.half.frequency.setTargetAtTime(Math.max(3, fire * 0.5 * o.detune), t, 0.05); }
      e.lpf.frequency.setTargetAtTime(400 + Math.min(1, thr) * 1600, t, 0.08);
      const blades = e.def.era >= 3 ? 3.5 : 2; e.plfo.frequency.setTargetAtTime(Math.max(1, e.rpm / 60 * 0.5 * blades), t, 0.05);
      e.pg.gain.setTargetAtTime(running ? 0.1 + 0.15 * sf : 0, t, 0.1);
      e.out.gain.setTargetAtTime(e.rpm > 50 ? (0.16 + 0.14 * Math.min(1, thr)) * cough : 0, t, 0.06);
      if (e.rec && e.rec.main) { const rr = Math.max(0.55, Math.min(1.35, e.rpm / s.rpm[1] * (e.kind === 'rotary' ? 1.25 : 1)));
        e.rec.main.s.playbackRate.setTargetAtTime(rr, t, 0.08); if (e.rec.cruise) { e.rec.cruise.s.playbackRate.setTargetAtTime(rr, t, 0.08); e.rec.cruise.g.gain.setTargetAtTime(0.3 + 0.9 * Math.min(1, thr), t, 0.1); } }
    }
  }
  // the recorded engine loop: Merlin for inline engines (with the propeller cruise recording), the radial recording for
  // radial and rotary engines, the Draken for jets; the synthesis stays underneath for the engine-specific order and beat
  function attachRec(e) {
    const key = e.kind === 'jet' ? 'draken' : e.kind === 'inline' ? 'merlin' : 'radial'; if (!REC[key]) return;
    const loop = (k, gain) => { const b = REC[k]; if (!b) return null; const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.loop = true; s.loopStart = SEG[k][0]; s.loopEnd = SEG[k][1];
      g.gain.value = gain; s.connect(g); g.connect(e.out); s.start(0, SEG[k][0] + Math.random() * (SEG[k][1] - SEG[k][0])); e.nodes.push(s); return { s, g }; };
    e.rec = { main: loop(key, e.kind === 'jet' ? 6 : 2.2), cruise: e.kind === 'jet' ? null : loop('propcruise', 0.9) };
    if (e.kind !== 'jet' && e.osc) for (const o of e.osc) o.o.disconnect(), o.half.disconnect(); // the recording carries the exhaust note now
  }
  function engineStop() { if (!eng) return; for (const n of eng.nodes) try { n.stop(); } catch (e) {} try { eng.out.disconnect(); eng.wind.g.disconnect(); eng.buffet.disconnect(); } catch (e) {} eng = null; }

  // ---- fly-bys: the nearest few other aircraft get a simple engine voice with Doppler shift
  const voices = [];
  function flyby(crafts, me) {
    if (!ctx || !L.ok) return;
    const near = crafts.filter(c => c !== me && c.alive && !c.wreck && c.pos.distanceTo(L.pos) < 900).sort((a, b) => a.pos.distanceTo(L.pos) - b.pos.distanceTo(L.pos)).slice(0, 3);
    while (voices.length < 3) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = ctx.createGain(); g.gain.value = 0; const ng = ctx.createGain(); ng.gain.value = 0.6;
      o.connect(f); n.connect(ng); ng.connect(f); f.connect(g); g.connect(sfx); o.start(); n.start(0, Math.random() * 2);
      voices.push({ o, f, g, ng, c: null });
    }
    const t = now();
    for (const c of near) { const rel = c.pos.clone().sub(L.pos), d = rel.length(), closing = -c.vel.dot(rel) / Math.max(1, d);
      if (d < 220 && closing > 40 && (!c._passT || t - c._passT > 6)) { c._passT = t; const jet = c.def.kind === 'jet', sp = spatial(c.pos, 120);
        playRec(jet ? 'draken' : 'spitfire', (jet ? 1.6 : 1.4) * sp.gain, t, 0.9 + Math.random() * 0.15, 0, SEG[jet ? 'dpass' : 'spass']); } }
    voices.forEach((v, i) => {
      const c = near[i];
      if (!c) { v.g.gain.setTargetAtTime(0, t, 0.2); return; }
      const rel = c.pos.clone().sub(L.pos), d = rel.length(), dir = rel.divideScalar(Math.max(d, 1));
      const vr = c.vel.dot(dir); // + = moving away
      const doppler = SPEED / (SPEED + Math.max(-300, Math.min(300, vr)));
      const jet = c.def.kind === 'jet';
      v.o.frequency.setTargetAtTime((jet ? 70 : (ENG[engineKind(c.def)] || ENG.inline).cyl * 2400 / 120) * doppler * (0.7 + 0.3 * c.ctl.throttle), t, 0.05);
      v.ng.gain.value = jet ? 1.5 : 0.4; v.f.frequency.setTargetAtTime((jet ? 1400 : 900) * doppler, t, 0.05);
      v.g.gain.setTargetAtTime(0.25 * Math.min(1, 60 / Math.max(60, d)) * (c.def.mass > 10000 ? 1.4 : 1), t, 0.08);
    });
  }
  // ---- voice warnings, spoken by the browser's speech synthesiser in the aircraft's language
  const PHRASES = {
    en: { pullup: 'Pull up. Pull up.', missile: 'Missile. Missile.', stall: 'Warning. Angle of attack.', fire: 'Engine fire. Engine fire.', fuel: 'Bingo. Bingo.', altitude: 'Altitude. Altitude.', gear: 'Landing gear.' },
    ru: { pullup: 'Опасная высота!', missile: 'Ракета!', stall: 'Критический режим!', fire: 'Пожар двигателя!', fuel: 'Аварийный остаток топлива!', altitude: 'Высота!', gear: 'Выпусти шасси!' },
    fr: { pullup: 'Ressource! Ressource!', missile: 'Missile! Missile!', stall: 'Décrochage!', fire: 'Feu moteur!', fuel: 'Pétrole!', altitude: 'Altitude! Altitude!', gear: 'Train!' },
  };
  const voiceLast = {}; let ttsVoices = [];
  function voice(lang, key, t) {
    if (!lang || !window.speechSynthesis || (voiceLast[key] && t - voiceLast[key] < 3.5)) return;
    voiceLast[key] = t; const ph = (PHRASES[lang.slice(0, 2)] || PHRASES.en)[key]; if (!ph) return;
    if (!ttsVoices.length) ttsVoices = speechSynthesis.getVoices();
    const u = new SpeechSynthesisUtterance(ph); u.lang = lang; u.rate = 1.1; u.pitch = 1.05; u.volume = Math.min(1, vol * 1.3);
    const v = ttsVoices.find(x => x.lang === lang && /female|zira|hazel|susan|irina|hortense|samantha|google/i.test(x.name)) || ttsVoices.find(x => x.lang === lang) || ttsVoices.find(x => x.lang.startsWith(lang.slice(0, 2)));
    if (v) u.voice = v; speechSynthesis.speak(u);
  }
  function stopAll() { if (window.speechSynthesis) speechSynthesis.cancel(); engineStop(); for (const v of voices) v.g.gain.value = 0; for (const [, gr] of growls) gr.g.gain.value = 0; lockTone(0); }
  function tick() { if (ctx) tickGuns(); }
  return { init, resume, setVolume, setListener, fire, boom, flak, hit, launch, clunk, lockTone, warn, voice, recordings: () => Object.keys(REC), engineInfo: () => eng && { kind: eng.kind, recorded: !!(eng.rec && eng.rec.main), rate: eng.rec && eng.rec.main ? +eng.rec.main.s.playbackRate.value.toFixed(2) : null }, engineStart, engineSet, engineStop, flyby, stopAll, tick, gunClass };
})();
