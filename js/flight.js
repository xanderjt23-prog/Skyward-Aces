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
  const wave = M => 1 + 4.5 * Math.min(0.32, Math.max(0, M - 0.9)); // transonic drag rise
  function engine(P, v, rho, throttle) {
    const M = v / SONIC;
    if (!P.jet) {
      // piston engines hold power up to the supercharger's critical altitude, then fade quickly
      const r = v / P.vmax, fv = Math.max(0.3, 1.25 - 0.45 * r), rc = P.rhoCrit;
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
      const fv = r => Math.max(0.3, 1.25 - 0.45 * r), rc = 0.55;
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
    return P;
  }
  const _q = new Q(), _v = new V3(), _w = new V3(), up = new V3(), fwd = new V3(), right = new V3(), vhat = new V3(), acc = new V3(), tmp = new V3();
  function axes(c) { fwd.set(0, 0, -1).applyQuaternion(c.quat); up.set(0, 1, 0).applyQuaternion(c.quat); right.set(1, 0, 0).applyQuaternion(c.quat); }

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
    const alpha = Math.atan2(-_v.y, -_v.z), beta = Math.atan2(_v.x, -_v.z);
    c.alpha = alpha; c.beta = beta; c.speed = v;
    const qn = (v / P.vs) * (v / P.vs) * rho; // lift available at max AoA, in g
    const ctrlOk = fx.ctrl > 0, auth = ctrlOk ? 1 : 0;
    // ---- commanded rates
    const lim = Math.min(P.wInst, G * P.gMax / Math.max(v, 20), G * Math.max(qn, 0.3) / Math.max(v, 20) * 1.15);
    const lowSpeed = Math.min(1, Math.max(0.25, (v / P.vs - 0.5)));
    const compress = P.jet ? 1 : Math.max(0.55, 1 - Math.max(0, v / P.vmax - 1.0) * 2); // control forces stiffen in very fast dives
    let pc = ctl.pitch * auth * fx.elev, rc = ctl.roll * auth * fx.ail, yc = ctl.yaw * auth * fx.rud;
    if (!ctrlOk) { pc = fx.drift[0]; rc = fx.drift[1]; yc = 0; }
    const tp = pc * (pc > 0 ? lim : lim * 0.5) * compress;
    const tr = rc * P.roll * lowSpeed * compress * Math.min(fx.ailL, fx.ailR) / Math.max(0.35, (fx.ailL + fx.ailR) / 2);
    const ty = yc * P.wInst * 0.22 * lowSpeed;
    const k = 1 - Math.exp(-dt * 6);
    c.rates.x += (tp - c.rates.x) * k; c.rates.z += (tr - c.rates.z) * k; c.rates.y += (ty - c.rates.y) * k;
    // stability: the nose weathervanes into the airflow, a stalled wing drops the nose, asymmetric lift rolls
    let pr = c.rates.x, rr = c.rates.z, yr = c.rates.y;
    const stalled = Math.abs(alpha) > P.aoa;
    c.stalled = stalled && v > 5;
    if (stalled) pr -= Math.sign(alpha) * (Math.abs(alpha) - P.aoa) * 2.2;
    pr -= Math.sin(alpha) * 0.4 * Math.min(1.5, v / P.vs) * (ctl.pitch === 0 ? 1 : 0.3) * fx.stab;
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
    const cl = aAbs < P.aoa ? alpha / P.aoa : Math.sign(alpha) * Math.max(0.35, 1 - (aAbs - P.aoa) * 2.5);
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
    const drag = P.kd * v * v * rho * fx.dragMul * (P.jet ? wave(v / SONIC) : 1) + ind + (stalled ? 0.15 * v * v / (P.vmax * P.vmax) * P.a0 * 3 : 0);
    acc.addScaledVector(vhat, -Math.min(drag, v / dt * 0.5 + 50));
    c.vel.addScaledVector(acc, dt);
    c.pos.addScaledVector(c.vel, dt);
    c.gLoad = L / G + up.y;
    // fuel burn
    if (c.fuel > 0) c.fuel = Math.max(0, c.fuel - dt * throttle * (c.afterburner ? 3 : 1) / c.endurance - (fx.leak || 0) * dt);
  }

  // ---- autopilot: point the nose along a world direction. Returns {pitch, roll, yaw}.
  const loc = new V3();
  // Two regimes, blended by how far off the nose the aim is:
  //  - gentle (aim within ~50 deg): bank in proportion to the heading error, push/pull the nose with the elevator,
  //    fine-tune with rudder. Small mouse moves give small, smooth corrections - never a roll.
  //  - aggressive (aim far off / behind): roll the aim over the canopy and pull hard.
  const wdir = new V3(), hf = new V3(), ht = new V3();
  function steer(c, dir, out, opt) {
    out = out || {}; opt = opt || {};
    wdir.copy(dir).normalize();
    loc.copy(wdir).applyQuaternion(_q.copy(c.quat).invert());
    const off = Math.acos(Math.max(-1, Math.min(1, -loc.z)));
    axes(c);
    const phi = Math.atan2(-right.y, up.y); // current bank, >0 = right wing down
    const pv = Math.atan2(loc.y, -loc.z), hv = Math.atan2(loc.x, -loc.z);
    const near = Math.max(0, Math.min(1, 1 - (off - 0.015) / 0.07));
    // gentle regime, in world terms
    hf.set(fwd.x, 0, fwd.z); ht.set(wdir.x, 0, wdir.z);
    let gentleOk = hf.lengthSq() > 0.02 && ht.lengthSq() > 0.02 && loc.z < 0;
    let gRoll = 0, gPitch = 0;
    if (gentleOk) {
      hf.normalize(); ht.normalize();
      const psi = Math.atan2(hf.x * ht.z - hf.z * ht.x, hf.dot(ht)); // heading error, >0 = aim to the right
      const maxBank = 1.4; // ~80 deg
      const want = Math.max(-maxBank, Math.min(maxBank, psi * 8));
      let dphi = want - phi; if (dphi > Math.PI) dphi -= 2 * Math.PI; if (dphi < -Math.PI) dphi += 2 * Math.PI;
      gRoll = Math.max(-1, Math.min(1, dphi * 2.2));
      gPitch = Math.max(-0.6, Math.min(1, pv * (6 + 8 * near)));
    }
    // aggressive regime
    const rollErr = Math.atan2(loc.x, loc.y);
    const aRoll = Math.max(-1, Math.min(1, rollErr * 2.2));
    let aPitch = Math.min(1, off * 3.5 * Math.max(0.12, Math.cos(rollErr)));
    if (Math.abs(rollErr) > 2.4 && off > 1.0 && opt.allowPush) aPitch = -0.4;
    const w = gentleOk ? Math.max(0, Math.min(1, (off - 0.85) / 0.4)) : 1;
    let roll = gRoll * (1 - w) + aRoll * w, pitch = gPitch * (1 - w) + aPitch * w;
    if (opt.keepBank && w < 1) roll = roll * 0.5 + aRoll * 0.5;
    const yaw = hv * 20 * near;
    out.pitch = Math.max(-1, Math.min(1, pitch)); out.roll = Math.max(-1, Math.min(1, roll)); out.yaw = Math.max(-1, Math.min(1, yaw));
    out.off = off; return out;
  }
  return { perf, step, steer, axes: c => { axes(c); return { fwd: fwd.clone(), up: up.clone(), right: right.clone() }; }, STALL_FRAC };
})();
