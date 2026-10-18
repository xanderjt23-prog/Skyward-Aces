// ============================================================================
// Input: rebindable controls. Every action is bound to one key or mouse button
// (codes like 'KeyW', 'Space', 'Mouse0' = left button, 'Mouse2' = right).
// Bindings are saved in the profile settings.
// ============================================================================
const Input = (() => {
  const ACTIONS = [
    ['fire', 'Fire guns', 'Mouse0', 'hold'],
    ['zoom', 'Zoom in', 'Mouse2', 'hold'],
    ['freeLook', 'Look around', 'KeyV', 'hold'],
    ['throttleUp', 'Throttle up (hold at 100% for WEP / afterburner)', 'KeyW', 'hold'],
    ['throttleDown', 'Throttle down', 'KeyS', 'hold'],
    ['rollLeft', 'Roll left (release to hold the bank)', 'KeyA', 'hold'],
    ['rollRight', 'Roll right (release to hold the bank)', 'KeyD', 'hold'],
    ['yawLeft', 'Rudder left', 'KeyQ', 'hold'],
    ['yawRight', 'Rudder right', 'KeyE', 'hold'],
    ['pitchUp', 'Pull — manual override (stall, cobra)', 'ArrowDown', 'hold'],
    ['pitchDown', 'Push — manual override', 'ArrowUp', 'hold'],
    ['bombs', 'Drop bombs', 'Space', 'press'],
    ['rockets', 'Fire rockets', 'KeyR', 'press'],
    ['missile', 'Fire missile', 'KeyF', 'press'],
    ['flares', 'Release flares', 'KeyX', 'press'],
    ['gear', 'Landing gear (Realistic mode)', 'KeyG', 'press'],
    ['brakes', 'Wheel brakes (Realistic mode)', 'KeyB', 'hold'],
    ['camera', 'Change camera', 'KeyC', 'press'],
    ['scoreboard', 'Scoreboard', 'Tab', 'hold'],
  ];
  const DEF = {}; for (const a of ACTIONS) DEF[a[0]] = a[2];
  const keys = {};
  const binds = () => { const s = Profile.get().settings; return s.binds || (s.binds = {}); };
  const bind = a => binds()[a] || DEF[a];
  const down = a => !!keys[bind(a)];
  const actionsFor = code => ACTIONS.filter(a => bind(a[0]) === code).map(a => a[0]);
  function setBind(a, code) {
    // a key can only do one thing: whatever had it before gets this action's old key
    const old = bind(a), other = ACTIONS.find(x => x[0] !== a && bind(x[0]) === code);
    binds()[a] = code; if (other) binds()[other[0]] = old;
    Profile.save();
  }
  function reset() { Profile.get().settings.binds = {}; Profile.save(); }
  function label(code) {
    if (!code) return '—';
    if (code.startsWith('Mouse')) return ['Left mouse', 'Middle mouse', 'Right mouse', 'Mouse 4', 'Mouse 5'][+code.slice(5)] || code;
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Arrow')) return code.slice(5) + ' arrow';
    return { Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', Tab: 'Tab', Enter: 'Enter', Backquote: '`' }[code] || code;
  }
  return { ACTIONS, DEF, keys, bind, down, actionsFor, setBind, reset, label };
})();
