/* WebRTC data channel. The global mode is negotiated automatically through the online relay. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.BonkLAN = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var PREFIX = 'BONK-LAN1.', MAX_CODE = 100000, MAX_DATA = 1024 * 1024;
  var HEADER = 20, FRAME = 16384, CHUNK = FRAME - HEADER, MAX_BUFFER = 2 * MAX_DATA;
  var MAGIC = 0x424c4e31, LABEL = 'bonk-lan', PROTOCOL = 'bonk-lan/1';

  function description(value, expected, globalMode) {
    if (!value || typeof value !== 'object' || value.v !== 1 || value.type !== expected ||
        Object.keys(value).sort().join(',') !== 'sdp,type,v' || typeof value.sdp !== 'string' ||
        value.sdp.length > 70000 || !/^v=0\r?\n/.test(value.sdp) ||
        /[^\x09\x0a\x0d\x20-\x7e]/.test(value.sdp) || !/^m=application /m.test(value.sdp) ||
        !/^a=ice-ufrag:\S+/m.test(value.sdp) || !/^a=ice-pwd:\S+/m.test(value.sdp) ||
        !/^a=fingerprint:\S+ \S+/m.test(value.sdp)) throw new Error('Código LAN inválido.');
    var candidates = value.sdp.match(/^a=candidate:[^\r\n]+/gm) || [];
    if (!candidates.length || candidates.some(function (line) { return !(globalMode ? / typ (host|srflx|relay)(?: |$)/ : / typ host(?: |$)/).test(line); })) {
      throw new Error('Não foi encontrado um endereço local. Verifique a conexão com a rede LAN.');
    }
    return { type: value.type, sdp: value.sdp };
  }
  function encode(value, globalMode) {
    var envelope = { v: 1, type: value.type, sdp: value.sdp };
    if (value.type !== 'offer' && value.type !== 'answer') throw new Error('Tipo de código LAN inválido.');
    description(envelope, value.type, globalMode);
    var code = PREFIX + root.btoa(JSON.stringify(envelope));
    if (code.length > MAX_CODE) throw new Error('Código LAN grande demais.');
    return code;
  }
  function decode(code, expected, globalMode) {
    if (expected !== 'offer' && expected !== 'answer') throw new Error('Tipo de código LAN inválido.');
    if (typeof code !== 'string' || code.length > MAX_CODE) throw new Error('Código LAN inválido ou grande demais.');
    code = code.trim();
    var data = code.slice(PREFIX.length);
    if (code.slice(0, PREFIX.length) !== PREFIX || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4) {
      throw new Error('Código LAN inválido.');
    }
    var envelope;
    try { envelope = JSON.parse(root.atob(data)); }
    catch (_) { throw new Error('Código LAN inválido.'); }
    return description(envelope, expected, globalMode);
  }
  function checksum(bytes) {
    var n = 2166136261;
    for (var i = 0; i < bytes.length; i++) n = Math.imul(n ^ bytes[i], 16777619);
    return n >>> 0;
  }
  function nextId(n) { return n === 0xffffffff ? 1 : n + 1; }

  function create(options) {
    options = options || {};
    var PeerConnection = options.PeerConnection || root.RTCPeerConnection;
    if (typeof PeerConnection !== 'function') throw new Error('Este navegador não oferece WebRTC. Use Chrome, Edge ou Firefox atualizado.');
    // shortcut: STUN cannot cross every firewall; add TURN if the Firebase fallback is too slow on those networks.
    var pc = new PeerConnection({ iceServers: options.global ? options.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] : [] });
    var channel = null, state = 'new', role = null, accepted = false;
    var sendId = 1, receiveId = 1, incoming = null, incomingTimer = null;
    var cancelIce = null, disconnectTimer = null;
    var encoder = new root.TextEncoder(), decoder = new root.TextDecoder('utf-8', { fatal: true });
    var link = {
      offer: offer, answer: answer, accept: accept, send: send, close: close,
      get status() { return state; }
    };
    function emit(name, value) { if (typeof options[name] === 'function') options[name](link, value); }
    function fail(error) {
      if (state === 'closed') return;
      try { emit('onError', error instanceof Error ? error : new Error(String(error))); }
      finally { close(); }
    }
    function clearIncoming() {
      clearTimeout(incomingTimer); incomingTimer = null; incoming = null;
    }
    function close() {
      if (state === 'closed') return;
      state = 'closed'; clearIncoming(); clearTimeout(disconnectTimer);
      if (cancelIce) cancelIce(new Error('Conexão LAN encerrada.'));
      if (channel) channel.close();
      pc.close(); emit('onClose');
    }
    function attachChannel(value) {
      if (state === 'closed') { value.close(); return; }
      if (channel || value.label !== LABEL || value.protocol !== PROTOCOL || value.ordered !== true ||
          value.maxRetransmits != null || value.maxPacketLifeTime != null) {
        value.close(); fail(new Error('Canal LAN inválido.')); return;
      }
      channel = value; channel.binaryType = 'arraybuffer';
      channel.onopen = function () {
        if (state === 'closed' || state === 'open') return;
        state = 'open'; emit('onOpen');
      };
      channel.onclose = close;
      channel.onerror = function () { fail(new Error('Falha no canal LAN.')); };
      channel.onmessage = function (event) {
        var message;
        try { message = receive(event.data); }
        catch (error) { fail(error); return; }
        if (message !== undefined) emit('onMessage', message);
      };
      if (channel.readyState === 'open') channel.onopen();
    }
    pc.ondatachannel = function (event) { attachChannel(event.channel); };
    pc.onconnectionstatechange = function () {
      clearTimeout(disconnectTimer);
      if (pc.connectionState === 'failed') fail(new Error('Não foi possível conectar pela LAN. Verifique a rede e o firewall.'));
      else if (pc.connectionState === 'closed') close();
      else if (pc.connectionState === 'disconnected' && state !== 'closed') {
        disconnectTimer = setTimeout(function () { fail(new Error('A conexão LAN foi perdida.')); }, 10000);
      }
    };
    function waitIce() {
      return new Promise(function (resolve, reject) {
        var timer;
        function done(error) {
          clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); cancelIce = null;
          if (error) reject(error); else resolve();
        }
        function check() { if (pc.iceGatheringState === 'complete') done(); }
        cancelIce = done; pc.addEventListener('icegatheringstatechange', check);
        // Host candidates usually finish quickly; a timeout still requires a usable local address.
        timer = setTimeout(function () { done(); }, 8000);
        check();
      });
    }
    async function localCode(type) {
      await pc.setLocalDescription(await (type === 'offer' ? pc.createOffer() : pc.createAnswer()));
      if (state === 'closed') throw new Error('Conexão LAN encerrada.');
      await waitIce();
      if (state === 'closed') throw new Error('Conexão LAN encerrada.');
      return encode(pc.localDescription, options.global);
    }
    async function offer() {
      if (state !== 'new') throw new Error('Esta conexão LAN já foi iniciada.');
      role = 'offer'; state = 'connecting';
      try {
        attachChannel(pc.createDataChannel(LABEL, { ordered: true, protocol: PROTOCOL }));
        return await localCode('offer');
      } catch (error) { fail(error); throw error; }
    }
    async function answer(code) {
      var remote = decode(code, 'offer', options.global);
      if (state !== 'new') throw new Error('Esta conexão LAN já foi iniciada.');
      role = 'answer'; state = 'connecting';
      try { await pc.setRemoteDescription(remote); return await localCode('answer'); }
      catch (error) { fail(error); throw error; }
    }
    async function accept(code) {
      var remote = decode(code, 'answer', options.global);
      if (role !== 'offer' || state !== 'connecting' || accepted) throw new Error('Esta conexão não está aguardando uma resposta LAN.');
      accepted = true;
      try { await pc.setRemoteDescription(remote); }
      catch (error) { fail(error); throw error; }
    }
    function send(object) {
      if (state !== 'open' || !channel || channel.readyState !== 'open') return false;
      if (options.global && channel.bufferedAmount > 65536) return false;
      var bytes;
      try {
        if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('A mensagem LAN deve ser um objeto.');
        var json = JSON.stringify(object);
        if (typeof json !== 'string' || json.charAt(0) !== '{') throw new Error('A mensagem LAN deve ser um objeto.');
        if (json.length > MAX_DATA) throw new Error('Mensagem LAN grande demais.');
        bytes = encoder.encode(json);
        if (bytes.length > MAX_DATA) throw new Error('Mensagem LAN grande demais.');
      } catch (error) { emit('onError', error); return false; }
      var count = Math.ceil(bytes.length / CHUNK);
      if (channel.bufferedAmount + bytes.length + count * HEADER > MAX_BUFFER) return false;
      var hash = checksum(bytes);
      try {
        for (var i = 0; i < count; i++) {
          var part = bytes.subarray(i * CHUNK, Math.min((i + 1) * CHUNK, bytes.length));
          var frame = new Uint8Array(HEADER + part.length), view = new DataView(frame.buffer);
          view.setUint32(0, MAGIC); view.setUint32(4, sendId); view.setUint32(8, bytes.length);
          view.setUint16(12, i); view.setUint16(14, count); view.setUint32(16, hash);
          frame.set(part, HEADER); channel.send(frame.buffer);
        }
        sendId = nextId(sendId); return true;
      } catch (error) {
        // A mid-send failure closes the link, so an incomplete object is never delivered.
        fail(error); return false;
      }
    }
    function receive(data) {
      if (state !== 'open') throw new Error('Mensagem recebida antes da abertura do canal LAN.');
      if (!(data instanceof ArrayBuffer) || data.byteLength < HEADER + 1 || data.byteLength > FRAME) throw new Error('Fragmento LAN inválido.');
      var view = new DataView(data), bytes = new Uint8Array(data, HEADER);
      var id = view.getUint32(4), total = view.getUint32(8), index = view.getUint16(12);
      var count = view.getUint16(14), hash = view.getUint32(16);
      if (view.getUint32(0) !== MAGIC || id !== receiveId || !total || total > MAX_DATA ||
          count !== Math.ceil(total / CHUNK) || index >= count ||
          bytes.length !== Math.min(CHUNK, total - index * CHUNK)) throw new Error('Sequência LAN inválida.');
      if (!incoming) {
        if (index !== 0) throw new Error('Primeiro fragmento LAN ausente.');
        incoming = { total: total, count: count, hash: hash, index: 0, bytes: new Uint8Array(total) };
        incomingTimer = setTimeout(function () { fail(new Error('Mensagem LAN incompleta.')); }, 10000);
      }
      if (index !== incoming.index || total !== incoming.total || count !== incoming.count || hash !== incoming.hash) throw new Error('Fragmentos LAN incompatíveis.');
      incoming.bytes.set(bytes, index * CHUNK); incoming.index++;
      if (incoming.index !== count) return;
      var complete = incoming.bytes; clearIncoming();
      if (checksum(complete) !== hash) throw new Error('Mensagem LAN corrompida.');
      var object = JSON.parse(decoder.decode(complete));
      if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('Mensagem LAN inválida.');
      receiveId = nextId(receiveId); return object;
    }
    return link;
  }
  return Object.freeze({ create: create, encode: encode, decode: decode });
}));
