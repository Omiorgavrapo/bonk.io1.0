/* HTTPS relay: the host simulates the game; Firebase carries packets across networks. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.BonkOnline = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var PREFIX = 'BONK-ONLINE3.', LIMIT = 1048576, LIFETIME = 2700000;
  function decode(code, type) {
    var value;
    try { if (typeof code !== 'string' || code.length > 1000 || code.indexOf(PREFIX) !== 0) throw Error(); value = JSON.parse(root.atob(code.slice(PREFIX.length))); } catch (_) { throw Error('Convite incompatível. Todos precisam da versão online atualizada.'); }
    if (!value || Object.keys(value).sort().join(',') !== 'id,type,uid,v' || value.v !== 3 || value.type !== type ||
        !/^[a-f0-9]{32}$/.test(value.id) || typeof value.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.uid)) throw Error('Convite online inválido.');
    return value;
  }
  function encode(id, uid, type) { return PREFIX + root.btoa(JSON.stringify({ v: 3, id: id, uid: uid, type: type })); }
  function random() { var bytes = new Uint8Array(16); root.crypto.getRandomValues(bytes); return Array.from(bytes, function (n) { return n.toString(16).padStart(2, '0'); }).join(''); }
  function create(options) {
    options = options || {};
    var auth = root.BonkPIN.create(root.BonkOnlineConfig), user, id, owner = false, status = 'new', requests = new Set(), stream, tick, lifetime;
    var cache = null, queue = [], incoming = [], writing = false, sent = 0, received = 0, heardAt = Date.now(), sentAt = 0;
    var link = { offer: offer, answer: answer, accept: accept, send: send, close: close, get status() { return status; } };
    function emit(name, value) { if (options[name]) options[name](link, value); }
    function fail(error) { if (status === 'closed') return; try { emit('onError', error instanceof Error ? error : Error(String(error))); } finally { close(); } }
    function url(path) { return user.databaseURL + '/connections/' + id + path + '.json?auth=' + encodeURIComponent(user.token); }
    async function write(path, method, value, cleanup) {
      if (!cleanup && status === 'closed') throw Error('Conexão encerrada.');
      var controller = new root.AbortController(), timeout = setTimeout(function () { controller.abort(); }, 10000); requests.add(controller);
      try {
        var response = await root.fetch(url(path), { method: method, headers: { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value),
          signal: controller.signal, referrerPolicy: 'no-referrer', cache: 'no-store', keepalive: !!cleanup });
        if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'Atualize as regras do Firebase usando o arquivo firebase.rules.json deste jogo.' : 'O serviço da partida não respondeu. Tente novamente.');
        return response.status === 204 ? null : await response.json();
      } finally { clearTimeout(timeout); requests.delete(controller); }
    }
    function close(remote) {
      if (status === 'closed') return;
      status = 'closed'; clearInterval(tick); clearTimeout(lifetime); if (stream) stream.abort();
      requests.forEach(function (controller) { controller.abort(); }); queue = []; incoming = []; auth.close();
      if (id && user && (owner || !remote)) write(owner ? '' : '/left', owner ? 'DELETE' : 'PUT', owner ? undefined : true, true).catch(function () {});
      emit('onClose');
    }
    function open() {
      if (status !== 'connecting') return;
      status = 'open'; heardAt = Date.now(); emit('onOpen');
      var waiting = incoming; incoming = []; waiting.forEach(function (message) { if (status === 'open') emit('onMessage', message); });
    }
    function mail(value) {
      if (!value || value.seq === received) return;
      if (!Number.isSafeInteger(value.seq) || value.seq !== received + 1 || typeof value.payload !== 'string' || value.payload.length > LIMIT) throw Error('A conexão perdeu dados. Peça outro PIN para reconectar.');
      var messages = JSON.parse(value.payload);
      if (!Array.isArray(messages) || messages.length > 256 || messages.some(function (message) { return !message || typeof message !== 'object' || Array.isArray(message); })) throw Error('Mensagem online inválida.');
      received = value.seq; heardAt = Date.now();
      messages.forEach(function (message) { if (status === 'open') emit('onMessage', message); else if (status === 'connecting') incoming.push(message); });
    }
    function apply(path, value) {
      var keys = path.split('/').filter(Boolean);
      if (!keys.length) { cache = value; return; }
      if (!cache) cache = {};
      var target = cache;
      keys.forEach(function (key, index) {
        if (['__proto__', 'prototype', 'constructor'].indexOf(key) >= 0) throw Error('Dados online inválidos.');
        if (index === keys.length - 1) { if (value === null) delete target[key]; else target[key] = value; }
        else { if (!target[key] || typeof target[key] !== 'object') target[key] = {}; target = target[key]; }
      });
    }
    function event(type, data) {
      if (type === 'cancel' || type === 'auth_revoked') throw Error('A sessão online expirou ou perdeu acesso. Peça um novo PIN.');
      if (type !== 'put' && type !== 'patch') return;
      var value = JSON.parse(data);
      if (typeof value.path !== 'string' || value.path.length > 300) throw Error('Dados online inválidos.');
      if (type === 'put') apply(value.path, value.data);
      else { if (!value.data || typeof value.data !== 'object') throw Error('Dados online inválidos.'); Object.keys(value.data).forEach(function (key) { apply(value.path.replace(/\/$/, '') + '/' + key, value.data[key]); }); }
      if (!cache || cache.left) { close(true); return; }
      if (!owner && cache.accepted) open();
      mail(cache[owner ? 'guestMail' : 'hostMail']);
    }
    async function listen() {
      stream = new root.AbortController();
      try {
        var response = await root.fetch(url(''), { headers: { Accept: 'text/event-stream' }, signal: stream.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (!response.ok || !response.body) throw Error('Não foi possível receber a partida. Confira as regras do Firebase.');
        var reader = response.body.getReader(), decoder = new root.TextDecoder(), buffer = '';
        while (status !== 'closed') {
          var part = await reader.read(); if (part.done) throw Error('A conexão com a partida foi interrompida. Peça um novo PIN.');
          buffer += decoder.decode(part.value, { stream: true }).replace(/\r/g, '');
          if (buffer.length > LIMIT * 3) throw Error('Dados online grandes demais.');
          var end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            var block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            var type = '', data = []; block.split('\n').forEach(function (line) { if (line.indexOf('event:') === 0) type = line.slice(6).trim(); if (line.indexOf('data:') === 0) data.push(line.slice(5).trimStart()); });
            event(type, data.join('\n'));
          }
        }
      } catch (error) { if (status !== 'closed') fail(error); }
    }
    function begin() {
      heardAt = Date.now(); listen();
      tick = setInterval(function () {
        if (status !== 'open') return;
        if (Date.now() - heardAt > 15000) { fail(Error('A conexão com o outro jogador caiu. Peça um novo PIN.')); return; }
        if (!writing && (queue.length || Date.now() - sentAt >= 2000)) flush();
      }, 100);
      // The anonymous token lasts an hour. A bounded session avoids silently changing player identity.
      lifetime = setTimeout(function () { fail(Error('A sessão de 45 minutos terminou. Crie outra sala para continuar.')); }, LIFETIME);
    }
    async function offer() {
      if (status !== 'new') throw Error('Esta conexão já foi iniciada.');
      status = 'connecting'; owner = true;
      try { user = await auth.login(LIFETIME + 60000); if (status === 'closed') throw Error('Conexão cancelada.'); id = random(); await write('', 'PUT', { owner: user.uid, createdAt: { '.sv': 'timestamp' } }); if (status === 'closed') throw Error('Conexão cancelada.'); begin(); return encode(id, user.uid, 'offer'); }
      catch (error) { fail(error); throw error; }
    }
    async function answer(code) {
      var offer = decode(code, 'offer'); if (status !== 'new') throw Error('Esta conexão já foi iniciada.');
      status = 'connecting'; id = offer.id;
      try {
        user = await auth.login(LIFETIME + 60000); if (status === 'closed') throw Error('Conexão cancelada.');
        var host = await write('/owner', 'GET'); if (host !== offer.uid || host === user.uid) throw Error('Convite inválido ou usado no próprio navegador.');
        await write('/guest', 'PUT', user.uid); if (status === 'closed') throw Error('Conexão cancelada.'); begin(); return encode(id, user.uid, 'answer');
      } catch (error) { fail(error); throw error; }
    }
    async function accept(code) {
      var reply = decode(code, 'answer'); if (!owner || status !== 'connecting' || reply.id !== id) throw Error('Resposta online inválida.');
      try { if (await write('/guest', 'GET') !== reply.uid) throw Error('Jogador do convite inválido.'); await write('/accepted', 'PUT', true); open(); }
      catch (error) { fail(error); throw error; }
    }
    function send(message) {
      if (status !== 'open') return false;
      try {
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw Error('Mensagem online inválida.');
        var copy = JSON.parse(JSON.stringify(message));
        if (copy.type === 'state' || copy.type === 'input') queue = queue.filter(function (item) { return item.type !== copy.type; });
        if (queue.length >= 256 || JSON.stringify(queue.concat([copy])).length > LIMIT - 1024) return false;
        queue.push(copy); return true;
      } catch (error) { emit('onError', error); return false; }
    }
    async function flush() {
      writing = true; var messages = queue; queue = []; sentAt = Date.now();
      try { await write(owner ? '/hostMail' : '/guestMail', 'PUT', { seq: ++sent, payload: JSON.stringify(messages) }); }
      catch (error) { if (status !== 'closed') fail(error); }
      finally { writing = false; }
    }
    return link;
  }
  return Object.freeze({ create: create, decode: decode });
}));
