// Minimal headless-Chrome driver: node tools/cdp.mjs <steps.mjs>
import { spawn } from 'child_process';
import fs from 'fs'; import path from 'path';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// browser profile lives in the OS temp folder, never inside the project (it holds Chrome's own data and keys)
const prof = process.env.TEMP_PROFILE || path.join((await import('os')).tmpdir(), 'skyward-aces-test-profile');
const port = 9333 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1440,900', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets; for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch (e) {} await sleep(250); }
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = {}; const logs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text) + ' @' + m.params.exceptionDetails.lineNumber);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('[LOG] ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const api = {
  sleep, logs, send,
  async goto(url) {
    await send('Page.navigate', { url }); await sleep(800);
    // wait until the game scripts have loaded (slow machines can take several seconds)
    for (let t = 0; t < 60; t++) { const r = await send('Runtime.evaluate', { expression: "typeof Game !== 'undefined' && typeof UI !== 'undefined' && typeof THREE !== 'undefined' && document.readyState === 'complete'", returnByValue: true }); if (r.result.result && r.result.result.value === true) break; await sleep(250); }
    await sleep(700);
  },
  async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) return 'ERR: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; },
  async shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync('tools/tests/shots', { recursive: true }); fs.writeFileSync(`tools/tests/shots/${name}.png`, Buffer.from(r.result.data, 'base64')); },
  async key(key, type) { const code = key.length === 1 ? (/[0-9]/.test(key) ? 'Digit' + key : 'Key' + key.toUpperCase()) : key; await send('Input.dispatchKeyEvent', { type: type || 'keyDown', key, code, text: type === 'keyUp' ? undefined : (key.length === 1 ? key : undefined) }); },
  async mouse(x, y, type, button) { await send('Input.dispatchMouseEvent', { type, x, y, button: button || 'left', clickCount: 1 }); },
};
const { pathToFileURL } = await import('url');
const steps = (await import(pathToFileURL(path.resolve(process.argv[2])).href)).default;
try { await steps(api); } catch (e) { console.log('STEP ERROR', e); }
console.log('--- console ---\n' + logs.join('\n'));
ws.close(); proc.kill(); process.exit(0);
