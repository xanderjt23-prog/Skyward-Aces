// node tools/tests/mp.mjs : two tabs in one headless Chrome - one hosts (join code), one joins; plays a Destroy battle
import { spawn } from 'child_process'; import path from 'path'; import os from 'os'; import fs from 'fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe', port = 9900 + Math.floor(Math.random() * 90);
const prof = path.join(os.tmpdir(), 'skyaces-mp-' + Date.now());
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1280,800', '--use-angle=swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.length) break; } catch (e) {} await sleep(250); }
const url = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
async function tab(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}, logs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('[err] ' + m.params.args.map(a => a.value ?? a.description).join(' ')); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? 'ERR ' + (r.result.exceptionDetails.exception?.description || '') : r.result.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync('tools/tests/shots', { recursive: true }); fs.writeFileSync(`tools/tests/shots/${n}.png`, Buffer.from(r.result.data, 'base64')); };
  return { send, ev, shot, logs };
}
const A = await tab(list.find(t => t.type === 'page'));
const nt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const B = await tab(nt);
for (const [T, plane, name] of [[A, 'p51d', 'HostPilot'], [B, 'bf109g', 'GuestPilot']]) {
  await T.send('Page.navigate', { url }); await sleep(1000); for (let i = 0; i < 60 && (await T.ev('typeof Profile')) !== 'object'; i++) await sleep(500);
  console.log(name, await T.ev(`localStorage.clear(); Profile.reset(); const p = Profile.get(); p.owned['${plane}'] = true; p.selected = '${plane}'; p.name = '${name}'; Profile.save(); UI.refresh(); 'ok'`));
}
// background tabs don't get animation frames: tick both games from a timer instead
for (const T of [A, B]) await T.ev("setInterval(() => { if (Game.running && Game.match) { Game.update(0.05); } }, 50); 1");
await A.ev("UI.open('play'); document.querySelector('#p-mp').click(); document.querySelector('#mp-host').click(); 1");
let code = null; for (let i = 0; i < 40 && !code; i++) { await sleep(500); code = await A.ev("(UI.lobby && UI.lobby.code) || null"); }
console.log('code', code);
await B.ev(`UI.open('play'); document.querySelector('#p-mp').click(); document.querySelector('#join-code').value = '${code}'; document.querySelector('#mp-join').click(); 1`);
let joined = false; for (let i = 0; i < 60 && !joined; i++) { await sleep(500); joined = await A.ev("UI.lobby.players.length >= 2"); }
console.log('joined', joined, 'client sees players:', await B.ev("UI.lobby && UI.lobby.players.map(p => p.name + '/' + p.team).join(',')"));
// small destroy battle, guest moved to the red team
await A.ev("UI.lobby.settings.teamSize = [4, 4]; UI.lobby.players.forEach(p => p.team = p.peer === 'H' ? 0 : 1); 1");
await sleep(800);
console.log('client lobby:', await B.ev("UI.lobby.settings.mode + ' ' + UI.lobby.settings.teamSize + ' ' + UI.lobby.players.map(p => p.name + '/' + p.team).join(',')"));
await A.ev("document.querySelector('#lobby-start').click(); 1");
await sleep(3000);
console.log('host in battle', await A.ev("Game.running && Game.match.crafts.length"), 'client in battle', await B.ev("Game.running && Game.match && Game.match.crafts.length"));
// make both players fly as bots so they fight
for (const T of [A, B]) await T.ev("Game.match.player.ai = new BotBrain(Game.match.player, 0.8); 1");
for (let s = 0; s < 12; s++) {
  await sleep(5000);
  const ha = await A.ev("(() => { const m = Game.match; const g = m.crafts.find(c => !c.local); return 't ' + m.time.toFixed(0) + ' scores ' + m.scores + ' kills ' + m.crafts.reduce((a, c) => a + c.stats.kills, 0) + ' guest@host ' + (g ? (g.pos.x|0) + ',' + (g.pos.y|0) + ' alive ' + g.alive + ' frac ' + (g.dm ? g.dm.frac.toFixed(2) : '-') : 'none'); })()");
  const hb = await B.ev("(() => { const m = Game.match; const me = m.player, bot = m.crafts.find(c => c.isBot); return 't ' + m.time.toFixed(0) + ' scores ' + m.scores + ' me ' + (me.pos.x|0) + ',' + (me.pos.y|0) + ' alive ' + me.alive + ' frac ' + me.dm.frac.toFixed(2) + ' k/d ' + me.stats.kills + '/' + me.stats.deaths + ' bot@client ' + (bot.pos.x|0) + ',' + (bot.pos.y|0) + ' feed ' + m.feed.length + ' bases ' + m.bases.filter(b => b.dead).length; })()");
  console.log('HOST  ', ha); console.log('CLIENT', hb);
}
await A.shot('mp-host'); await B.shot('mp-client');
// end: host leaves -> both see results
await A.ev("Game.match.end(0, 'test end'); 1"); await sleep(4000);
console.log('host results', await A.ev("document.querySelector('#results .big-result') && document.querySelector('#results .big-result').textContent"), 'client results', await B.ev("document.querySelector('#results .big-result') && document.querySelector('#results .big-result').textContent"));
console.log('A logs', A.logs.slice(0, 10)); console.log('B logs', B.logs.slice(0, 10));
proc.kill(); process.exit(0);
