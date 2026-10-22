// node tools/tests/cdp.mjs tools/tests/bfm.mjs : the basic fighter maneuver lessons, driven step by step by a scripted
// pilot (through the rings, onto the moving rings, the measured maneuvers), checking every lesson completes.
// IDS=vertical,energy,... to pick lessons.
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const ids = (process.env.IDS || 'vertical,energy,defence,offence,yoyo,scissors,twoship').split(',');
  for (const id of ids) {
    const r = await t.eval(`(() => { const cfg = Plan.build({ mode: 'tutorial', tutorial: '${id}' }, [{ name: 'T', plane: Tutorial.byId('${id}').plane, owner: 'H', team: 0 }]);
      Game.startMatch(cfg, { playerId: cfg.roster.find(r => !r.bot).id, isHost: true }); const m = Game.match, p = m.player, D = Tutorial._dbg, V = THREE.Vector3, UP = new V(0, 1, 0);
      const step = () => { Game.update(1 / 30); return m.over || !m.tut; };
      const aim = (dir, bank) => { const f = dir.clone().normalize(), r0 = new V().crossVectors(f, UP); if (r0.lengthSq() < 1e-6) r0.set(1, 0, 0); r0.normalize(); const u = new V().crossVectors(r0, f).normalize(), u2 = u.clone().multiplyScalar(Math.cos(bank || 0)).addScaledVector(r0, Math.sin(bank || 0)), r2 = new V().crossVectors(f, u2);
        p.quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r2, u2, f.clone().negate())); p.vel.copy(f).multiplyScalar(Math.max(p.speed, 120)); };
      for (let k = 0; k < 20; k++) step();
      const log = []; let guard = 0;
      while (!m.over && guard++ < 40) {
        const T = m.tut, i = T.step, st = T.t.steps[i], S = T.S; let n = 0;
        for (let k = 0; k < 3; k++) step();
        if (/Stall turn/.test(st.text(Tutorial.ctx(m)))) { // flown with the keys: pull to the vertical, wait, full rudder, pull out
          const bankDeg0 = () => { const r = new V(1, 0, 0).applyQuaternion(p.quat), u = new V(0, 1, 0).applyQuaternion(p.quat); return Math.atan2(-r.y, u.y) * 57.3; };
          const pitch = () => Math.asin(new V(0, 0, -1).applyQuaternion(p.quat).y) * 57.3, keys = a => { for (const k in Input.keys) Input.keys[k] = false; for (const x of a) Input.keys[Input.bind(x)] = true; };
          const run = (a, secs, until) => { keys(a); let q = 0; for (let k = 0; k < secs * 30 && T.step === i && !m.over; k++) { step(); n++; q++; if (until()) break; } log.push(a.join('+') + ':' + (q / 30).toFixed(1) + 's p' + Math.round(pitch()) + ' v' + Math.round(p.speed * 3.6) + ' ph' + T.S.ph); };
          run(['throttleUp', 'pitchDown'], 12, () => p.speed > 128); aim(new V(0, 0, -1).applyQuaternion(p.quat).setY(0), 0); log.push('bank before pull ' + Math.round(bankDeg0())); for (let k = 0; k < 300 && pitch() < 80 && T.step === i; k++) { keys((p.gLoad || 1) < 6 ? ['throttleUp', 'pitchUp'] : ['throttleUp']); step(); n++; } log.push('pulled p' + Math.round(pitch()) + ' gloc ' + (p.glocT > 0) + ' elev ' + p.dm.fx.elev + ' flaps ' + p.flaps + ' thr ' + p.ctl.throttle + ' kp ' + Game.kp + ' manual ' + p.ctl.manual + ' pc ' + p.ctl.pitch.toFixed(2) + ' alpha ' + (p.alpha * 57.3).toFixed(1) + ' stalled ' + p.stalled); run(['throttleUp'], 14, () => p.speed < 17); run(['throttleUp', 'yawRight'], 8, () => pitch() < -60); run(['throttleUp'], 3, () => false); run(['throttleUp', 'pitchUp'], 8, () => Math.abs(pitch()) < 10 && p.vel.y > -5); run(['throttleUp'], 4, () => false); keys([]);
        } else if (st.gates && S.gates) { // through the rings
          for (let g = 0; g < S.gates.length && !m.over && T.step === i; g++) { const q = S.gates[g], nx = S.gates[g + 1] || q.clone().add(q.clone().sub(S.gates[g - 1] || p.pos)); p.pos.copy(q); aim(nx.clone().sub(q)); if (st.text(Tutorial.ctx(m)).includes('15% speed')) p.vel.setLength(S.k.v * 1.25); step(); step(); n++; }
          for (let k = 0; k < 900 && T.step === i && !m.over; k++) { aim(new V(0, 0, -1).applyQuaternion(p.quat).setY(0)); step(); n++; } // then fly on (an attacker overshooting)
        } else if (st.rel) { // onto the moving rings
          for (let k = 0; k < 600 && T.step === i && !m.over; k++) { const who = D.bot(m, st.rel.who), q = D.at(D.frame(who), ...st.rel.pts[Math.min(S.ri || 0, st.rel.pts.length - 1)]); p.pos.copy(q); aim(who.vel.clone()); step(); n++; }
        } else { // measured maneuvers: the scripted pilot does what the text asks
          const txt = st.text(Tutorial.ctx(m));
          for (let k = 0; k < 2400 && T.step === i && !m.over; k++) { const s = T.S, f = new V(0, 0, -1).applyQuaternion(p.quat).setY(0).normalize(), tw = D.bot(m, 'w1'), tt = D.bot(m, 't1');
            if (/Jink|Flat scissors/.test(txt)) { if (tt) p.pos.copy(tt.pos).add(new V(150, 0, 0)); aim(f, Math.floor(k / 20) % 2 ? 1.1 : -1.1); }
            else if (/Rolling scissors/.test(txt)) { if (tt) p.pos.copy(tt.pos).add(new V(100, 50, 0)); aim(f, (k / 30) * Math.PI); }
            else if (/high yo-yo above/.test(txt)) { if ((s.ul || 0) < 2) aim(f, 0); else aim(f.clone().applyAxisAngle(UP, 0.08), 1.2); }
            else if (/Combat spread/.test(txt)) { p.pos.copy(D.at(D.frame(tw), 1600, 450, 0)); aim(tw.vel.clone()); }
            else if (/Defensive split|Sandwich/.test(txt)) aim(f.clone().applyAxisAngle(UP, -0.04), -1.1);
            else if (/Thach weave/.test(txt)) { const F = D.frame(tw); p.pos.copy(D.at(F, Math.floor(k / 60) % 2 ? 300 : -300, 0, -100)); aim(tw.vel.clone()); }
            step(); n++; }
        }
        log.push(i + (m.over ? '>done' : '>' + T.step) + '(' + n + ')');
        if (!m.over && T.step === i) { log.push('STUCK: ' + st.text(Tutorial.ctx(m)).slice(0, 60) + ' ph ' + T.S.ph + ' pitch ' + Math.round(Math.asin(new V(0, 0, -1).applyQuaternion(p.quat).y) * 57.3) + ' kmh ' + Math.round(p.speed * 3.6) + ' agl ' + Math.round(p.pos.y - m.world.groundAt(p.pos.x, p.pos.z)) + ' alive ' + p.alive); break; }
      }
      return '${id}'.padEnd(9) + ' ' + log.join(' ') + ' | ' + (m.result ? m.result.reason : 'not finished'); })()`);
    console.log(r);
    await t.eval("Game.leave(); const b = document.querySelector('#res-ok'); if (b) b.click(); 1");
  }
}
