// ============================================================================
// Peer-to-peer networking over WebRTC (PeerJS public broker). The host's peer
// id is derived from a short game code; clients connect to it directly, or
// through a TURN relay when their networks can't (see js/netconfig.js).
// ============================================================================
const Net = (() => {
  const PREFIX = 'skyward-aces-v1-', CONNECT_TIMEOUT = 25000;
  let peer = null, conns = {}, hostConn = null, role = null, code = null, myId = null, gen = 0;
  const h = { message: () => {}, join: () => {}, leave: () => {}, error: () => {}, closed: () => {}, joinFailed: () => {} };
  const cfg = () => (typeof NET_CONFIG !== 'undefined' ? NET_CONFIG : { stun: ['stun:stun.l.google.com:19302'], turn: [] });

  function genCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
  function available() { return typeof Peer !== 'undefined'; }
  // codes are typed (or pasted) by hand: ignore case, spaces and dashes
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // ---- ICE servers: STUN for direct connections, TURN (if configured) to relay when direct isn't possible
  let iceCache = null;
  async function iceServers() {
    if (iceCache) return iceCache;
    const c = cfg(), list = (c.stun || []).map(u => ({ urls: u })).concat(c.turn || []);
    if (c.meteredUrl) { try { const r = await fetch(c.meteredUrl); if (r.ok) list.push(...(await r.json())); } catch (e) { console.warn('TURN credentials could not be fetched', e); } }
    return (iceCache = list);
  }
  function relayConfigured() { const c = cfg(); return !!((c.turn && c.turn.length) || c.meteredUrl); }
  async function makePeer(id) {
    const config = { iceServers: await iceServers() }; if (cfg().forceRelay) config.iceTransportPolicy = 'relay';
    return id ? new Peer(id, { debug: 1, config }) : new Peer({ debug: 1, config });
  }
  const iceState = conn => { const pc = conn && conn.peerConnection; return pc ? pc.iceConnectionState : ''; };
  // the host answered our connection offer: the code is right, only the network path is missing
  const answered = conn => { const pc = conn && conn.peerConnection; return !!(pc && pc.remoteDescription); };
  const noDirect = () => 'Found the game, but your two networks could not connect to each other directly' + (relayConfigured() ? ' (and the relay server could not be reached either).' : '. A relay (TURN) server is needed for these networks: see js/netconfig.js.');
  function peerError(e) {
    const t = e && e.type;
    return t === 'network' || t === 'socket-error' || t === 'socket-closed' || t === 'server-error' ? 'Could not reach the matchmaking server. Check your internet connection and try again.'
      : t === 'browser-incompatible' ? 'This browser does not support online play (WebRTC). Try Chrome, Edge or Firefox.'
      : t === 'disconnected' ? 'Lost the connection to the matchmaking server.'
      : 'Network error: ' + (t || (e && e.message) || e);
  }

  function wire(conn, isHostSide) {
    conn.on('data', d => { let msg = d; if (typeof d === 'string') { try { msg = JSON.parse(d); } catch (e) { return; } }
      // big messages (a 120-plane battle) arrive in parts: put them back together
      if (msg && msg.t === '_part') { const k = conn.peer + ':' + msg.id, buf = parts[k] || (parts[k] = []); buf[msg.i] = msg.d; if (buf.filter(x => x !== undefined).length < msg.n) return; delete parts[k]; try { msg = JSON.parse(buf.join('')); } catch (e) { return; } }
      h.message(isHostSide ? conn.peer : 'H', msg); });
    conn.on('close', () => {
      if (isHostSide) { if (conns[conn.peer] === conn) { delete conns[conn.peer]; h.leave(conn.peer); } }
      else if (hostConn === conn) { hostConn = null; h.closed('The host closed the game or the connection was lost.'); }
    });
    conn.on('error', e => console.warn('conn error', e));
  }

  async function host(onReady, tries) {
    if (!available()) return h.error('Networking library failed to load (are you offline?).');
    close(); const my = gen;
    role = 'host'; code = genCode();
    const p = await makePeer(PREFIX + code); if (my !== gen) { p.destroy(); return; } peer = p;
    p.on('open', () => { myId = 'H'; onReady(code); });
    p.on('connection', conn => {
      // a player found the game: it either opens, or the networks can't connect (tell the host so they know why)
      let ok = false; const t0 = Date.now();
      conn.on('open', () => { ok = true; conns[conn.peer] = conn; wire(conn, true); h.join(conn.peer); });
      const watch = setInterval(() => {
        if (ok || peer !== p) return clearInterval(watch);
        if (iceState(conn) === 'failed' || Date.now() - t0 > CONNECT_TIMEOUT) { clearInterval(watch); try { conn.close(); } catch (e) {} h.joinFailed('A player found your game but could not connect: your networks cannot reach each other directly' + (relayConfigured() ? ' and the relay failed.' : ' (no relay server is set up).')); }
      }, 500);
    });
    p.on('error', e => {
      if (e.type === 'unavailable-id' && (tries || 0) < 4) return host(onReady, (tries || 0) + 1);
      if (e.type === 'peer-unavailable') return; // (not used by the host)
      h.error(peerError(e));
    });
    // the matchmaking server drops idle sockets now and then: reconnect so new players can still find the code
    p.on('disconnected', () => { setTimeout(() => { if (peer === p && !p.destroyed) try { p.reconnect(); } catch (e) {} }, 1000); });
  }
  async function join(c, onOpen) {
    if (!available()) return h.error('Networking library failed to load (are you offline?).');
    close(); const my = gen;
    role = 'client'; code = cleanCode(c);
    const p = await makePeer(); if (my !== gen) { p.destroy(); return; } peer = p;
    let opened = false, failed = false, watch = null;
    const fail = msg => { if (opened || failed || peer !== p) return; failed = true; clearInterval(watch); h.error(msg); close(); };
    p.on('open', id => {
      myId = id;
      const conn = hostConn = p.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => { if (failed) return; opened = true; clearInterval(watch); wire(conn, false); onOpen(myId); });
      const t0 = Date.now();
      watch = setInterval(() => {
        if (opened) return clearInterval(watch);
        if (iceState(conn) === 'failed') fail(noDirect());
        else if (Date.now() - t0 > CONNECT_TIMEOUT) fail(answered(conn) ? noDirect() : 'Could not reach a game with code ' + code + '. Check the code and that the host is still in the lobby.');
      }, 500);
    });
    p.on('error', e => {
      if (e.type === 'peer-unavailable') fail('No game found with code ' + code + '. Check the code, and that the host is still in the lobby.');
      else if (!opened) fail(peerError(e));
      else console.warn('peer error', e);
    });
    p.on('disconnected', () => { if (!opened) fail('Lost the connection to the matchmaking server.'); else setTimeout(() => { if (peer === p && !p.destroyed) try { p.reconnect(); } catch (e) {} }, 1000); });
  }
  // the JSON channel takes at most ~16 KB per message: split anything bigger into parts
  const parts = {}; let partSeq = 0;
  function out(c, msg) {
    const str = JSON.stringify(msg);
    if (str.length < 12000) { c.send(msg); return; }
    const id = ++partSeq, n = Math.ceil(str.length / 6000);
    for (let i = 0; i < n; i++) c.send({ t: '_part', id, i, n, d: str.slice(i * 6000, (i + 1) * 6000) });
  }
  function send(msg) { if (hostConn && hostConn.open) out(hostConn, msg); }
  function sendTo(id, msg) { const c = conns[id]; if (c && c.open) out(c, msg); }
  function broadcast(msg) { for (const id in conns) if (conns[id].open) out(conns[id], msg); }
  function kick(id) { const c = conns[id]; if (c) { try { c.send({ t: 'kicked' }); setTimeout(() => c.close(), 200); } catch (e) {} delete conns[id]; } }
  function close() {
    gen++;
    const old = peer, oc = conns, hc = hostConn;
    peer = null; conns = {}; hostConn = null; role = null; code = null; myId = null;
    try { for (const id in oc) oc[id].close(); } catch (e) {}
    try { if (hc) hc.close(); } catch (e) {}
    try { if (old) old.destroy(); } catch (e) {}
  }
  return {
    host, join, send, sendTo, broadcast, kick, close, available, relayConfigured, cleanCode,
    on(ev, fn) { h[ev] = fn; },
    get role() { return role; }, get code() { return code; }, get myId() { return myId; },
    peers: () => Object.keys(conns),
  };
})();
