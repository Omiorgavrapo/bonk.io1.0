/* online room: the host runs physics, each connection owns one player's commands. */
(function (global) {
  'use strict';
  var options, room = null, guest = null, pending = null, peers = [], current = null, previous = null, receivedAt = 0, localGame = null, accumulator = 0, sendClock = 0, inputClock = 0, sequence = 0, lastSequence = -1, match = 0, nextCommands = {};
  var actions = ['left', 'right', 'up', 'down', 'heavy', 'special'], rulesUI;
  function $(id) { return document.getElementById(id); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fail(error) { options.onError(error.message || String(error)); }
  function profile(raw, id) {
    if (!raw || typeof raw !== 'object' || typeof id !== 'string' || !/^(h1|g[1-4]|b[1-4])$/.test(id) || typeof raw.name !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.color || '') || ['plain', 'face', 'stripe', 'star', 'ring'].indexOf(raw.skin) < 0) throw Error('Perfil online inválido.');
    return { id: id, name: raw.name.trim().slice(0, 24) || 'Player', color: raw.color, skin: raw.skin, team: id === 'h1' ? 1 : Number(id.slice(1)) % 2 + 1, bot: false };
  }
  function players() { return room ? [room.owner].concat(peers.filter(function (p) { return p.player; }).map(function (p) { return p.player; })) : []; }
  function packet() { return { type: 'room', humans: room.humans, bots: room.bots, rounds: room.rounds, rules: room.rules, mapId: room.map.id, map: room.map, players: players(), catalogue: room.maps.map(function (m) { return { id: m.id, name: m.name, author: m.author, mode: m.mode }; }), running: !!localGame }; }
  function send(peer, value) {
    if (peer.link.send(value)) return true;
    if (value.type !== 'state' && value.type !== 'events') { fail(Error('Não foi possível enviar os dados da sala. Reduza o mapa ou gere um novo convite.')); peer.link.close(); }
    return false;
  }
  function broadcast(value) {
    var failed = [];
    peers.slice().forEach(function (p) { if (p.player && !p.link.send(value) && value.type !== 'state' && value.type !== 'events') failed.push(p); });
    if (failed.length) { fail(Error('Não foi possível enviar os dados da sala. Reduza o mapa ou gere um novo convite.')); failed.forEach(function (p) { p.link.close(); }); }
    return !failed.length;
  }
  function publishRoom() { if (!room || !room.host) return; var value = packet(); render(value); broadcast(value); }
  function render(value) {
    var slots = value.players.map(function (p) { return '<li><span class="lan-dot" style="background:' + p.color + '"></span><div><strong>' + escape(p.name) + '</strong><small>' + (p.id === 'h1' ? 'Dono da sala' : 'Conectado') + '</small></div><span class="lan-player-tag">' + (p.id === room.id ? 'VOCÊ' : 'PRONTO') + '</span></li>'; });
    for (var i = value.players.length; i < value.humans; i++) slots.push('<li class="lan-empty"><span class="lan-dot">+</span><div><strong>Vaga livre</strong><small>Aguardando um jogador</small></div></li>');
    for (var b = 0; b < value.bots; b++) slots.push('<li class="lan-bot"><span class="lan-dot">B</span><div><strong>Bot ' + (b + 1) + '</strong><small>Entra na partida</small></div><span class="lan-player-tag">BOT</span></li>');
    $('lanPlayers').innerHTML = slots.join('');
    $('lanSummary').textContent = value.players.length + '/' + value.humans + ' humanos';
    $('lanMap').innerHTML = value.catalogue.map(function (m) { return '<option value="' + escape(m.id) + '">' + escape(m.name) + ' · ' + escape(m.author) + '</option>'; }).join('');
    $('lanMap').value = value.mapId; $('lanHumans').value = value.humans; $('lanBots').value = value.bots; $('lanRounds').value = value.rounds;
    var owner = room && room.host;
    rulesUI.set(value.rules, !owner || value.running && (!current || current.phase !== 'matchover'));
    $('lanDetails').hidden = false; $('lanStart').hidden = !owner;
    if (value.map && options.onPreview) options.onPreview(value.map);
    ['lanHumans', 'lanBots', 'lanRounds', 'lanMap'].forEach(function (id) { $(id).disabled = !owner || value.running && (!current || current.phase !== 'matchover'); });
    $('lanInvite').disabled = !owner || value.players.length >= value.humans;
    $('lanStart').disabled = !owner || value.running && current && current.phase !== 'matchover';
    $('lanStart').textContent = value.running ? 'Nova partida →' : 'Iniciar partida →';
    $('lanReturn').hidden = !current;
  }
  function lobby(reason) {
    current = previous = localGame = null; accumulator = 0;
    if (room && room.host) { broadcast({ type: 'lobby', reason: reason || '' }); publishRoom(); }
    options.onLobby(); if (reason) options.onError(reason);
  }
  function drop(peer) {
    if (peer.signal) peer.signal.close();
    clearTimeout(peer.connectTimer);
    var existed = peers.indexOf(peer) >= 0;
    peers = peers.filter(function (p) { return p !== peer; });
    if (pending === peer) { pending = null; $('lanOffer').value = ''; $('lanCopy').disabled = true; }
    if (!room || !room.host || !existed) return;
    if (localGame && peer.player && current.players.some(function (p) { return p.id === peer.id; })) lobby(peer.player.name + ' saiu. O dono pode iniciar outra partida.');
    else publishRoom();
  }
  function link(peer, isOwner) {
    return BonkOnline.create({
      onOpen: function (connection) {
        if (!room) { connection.close(); return; }
        clearTimeout(peer.connectTimer);
        if (isOwner) { if (peer.signal) peer.signal.close(); peer.openedAt = performance.now(); }
        else { if (!send(peer, { type: 'hello', profile: options.profile() })) return; $('lanStatus').textContent = 'Conectado. Aguardando a sala…'; }
      },
      onClose: function () {
        if (isOwner) drop(peer);
        else if (guest === peer) end('Conexão com o dono encerrada. Peça um novo PIN para reconectar.');
      },
      onError: function (_, error) { fail(error); },
      onMessage: function (connection, message) {
        try {
          if (!room || !message || typeof message.type !== 'string') return;
          if (isOwner) {
            if (message.type === 'hello' && !peer.player) {
              if (players().length >= room.humans) { connection.send({ type: 'closed', reason: 'Sala sem vagas humanas.' }); connection.close(); return; }
              peer.player = profile(message.profile, peer.id); peer.lastInput = performance.now(); peer.commands = {}; pending = null;
              if (!send(peer, { type: 'welcome', id: peer.id })) return; publishRoom();
              if (current) { var state = copy(current); delete state.map; if (!send(peer, { type: 'start', match: match, map: current.map, state: state })) return; }
              $('lanStatus').textContent = peer.player.name + (players().length < room.humans ? ' entrou! Gere outro PIN para o próximo jogador.' : ' entrou! Pode iniciar a partida.');
              $('lanOffer').value = ''; $('lanCopy').disabled = true;
            } else if (message.type === 'input' && peer.player) {
              if (!Number.isInteger(message.mask) || message.mask < 0 || message.mask > 63 || !Number.isSafeInteger(message.seq) || message.seq < 0 || message.seq <= (peer.sequence == null ? -1 : peer.sequence)) return;
              var now = performance.now();
              if (now - (peer.lastMessage || 0) < 10) return;
              peer.lastMessage = now; peer.lastInput = now; peer.sequence = message.seq;
              peer.commands = {}; actions.forEach(function (a, i) { peer.commands[a] = !!(message.mask & (1 << i)); });
            }
          } else receive(message);
        } catch (error) { fail(error); connection.close(); }
      }
    });
  }
  function validState(state, map) {
    if (!state || !Number.isSafeInteger(state.tick) || state.tick < 0 || !Array.isArray(state.players) || state.players.length > 5 || !Array.isArray(state.bodies) || state.bodies.length > 300 || !Array.isArray(state.projectiles) || state.projectiles.length > 300 || !state.scores || !state.teamScores || !Array.isArray(state.events)) throw Error('Estado online inválido.');
    state.rules = BonkCore.normalizeRules(state.rules);
    [state.players, state.bodies, state.projectiles, state.ball ? [state.ball] : []].forEach(function (list) { list.forEach(function (p) { if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.angle != null && !Number.isFinite(p.angle)) throw Error('Posição online inválida.'); }); });
    var ids = {};
    state.players.forEach(function (p) {
      profile(p, p.id); if (ids[p.id] || !Number.isInteger(state.scores[p.id]) || state.scores[p.id] < 0 || state.scores[p.id] > 20) throw Error('Placar online inválido.'); ids[p.id] = true;
      p.radius = BonkCore.PARAMS.radius * state.rules.playerSize; p.alive = p.alive === true; p.heavyStrength = Number.isFinite(p.heavyStrength) ? Math.max(0, Math.min(1, p.heavyStrength)) : 1;
      p.aim = Number.isFinite(p.aim) ? p.aim : 0; p.charge = Number.isFinite(p.charge) ? Math.max(0, Math.min(1, p.charge)) : 0;
      p.cooldown = Number.isFinite(p.cooldown) ? Math.max(0, Math.min(1, p.cooldown)) : 0;
      if (p.grapple && (!Number.isFinite(p.grapple.x) || !Number.isFinite(p.grapple.y))) throw Error('Gancho online inválido.');
    });
    [1, 2].forEach(function (team) { if (!Number.isInteger(state.teamScores[team]) || state.teamScores[team] < 0 || state.teamScores[team] > 20) throw Error('Placar de times online inválido.'); });
    if (!map || state.bodies.length !== map.bodies.length) throw Error('Geometria online inválida.');
    state.bodies = state.bodies.map(function (body, i) { if (body.id !== map.bodies[i].id) throw Error('Corpo online inválido.'); return Object.assign({}, map.bodies[i], { x: body.x, y: body.y, angle: body.angle }); });
    if (state.ball) state.ball.r = BonkCore.PARAMS.ballRadius;
    if (['countdown', 'playing', 'roundover', 'matchover'].indexOf(state.phase) < 0 || BonkCore.MODES.indexOf(state.mode) < 0) throw Error('Partida online inválida.');
    return state;
  }
  function receive(message) {
    if (message.type === 'welcome') {
      if (!/^g[1-4]$/.test(message.id)) throw Error('Identificação online inválida.'); room.id = message.id; $('lanStatus').textContent = 'Conectado à sala. Aguarde o dono iniciar.';
      $('lanJoin').disabled = true; $('lanOfferInput').disabled = true; $('lanTitle').textContent = 'Você está na sala';
    } else if (message.type === 'room') {
      if (!Array.isArray(message.players) || message.players.length > 5 || !Array.isArray(message.catalogue) || message.catalogue.length > 200 || !Number.isInteger(message.humans) || message.humans < 1 || message.humans > 5 || !Number.isInteger(message.bots) || message.bots < 0 || message.humans + message.bots > 5 || !Number.isInteger(message.rounds) || message.rounds < 1 || message.rounds > 20) throw Error('Configuração online inválida.');
      message.players = message.players.map(function (p) { return profile(p, p.id); });
      message.rules = BonkCore.normalizeRules(message.rules);
      message.map = BonkMaps.validate(message.map); if (message.map.id !== message.mapId) throw Error('Mapa da sala inválido.');
      room.info = message; render(message);
    } else if (message.type === 'start') {
      var map = BonkMaps.validate(message.map);
      if (!Number.isSafeInteger(message.match) || message.match < 1) throw Error('Partida online inválida.');
      var state = validState(message.state, map); if (state.mode !== map.mode) throw Error('Modo online inválido.');
      state.map = map; match = message.match; lastSequence = -1; current = state; previous = null; receivedAt = performance.now(); options.onGame(state);
    } else if (message.type === 'state' && current && message.match === match) {
      if (!Number.isSafeInteger(message.seq) || message.seq <= lastSequence) return;
      var next = validState(message.state, current.map); next.map = current.map;
      if (next.tick < current.tick || next.mode !== current.mode) return;
      previous = current; current = next; receivedAt = performance.now(); lastSequence = message.seq;
    } else if (message.type === 'events' && message.match === match && Array.isArray(message.events) && message.events.length <= 30) {
      message.events.forEach(function (e) { if (e && ['hit', 'shoot', 'goal', 'eliminate', 'round', 'start', 'grapple'].indexOf(e.type) >= 0) options.onEvent(e.type, Number.isFinite(e.intensity) ? Math.max(0, Math.min(1, e.intensity)) : 1); });
    } else if (message.type === 'lobby') { lobby(String(message.reason || '').slice(0, 160)); }
    else if (message.type === 'closed') end(String(message.reason || 'Sala encerrada.').slice(0, 160));
  }
  function end(reason) {
    if (room && room.host) broadcast({ type: 'closed', reason: reason || 'O dono encerrou a sala.' });
    var closing = peers.slice(); if (guest) closing.push(guest); if (pending && closing.indexOf(pending) < 0) closing.push(pending);
    room = guest = pending = current = previous = localGame = null; peers = []; accumulator = inputClock = sendClock = 0; nextCommands = {};
    closing.forEach(function (p) { if (p.signal) p.signal.close(); clearTimeout(p.connectTimer); p.link.close(); }); options.onExit(); if (reason) options.onError(reason);
  }
  function begin(owner) {
    if (room) end();
    if (typeof BonkOnline === 'undefined') { fail(Error('Extraia a pasta inteira do jogo atualizado, incluindo online.js.')); return false; }
    room = { host: owner, id: owner ? 'h1' : null }; sequence = 0; lastSequence = -1;
    $('lanHost').hidden = !owner; $('lanGuest').hidden = owner; $('lanDetails').hidden = !owner; $('lanStart').hidden = !owner;
    $('lanTitle').textContent = owner ? 'Sua sala' : 'Entre na sala';
    $('lanStatus').textContent = owner ? 'Sala criada. Convide um amigo para começar.' : 'Pronto para receber seu PIN.';
    ['lanOffer', 'lanOfferInput'].forEach(function (id) { $(id).value = ''; });
    $('lanCopy').disabled = true; $('lanJoin').disabled = false; $('lanOfferInput').disabled = false;
    $('lanPlayers').innerHTML = ''; $('lanSummary').textContent = '';
    options.onLobby(); return true;
  }
  function host() {
    if (!begin(true)) return;
    room.owner = profile(options.profile(), 'h1'); room.maps = options.maps().slice(0, 200); room.map = room.maps[0]; room.humans = 3; room.bots = 2; room.rounds = 3; room.rules = BonkCore.normalizeRules(); publishRoom();
  }
  function join() {
    if (!begin(false)) return;
    ['lanHumans', 'lanBots', 'lanRounds', 'lanMap', 'lanStart', 'lanInvite'].forEach(function (id) { $(id).disabled = true; }); $('lanReturn').hidden = true;
  }
  function configure(event) {
    if (!room || !room.host || localGame && current.phase !== 'matchover') return;
    var humans = Math.floor(Number($('lanHumans').value)), bots = Math.floor(Number($('lanBots').value)), rounds = Math.floor(Number($('lanRounds').value));
    if (!Number.isInteger(humans) || humans < Math.max(1, players().length) || humans > 5 || !Number.isInteger(bots) || bots < 0 || bots > 4 || !Number.isInteger(rounds) || rounds < 1 || rounds > 20) { publishRoom(); fail(Error('Escolha de 1 a 5 humanos, de 0 a 4 bots e de 1 a 20 vitórias.')); return; }
    if (humans + bots > 5) { if (event.target.id === 'lanHumans') bots = 5 - humans; else humans = 5 - bots; }
    if (humans < players().length) { publishRoom(); fail(Error('Há mais humanos conectados do que as vagas escolhidas.')); return; }
    var map = room.maps.find(function (m) { return m.id === $('lanMap').value; });
    room.humans = humans; room.bots = bots; room.rounds = rounds; if (map) room.map = map;
    if (localGame) { localGame = current = previous = null; broadcast({ type: 'lobby', reason: '' }); }
    publishRoom();
  }
  async function invite() {
    if (!room || !room.host || players().length >= room.humans) return;
    var signal;
    try { signal = BonkPIN.create(global.BonkOnlineConfig); } catch (error) { fail(error); $('lanStatus').textContent = 'Ative os convites seguindo FIREBASE.md.'; return; }
    if (pending) { var old = pending; pending = null; peers = peers.filter(function (p) { return p !== old; }); old.signal.close(); old.link.close(); }
    var used = players().map(function (p) { return p.id; }), id = ['g1', 'g2', 'g3', 'g4'].find(function (value) { return used.indexOf(value) < 0; });
    var peer = { id: id, commands: {}, lastInput: 0, signal: signal }; peer.link = link(peer, true); peers.push(peer); pending = peer;
    $('lanInvite').disabled = true; $('lanCopy').disabled = true; $('lanOffer').value = ''; $('lanStatus').textContent = 'Criando seu PIN…';
    try {
      var code = await peer.link.offer(); if (pending !== peer) return;
      var invitation = await signal.publish(code); if (pending !== peer) return;
      $('lanOffer').value = invitation.pin; $('lanCopy').disabled = false;
      $('lanStatus').textContent = 'PIN pronto. Aguardando seu amigo entrar…';
      signal.waitForAnswer(invitation.pin).then(async function (answerCode) {
        if (pending !== peer) return;
        await peer.link.accept(answerCode); if (pending !== peer) return;
        $('lanStatus').textContent = 'Encontramos seu amigo. Conectando…';
        if (peer.link.status !== 'open') peer.connectTimer = setTimeout(function () {
          if (!peer.player) { peer.link.close(); fail(Error('A rede não permitiu conectar. Confira a internet e publique as regras atualizadas do Firebase.')); }
        }, 30000);
      }).catch(function (error) {
        if (pending !== peer) return;
        peer.link.close(); $('lanStatus').textContent = 'Não conectou. Gere outro PIN.'; fail(error);
      });
    }
    catch (error) { if (pending === peer) { peer.link.close(); fail(error); $('lanStatus').textContent = 'Não foi possível criar o PIN. Tente novamente.'; } }
    finally { if (room && room.host) $('lanInvite').disabled = players().length >= room.humans; }
  }
  async function answer() {
    if (!room || room.host) return;
    var signal, pin;
    try { pin = BonkPIN.parse($('lanOfferInput').value); signal = BonkPIN.create(global.BonkOnlineConfig); } catch (error) { fail(error); return; }
    if (guest) { var old = guest; guest = null; old.signal.close(); clearTimeout(old.connectTimer); old.link.close(); }
    var peer = { signal: signal }; peer.link = link(peer, false); guest = peer; $('lanJoin').disabled = true; $('lanStatus').textContent = 'Encontrando a sala…';
    try {
      var offerCode = await signal.offer(pin); if (guest !== peer) return;
      var code = await peer.link.answer(offerCode); if (guest !== peer) return;
      await signal.answer(pin, code); if (guest !== peer) return;
      signal.close();
      if (peer.link.status !== 'open') {
        $('lanStatus').textContent = 'Conectando à sala…';
        peer.connectTimer = setTimeout(function () {
          if (guest === peer && peer.link.status !== 'open') end('Não foi possível conectar. Confira sua internet e peça outro PIN.');
        }, 30000);
      }
    }
    catch (error) { if (guest === peer) { guest = null; signal.close(); peer.link.close(); fail(error); $('lanStatus').textContent = 'Confira o PIN e tente novamente.'; } }
    finally { if (room && !room.host) $('lanJoin').disabled = !!(guest && guest.link.status === 'open'); }
  }
  function start() {
    if (!room || !room.host || localGame && current.phase !== 'matchover') return;
    try {
      var roster = players(), colors = ['#82b18d', '#d1ab6f', '#9e88ba', '#71adb6'];
      for (var i = 0; i < room.bots; i++) roster.push({ id: 'b' + (i + 1), name: 'Bot ' + (i + 1), color: colors[i], skin: 'face', team: i % 2 + 1, bot: true });
      var map = BonkMaps.validate(room.map); localGame = BonkCore.create(map, { players: roster, seed: Date.now() >>> 0, roundsToWin: room.rounds, rules: room.rules });
      match++; current = localGame.state(); accumulator = sendClock = 0; nextCommands = {};
      var state = copy(current); delete state.map; if (!broadcast({ type: 'start', match: match, map: map, state: state })) { lobby('A partida não começou. Reduza o mapa ou refaça a conexão.'); return; } publishRoom(); if (current) options.onGame(current);
    } catch (error) { fail(error); }
  }
  function update(delta, commands) {
    if (!room) return;
    nextCommands = commands || {}; inputClock += delta;
    if (room.host) {
      var now = performance.now(); peers.slice().forEach(function (p) { if (!p.player && p.openedAt && now - p.openedAt > 5000) p.link.close(); });
      if (!localGame || current.phase === 'matchover') return;
      accumulator += Math.min(.15, delta); sendClock += delta;
      while (accumulator >= BonkCore.PARAMS.dt) {
        var inputs = { h1: nextCommands }; peers.forEach(function (p) { if (p.player) inputs[p.id] = now - p.lastInput < 1200 ? p.commands : {}; });
        localGame.step(inputs); current = localGame.state();
        if (current.events.length) { broadcast({ type: 'events', match: match, events: current.events }); current.events.forEach(function (e) { options.onEvent(e.type, e.intensity); }); }
        accumulator -= BonkCore.PARAMS.dt;
      }
      if (sendClock >= .1 || current.phase === 'matchover') { sendClock = 0; var state = copy(current); delete state.map; state.events = []; broadcast({ type: 'state', match: match, seq: sequence++, state: state }); if (current.phase === 'matchover') publishRoom(); }
    } else if (guest && guest.link.status === 'open' && room.id && inputClock >= .1) {
      inputClock = 0; var mask = 0; actions.forEach(function (a, i) { if (nextCommands[a]) mask |= 1 << i; }); guest.link.send({ type: 'input', seq: sequence++, mask: mask });
    }
  }
  function state() {
    if (!current || room && room.host || !previous || previous.round !== current.round || previous.phase !== current.phase) return current;
    var alpha = Math.max(0, Math.min(1, (performance.now() - receivedAt) / 100)), view = Object.assign({}, current);
    function angle(from, to) { return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * alpha; }
    ['players', 'bodies', 'projectiles'].forEach(function (key) {
      var older = {}; previous[key].forEach(function (p) { older[p.id] = p; });
      view[key] = current[key].map(function (p) {
        var before = older[p.id]; if (!before || before.alive !== p.alive) return p;
        var value = Object.assign({}, p), fields = key === 'players' ? ['x', 'y', 'angle', 'aim', 'charge', 'cooldown'] : ['x', 'y', 'angle'];
        fields.forEach(function (k) { if (k === 'cooldown' && p[k] > before[k]) return; if (Number.isFinite(before[k]) && Number.isFinite(p[k])) value[k] = k === 'aim' || key === 'projectiles' && k === 'angle' ? angle(before[k], p[k]) : before[k] + (p[k] - before[k]) * alpha; });
        return value;
      });
    });
    if (previous.ball && current.ball) view.ball = Object.assign({}, current.ball, { x: previous.ball.x + (current.ball.x - previous.ball.x) * alpha, y: previous.ball.y + (current.ball.y - previous.ball.y) * alpha });
    return view;
  }
  function init(value) {
    options = value;
    rulesUI = BonkOptions.mount($('onlinePhysics'), 'online', function (rules) {
      if (!room || !room.host || localGame && current.phase !== 'matchover') return;
      room.rules = BonkCore.normalizeRules(rules); if (localGame) { localGame = current = previous = null; broadcast({ type: 'lobby', reason: '' }); } publishRoom();
    }, options.onError);
    $('lanInvite').onclick = invite; $('lanJoin').onclick = function (event) { if (event) event.preventDefault(); return answer(); }; $('lanStart').onclick = start; $('lanEnd').onclick = function () { end(); };
    $('lanJoinForm').onsubmit = function (event) { event.preventDefault(); return answer(); };
    $('lanOfferInput').oninput = function () { this.value = this.value.replace(/[^0-9]/g, '').slice(0, 8); };
    $('lanCopy').onclick = async function () {
      $('lanOffer').focus(); $('lanOffer').select();
      try { await navigator.clipboard.writeText($('lanOffer').value); $('lanStatus').textContent = 'PIN copiado. Mande para seu amigo.'; }
      catch (_) { $('lanStatus').textContent = 'PIN selecionado. Pressione Ctrl+C para copiar.'; }
    };
    $('lanReturn').onclick = function () { if (current) options.onGame(state()); };
    ['lanHumans', 'lanBots', 'lanRounds', 'lanMap'].forEach(function (id) { $(id).onchange = configure; });
    $('lanOffer').onclick = function () { this.select(); };
    window.addEventListener('beforeunload', function () { if (room) end(); });
  }
  global.BonkRoom = { init: init, host: host, join: join, start: start, update: update, state: state, active: function () { return !!room; }, isHost: function () { return !!room && room.host; }, playerId: function () { return room && room.id; }, showLobby: function () { if (room) options.onLobby(); }, end: end };
}(typeof globalThis !== 'undefined' ? globalThis : this));
