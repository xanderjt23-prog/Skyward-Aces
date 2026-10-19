// ============================================================================
// Flight model. Local axes: +X right wing, +Y up, -Z nose. The stick commands
// body rates (like a fly-by-wire / well-trimmed aircraft) limited by control
// authority, available lift and the structural G limit; lift, induced and
// parasitic drag, thrust and gravity then move the aircraft. Pulling past the
// critical angle of attack stalls the wing. Damage feeds in through craft.fx.
// ============================================================================
const Flight = (() => {
  const G = 9.81, V3 = THREE.Vector3, Q = THREE.Quaternion;
  const STALL_FRAC = [0, 0.38, 0.3, 0.24, 0.2, 0.15, 0.12, 0.11];
  // performance constants derived from the database figures
  //  - thrust (as an acceleration) gives the listed climb rate at sea level
  //  - drag is set so the listed top speed is reached at the altitude the type was fastest at:
  //    low for WW1 / interwar types and subsonic jets, ~5 km for WW2 fighters, ~10 km with afterburner
  const SONIC = 330;
  const TVC = ['f22a', 'su35s', 'su57']; // thrust-vectoring nozzles
  // flap settings 0 up / 1 combat / 2 take-off / 3 landing: stall speed factor, drag factor, max speed (fraction of vmax)
  const FLAP_VS = [1, 0.92, 0.85, 0.77], FLAP_DRAG = [1, 1.05, 1.16, 1.4], FLAP_VFE = [9, 0.72, 0.58, 0.45];
  // effective stall speed with flaps (automatic manoeuvre flaps act like combat flaps when slow)
  const vsOf = c => c.perf.vs * (c.flaps ? FLAP_VS[c.flaps] : c.def && c.def.flaps === 'auto' && (c.speed || 0) < c.perf.vmax * 0.55 ? 0.93 : 1);
  const PROP_FV = r => 0.65 + 1.6 * Math.pow(Math.max(0, 1 - r), 2); // propeller thrust vs speed (fraction of vmax): ~2.3x cruise thrust when static
  const wave = M => 1 + 4.5 * Math.min(0.32, Math.max(0, M - 0.9)); // transonic drag rise
  function engine(P, v, rho, throttle) {
    const M = v / SONIC;
    if (!P.jet) {
      // piston engines hold power up to the supercharger's critical altitude, then fade quickly
      const r = v / P.vmax, fv = PROP_FV(r), rc = P.rhoCrit;
      const alt = rho >= rc ? Math.pow(rho, 0.45) : Math.pow(rc, 0.45) * Math.pow(rho / rc, 1.6);
      return P.a0 * fv * (throttle > 1 ? 1 + (throttle - 1) : throttle * 0.94) * alt;
    }
    const dry = P.a0dry * (1 + 0.1 * M) * Math.pow(rho, 0.75);
    if (P.ab && throttle > 1.01) return P.a0dry * 1.5 * (1 + 0.55 * M) * Math.pow(rho, 0.75);
    return dry * Math.min(1, throttle);
  }
  function perf(def, mods, massKg) {
    const vmax = def.spd / 3.6, m = massKg || def.mass;
    const massRatio = m / def.mass;
    const vs = vmax * STALL_FRAC[def.era] * Math.sqrt(massRatio) * (def.aoa >= 30 ? 0.85 : 1);
    const jet = def.kind === 'jet';
    const engMul = mods && mods.engine ? 1.07 : 1;
    const P = { vmax, vs, jet, ab: def.ab, mass: m, era: def.era, rhoCrit: [1, 0.8, 0.68, 0.52, 0.52, 0.52, 0.52, 0.52][def.era] };
    if (!jet) {
      const fv = PROP_FV, rc = 0.55;
      P.a0 = Math.min(0.9 * G, def.clb * G / (vmax * rc * (fv(rc) - fv(1) * rc * rc)));
    } else {
      // climb is quoted with afterburner where fitted (thrust at ~Mach 0.5)
      const vc = Math.min(vmax * 0.6, 260), Mc = vc / SONIC;
      const need = Math.min(1.45 * G, def.clb * G / vc + (def.ab ? 0.35 : 0.2) * G);
      P.a0dry = need / (def.ab ? 1.5 * (1 + 0.55 * Mc) : (1 + 0.1 * Mc));
      P.a0 = need;
    }
    const rhoC = jet ? (def.ab ? 0.33 : 0.8) : [1, 0.85, 0.72, 0.57, 0.57, 0.57, 0.57, 0.57][def.era];
    const thrMax = engine(P, vmax, rhoC, def.ab ? 1.1 : 1.1);
    P.kd = thrMax / (vmax * vmax * rhoC * (jet ? wave(vmax / SONIC) : 1));
    P.a0 = (P.a0 || 0) * engMul / massRatio; if (P.a0dry) P.a0dry = P.a0dry * engMul / massRatio;
    P.gMax = def.g + (mods && mods.airframe ? 0.6 : 0);
    P.wInst = (2 * Math.PI / def.turn) * 1.55;
    P.vc = Math.max(vs * Math.sqrt(P.gMax), 1);
    P.cI = 1.5 * (jet ? P.a0dry * 1.2 : P.a0) / (P.gMax * G * P.gMax * G);
    P.roll = def.roll * Math.PI / 180; P.aoa = def.aoa * Math.PI / 180;
    P.tvc = TVC.includes(def.id); P.superman = P.tvc || def.aoa >= 40;
    P.wPost = P.tvc ? 1.7 : 1.1; // pitch rate the nose can be hauled through post-stall (manual override only)
    // G tolerance of the pilot: no G-suit before the jet age, G-suits and straining technique after
    P.gTol = [0, 4.5, 4.8, 5.0, 5.5, 6.0, 7.0, 7.5][def.era];
    return P;
  }
  const _q = new Q(), _v = new V3(), _w = new V3(), up = new V3(), fwd = new V3(), right = new V3(), vhat = new V3(), acc = new V3(), tmp = new V3();
  function axes(c) { fwd.set(0, 0, -1).applyQuaternion(c.quat); up.set(0, 1, 0).applyQuaternion(c.quat); right.set(1, 0, 0).applyQuaternion(c.quat); }

  // rates (rad/s) that a full stick deflection gives right now: pitch (pull), roll, yaw
  function limits(c) {
    const P = c.perf, v = Math.max(c.speed || 0, 1), rho = Math.exp(-Math.max(0, c.pos.y) / 9000), vs = vsOf(c), qn = (v / vs) * (v / vs) * rho;
    const lowSpeed = Math.min(1, Math.max(0.25, (v / P.vs - 0.5)));
    const compress = P.jet ? 1 : Math.max(0.55, 1 - Math.max(0, v / P.vmax - 1.0) * 2);
    return { q: Math.min(P.wInst, G * P.gMax / Math.max(v, 20), G * Math.max(qn, 0.3) / Math.max(v, 20) * 1.15) * compress, p: P.roll * lowSpeed * compress, r: P.wInst * 0.22 * lowSpeed, qn };
  }
  // one integration step. c: { pos, vel, quat, rates(V3 local p/q/r smoothed), ctl{pitch,roll,yaw,throttle}, perf, fx, gearDown }
  function step(c, dt) {
    const P = c.perf, fx = c.fx, ctl = c.ctl;
    // never let a bad input poison the state
    for (const k of ['pitch', 'roll', 'yaw']) if (!(ctl[k] === ctl[k])) ctl[k] = 0;
    if (!(ctl.throttle === ctl.throttle)) ctl.throttle = 1;
    if (!(c.rates.x === c.rates.x && c.rates.y === c.rates.y && c.rates.z === c.rates.z)) c.rates.set(0, 0, 0);
    const v = c.vel.length(), rho = Math.exp(-Math.max(0, c.pos.y) / 9000);
    axes(c);
    vhat.copy(c.vel).multiplyScalar(1 / Math.max(v, 0.1));
    // local velocity -> angle of attack and sideslip
    _v.copy(c.vel).applyQuaternion(_q.copy(c.quat).invert());
    // (standing still on the runway there is no airflow to speak of)
    const alpha = v < 4 ? 0 : Math.atan2(-_v.y, -_v.z), beta = v < 4 ? 0 : Math.atan2(_v.x, -_v.z);
    c.alpha = alpha; c.beta = beta; c.speed = v;
    const vsE = vsOf(c), qn = (v / vsE) * (v / vsE) * rho; // lift available at max AoA, in g (flaps raise it)
    const ctrlOk = fx.ctrl > 0, auth = ctrlOk ? 1 : 0;
    // ---- commanded rates
    const lim = Math.min(P.wInst, G * P.gMax / Math.max(v, 20), G * Math.max(qn, 0.3) / Math.max(v, 20) * 1.15);
    const lowSpeed = Math.min(1, Math.max(0.25, (v / P.vs - 0.5)));
    const compress = P.jet ? 1 : Math.max(0.55, 1 - Math.max(0, v / P.vmax - 1.0) * 2); // control forces stiffen in very fast dives
    let pc = ctl.pitch * auth * fx.elev, rc = ctl.roll * auth * fx.ail, yc = ctl.yaw * auth * fx.rud;
    if (!ctrlOk) { pc = fx.drift[0]; rc = fx.drift[1]; yc = 0; }
    let tp = pc * (pc > 0 ? lim : lim * 0.5) * compress;
    if (ctl.manual && P.superman && pc > 0.6) tp = Math.max(tp, pc * P.wPost * (P.tvc ? Math.max(0.4, Math.min(1, ctl.throttle)) : Math.min(1, v / (P.vs * 2.2))));
    const tr = rc * P.roll * lowSpeed * compress * Math.min(fx.ailL, fx.ailR) / Math.max(0.35, (fx.ailL + fx.ailR) / 2);
    const ty = yc * P.wInst * 0.22 * lowSpeed;
    const k = 1 - Math.exp(-dt * 6);
    c.rates.x += (tp - c.rates.x) * k; c.rates.z += (tr - c.rates.z) * k; c.rates.y += (ty - c.rates.y) * k;
    // stability: the nose weathervanes into the airflow, a stalled wing drops the nose, asymmetric lift rolls
    let pr = c.rates.x, rr = c.rates.z, yr = c.rates.y;
    const stalled = Math.abs(alpha) > P.aoa;
    c.stalled = stalled && v > 5;
    if (stalled) pr -= Math.sign(alpha) * (Math.abs(alpha) - P.aoa) * (P.tvc ? (ctl.manual ? 0.15 : 1.2) : P.superman ? (ctl.manual ? 0.4 : 1.6) : 2.2);
    pr -= Math.sin(alpha) * 0.3 * Math.min(1.5, v / P.vs) * fx.stab * (ctl.manual && P.superman ? 0.3 : 1);
    yr += Math.sin(beta) * 1.6 * Math.min(1.5, v / P.vs) * fx.finStab;
    const liftAsym = (fx.liftL - fx.liftR) * Math.min(2.5, qn * 0.6);
    rr -= liftAsym * 1.6; // weaker left wing -> rolls left
    if (fx.spin) { rr += fx.spin * 2.5; pr -= 0.3; }
    // integrate orientation in the body frame
    _w.set(pr, -yr, -rr).multiplyScalar(dt);
    const ang = _w.length();
    if (ang > 1e-6) { _q.setFromAxisAngle(_w.divideScalar(ang), ang); c.quat.multiply(_q).normalize(); }
    axes(c);
    // ---- forces (as accelerations)
    acc.set(0, -G, 0);
    // thrust
    let thr = 0; const n = fx.thrust.length;
    for (let i = 0; i < n; i++) thr += fx.thrust[i]; thr /= Math.max(1, n);
    let throttle = c.fuel > 0 ? ctl.throttle : 0;
    c.afterburner = P.ab && throttle > 1.01 && thr > 0;
    const thrust = engine(P, v, rho, throttle) * thr;
    acc.addScaledVector(fwd, thrust);
    // lift: grows linearly with AoA up to the critical angle, drops sharply past it
    const aAbs = Math.abs(alpha);
    const cl = aAbs < P.aoa ? alpha / P.aoa : Math.sign(alpha) * Math.max(Math.abs(Math.sin(2 * alpha)) * 0.65, 1 - (aAbs - P.aoa) * 2.5);
    const wingLift = (fx.liftL + fx.liftR) / 2;
    let L = cl * qn * G * wingLift;
    const Lmax = P.gMax * G * 1.5; if (Math.abs(L) > Lmax) L = Math.sign(L) * Lmax;
    tmp.copy(up).addScaledVector(vhat, -up.dot(vhat)); if (tmp.lengthSq() > 1e-6) tmp.normalize();
    acc.addScaledVector(tmp, L);
    // side force from sideslip
    tmp.copy(right).addScaledVector(vhat, -right.dot(vhat)); if (tmp.lengthSq() > 1e-6) tmp.normalize();
    acc.addScaledVector(tmp, -Math.sin(beta) * qn * G * 0.4);
    // drag: parasitic + induced (lift-dependent) + airbrake from damage / gear
    const ind = P.cI * L * L * Math.min(3, (P.vc * P.vc) / Math.max(v * v, 1)) / Math.max(rho, 0.2);
    const drag = P.kd * v * v * rho * fx.dragMul * (P.jet ? wave(v / SONIC) : 1) * (c.gearDown ? 1.35 : 1) * (c.flaps ? FLAP_DRAG[c.flaps] : 1) * (c.airbrakeOut ? (P.jet ? 1.9 : 2.4) : 1) + ind + G * qn * 0.85 * Math.max(0, Math.sin(aAbs) ** 2 - Math.sin(Math.min(P.aoa * 0.8, 0.35)) ** 2);
    acc.addScaledVector(vhat, -Math.min(drag, v / dt * 0.5 + 50));
    c.vel.addScaledVector(acc, dt);
    c.pos.addScaledVector(c.vel, dt);
    c.gLoad = L / G + thrust / G * Math.sin(alpha);
    // fuel burn
    if (c.fuel > 0) c.fuel = Math.max(0, c.fuel - dt * throttle * (c.afterburner ? 3 : 1) / c.endurance - (fx.leak || 0) * dt);
  }

  // ---- autopilot ("instructor"): point the nose along a world direction. Returns {pitch, roll, yaw}.
  // Works in turn rates with damped gains (time constant ~0.35 s), so it settles without wobbling:
  //  - gentle (aim within ~7 deg): bank towards the heading error, pull / push the nose onto the aim, rudder for the last degrees
  //  - roll-and-pull (aim further off): roll the aim over the canopy and pull
  // It holds the angle of attack below the stall and backs off the pull when the pilot is greying out.
  const loc = new V3(), wdir = new V3(), hf = new V3(), ht = new V3();
  function steer(c, dir, out, opt) {
    out = out || {}; opt = opt || {};
    const P = c.perf, lim = limits(c);
    wdir.copy(dir).normalize();
    loc.copy(wdir).applyQuaternion(_q.copy(c.quat).invert());
    const off = Math.acos(Math.max(-1, Math.min(1, -loc.z)));
    axes(c);
    const phi = Math.atan2(-right.y, up.y); // current bank, >0 = right wing down
    const pv = Math.atan2(loc.y, -loc.z), hv = Math.atan2(loc.x, -loc.z);
    const near = Math.max(0, Math.min(1, 1 - (off - 0.02) / 0.08));
    let gRoll = 0, gPitch = 0;
    // feed-forward: how fast the aim itself is swinging (a turning target), in body axes
    let ffq = 0, ffr = 0; const now = c.match ? c.match.time : 0;
    if (c._aimPrev && now > c._aimT && now - c._aimT < 0.2) {
      const wv = new V3().crossVectors(c._aimPrev, wdir).divideScalar(now - c._aimT);
      if (wv.length() < 2.5) { wv.applyQuaternion(_q.copy(c.quat).invert()); ffq = wv.x; ffr = -wv.y; }
    }
    if (!c._aimPrev) c._aimPrev = new V3(); if (now !== c._aimT) { c._aimPrev.copy(wdir); c._aimT = now; }
    hf.set(fwd.x, 0, fwd.z); ht.set(wdir.x, 0, wdir.z);
    const gentleOk = hf.lengthSq() > 0.02 && ht.lengthSq() > 0.02 && loc.z < 0;
    if (gentleOk) {
      hf.normalize(); ht.normalize();
      const psi = Math.atan2(hf.x * ht.z - hf.z * ht.x, hf.dot(ht)); // heading error, >0 = aim to the right
      // faster aircraft need more bank for the same correction
      const want = Math.max(-1.35, Math.min(1.35, psi * 4 * Math.max(1, Math.min(3, (c.speed || 0) / 150))));
      let dphi = want - phi; if (dphi > Math.PI) dphi -= 2 * Math.PI; if (dphi < -Math.PI) dphi += 2 * Math.PI;
      gRoll = Math.max(-1, Math.min(1, dphi * 2.6 / Math.max(lim.p, 0.3)));
      gPitch = Math.max(-0.5, Math.min(1, (pv * 2.8 + ffq) / Math.max(lim.q, 0.05)));
    }
    if (opt.pilot && gentleOk) {
      // the player's instructor flies like a pilot: the bank follows how far (and how fast) the aim is off to the side,
      // so a small correction is a shallow bank and only a big turn is flown on its side or rolled over
      const psi = Math.atan2(hf.x * ht.z - hf.z * ht.x, hf.dot(ht));
      const ev = Math.asin(Math.max(-1, Math.min(1, wdir.y))) - Math.asin(Math.max(-1, Math.min(1, fwd.y)));
      // coordinated-turn bank for an aim that keeps swinging sideways (a turning target): tan(bank) = V * rate / g
      let wh = 0; if (c._hdgPrev !== undefined && now > c._hdgT && now - c._hdgT < 0.2) { let d = Math.atan2(-wdir.x, -wdir.z) - c._hdgPrev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; wh = -d / (now - c._hdgT); }
      if (now !== c._hdgT) { c._hdgPrev = Math.atan2(-wdir.x, -wdir.z); c._hdgT = now; }
      // only an aim that keeps swinging the same way (a turning target, a long mouse sweep) earns this bank: a quick flick does not
      const dtA = Math.min(0.1, Math.max(0, now - (c._whT || now))); c._whT = now; wh = Math.max(-1, Math.min(1, wh));
      c._whF = (c._whF || 0) + (wh - (c._whF || 0)) * (1 - Math.exp(-dtA / 0.15));
      c._whS = (c._whS || 0) + (wh - (c._whS || 0)) * (1 - Math.exp(-dtA / 0.8));
      const swinging = Math.abs(c._whF) > 0.02 && Math.sign(c._whF) === Math.sign(c._whS);
      c._swT = swinging ? (c._swT || 0) + dtA : 0;
      const sus = Math.max(0, Math.min(1, (c._swT - 0.3) / 0.5));
      c._wh = swinging ? Math.sign(c._whF) * Math.min(Math.abs(c._whF), Math.abs(c._whS)) * sus : 0;
      const phiFF = Math.atan((c.speed || 0) * c._wh / 9.81);
      const k = 0.32 / Math.max(1, Math.min(2, (c.speed || 0) / 180));
      // while the aim is close, the nose sitting a little above it must not wind the bank up (pulling in a bank lifts the nose)
      const evMin = off < 0.3 ? -0.4 * k : off > 0.7 ? -9 : -0.4 * k - (off - 0.3) * 20;
      // aim below the nose: a pilot pushes the stick for a moderate dive (wings stay level, bank only for the sideways
      // part) and only rolls over and pulls for a very steep one (split-S); so the downward part of the error counts
      // towards the bank only beyond ~45 deg below
      // (applies when the aim is mostly below rather than mostly to the side, so ordinary turns are unchanged)
      const down = ev < 0 ? Math.max(0, Math.min(1, (-ev - Math.abs(psi) * 1.5) / 0.08)) : 0, over0 = Math.max(0, Math.min(1, (-ev - 0.72) / 0.14));
      // once committed to rolling over (split-S), stay with it until the nose is nearly on the aim - no flip back half way
      c._split = over0 >= 1 || (!!c._split && off > 0.25); const over = c._split ? 1 : over0;
      const push = down * (1 - over), evB = ev * (1 - push);
      let phiC = Math.atan2(psi, Math.max(evMin, evB) + k);
      phiC *= 1 - 0.6 * push * Math.min(1, -ev / 0.25); // pushing over: only a gentle bank for the sideways part
      if (Math.abs(phiC) > 2.8 && Math.abs(psi) < 0.05) phiC = Math.abs(phiC) * (Math.sign(phi) || 1); // straight down: roll whichever way is shorter
      const phiD = Math.max(-2.6, Math.min(2.6, phiC + phiFF * Math.max(0, Math.cos(phiC))));
      let dphi = phiD - phi; if (dphi > Math.PI) dphi -= 2 * Math.PI; if (dphi < -Math.PI) dphi += 2 * Math.PI;
      let roll = Math.max(-1, Math.min(1, dphi * 2.6 / Math.max(lim.p, 0.3)));
      // a firm forward push is fine for a pilot (about -1.5 to -2 G); beyond that the eyes red out
      let pitch = Math.max(c.gVision < -0.3 ? -0.4 : -0.75, Math.min(1, (pv * 2.8 + ffq) / Math.max(lim.q, 0.05)));
      if (pitch < 0 && off > 0.2 && Math.abs(dphi) > 0.5) pitch = Math.max(pitch, -0.1); // no negative G while still rolling into a big turn
      // chasing a turning target (the aim keeps sweeping and is well off the nose): roll the aim over the canopy and pull, as a pilot would
      const wb = sus * Math.max(0, Math.min(1, (off - 0.1) / 0.15));
      if (wb > 0) {
        const rollErr = Math.atan2(loc.x, loc.y);
        roll = roll * (1 - wb) + Math.max(-1, Math.min(1, rollErr * 2.6 / Math.max(lim.p, 0.3))) * wb;
        pitch = pitch * (1 - wb) + Math.min(1, off * 2.8 / Math.max(lim.q, 0.05) * Math.max(0.1, Math.cos(rollErr))) * wb;
      }
      let yaw = Math.max(-1, Math.min(1, (hv * 2.5 + ffr * 0.5) / Math.max(lim.r, 0.05))) * near;
      return finish(c, P, out, pitch, roll, yaw, off);
    }
    const rollErr = Math.atan2(loc.x, loc.y);
    const aRoll = Math.max(-1, Math.min(1, rollErr * 2.6 / Math.max(lim.p, 0.3)));
    let aPitch = Math.min(1, off * 2.8 / Math.max(lim.q, 0.05) * Math.max(0.1, Math.cos(rollErr)));
    if (Math.abs(rollErr) > 2.4 && off > 1.0 && opt.allowPush) aPitch = -0.4;
    // small corrections (< ~7 deg) stay gentle; anything bigger rolls the aim over the canopy and pulls, like a pilot would
    const w = gentleOk ? Math.max(0, Math.min(1, (off - 0.12) / 0.18)) : 1;
    let roll = gRoll * (1 - w) + aRoll * w, pitch = gPitch * (1 - w) + aPitch * w;
    if (opt.keepBank && w < 1) roll = roll * 0.5 + aRoll * 0.5;
    const yaw = Math.max(-1, Math.min(1, (hv * 2.5 + ffr * 0.5) / Math.max(lim.r, 0.05))) * near;
    return finish(c, P, out, pitch, roll, yaw, off);
  }
  function finish(c, P, out, pitch, roll, yaw, off) {
    // stall protection: keep the angle of attack just below critical (and below 26 deg on high-AoA jets)
    const aMax = Math.min(P.aoa * 0.96, 0.45);
    if (pitch > 0 && c.alpha > aMax * 0.85) pitch *= Math.max(0, Math.min(1, (aMax - c.alpha) / (aMax * 0.15)));
    // a pilot greying out eases off the stick
    if (pitch > 0 && c.gStress > 0.35) pitch *= Math.max(0.35, 1 - (c.gStress - 0.35) * 1.5);
    if (pitch > 0 && c.gVision > 0.6) pitch *= 0.75;
    out.pitch = Math.max(-1, Math.min(1, pitch)); out.roll = Math.max(-1, Math.min(1, roll)); out.yaw = yaw;
    out.off = off; out.manual = false; return out;
  }
  return { FLAP_VFE, perf, step, steer, limits, axes: c => { axes(c); return { fwd: fwd.clone(), up: up.clone(), right: right.clone() }; }, STALL_FRAC };
})();
