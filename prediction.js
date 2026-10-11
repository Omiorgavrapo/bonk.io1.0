/* Local physics prediction; authoritative snapshots acknowledge and replace speculative work. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.BonkPrediction = factory(root.BonkCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  var dt = Core.PARAMS.dt, LIMIT = 90, keys = ['left', 'right', 'up', 'down', 'heavy', 'special'];
  function create(initial, id) {
    if (!initial.players.some(function (p) { return p.id === id; })) return null;
    var game = Core.create(initial.map, { players: initial.players, rules: initial.rules, prediction: true });
    var frames = [], accumulator = 0, latest, authoritative, offset = { x: 0, y: 0 }, ballOffset = { x: 0, y: 0 }, projectileOffsets = {}, ack = -1, ackTicks = 0;
    function own(value) { return value.players.find(function (p) { return p.id === id; }); }
    function inputs(commands) { var value = {}; authoritative.players.forEach(function (p) { value[p.id] = p.id === id ? commands : p.controls; }); return value; }
    function reconcile(value) {
      var player = own(value), old = latest && own(latest), reset = !authoritative || authoritative.round !== value.round || authoritative.phase !== value.phase || own(authoritative).alive !== player.alive;
      if (!Number.isSafeInteger(player.inputSeq) || player.inputSeq < -1 || !Number.isSafeInteger(player.inputTicks) || player.inputTicks < 0) throw Error('Confirmação de comandos inválida.');
      if (!reset && player.inputSeq < ack) throw Error('Confirmação de comandos fora de ordem.');
      var oldBall = latest && latest.ball;
      var oldShots = latest ? latest.projectiles.filter(function (a) { return a.owner === id; }).map(function (a) { var correction = projectileOffsets[a.id] || { x: 0, y: 0 }; return Object.assign({}, a, { x: a.x + correction.x, y: a.y + correction.y }); }) : [];
      if (reset) { frames = []; accumulator = 0; offset.x = offset.y = ballOffset.x = ballOffset.y = 0; }
      else {
        var consumed = player.inputSeq === ack ? Math.max(0, player.inputTicks - ackTicks) : player.inputTicks;
        frames = frames.filter(function (frame) { if (frame.seq < player.inputSeq) return false; if (frame.seq === player.inputSeq && consumed-- > 0) return false; return true; });
      }
      ack = player.inputSeq; ackTicks = player.inputTicks; authoritative = value; game.correct(value);
      frames.forEach(function (frame) { game.step(inputs(frame.commands)); }); latest = game.state();
      if (!reset && old) {
        var next = own(latest), x = old.x + offset.x - next.x, y = old.y + offset.y - next.y;
        if (Math.hypot(x, y) <= Math.max(120, player.radius * 6)) { offset.x = x; offset.y = y; }
        else offset.x = offset.y = 0;
      }
      if (!reset && oldBall && latest.ball) {
        var bx = oldBall.x + ballOffset.x - latest.ball.x, by = oldBall.y + ballOffset.y - latest.ball.y;
        if (Math.hypot(bx, by) <= 120) { ballOffset.x = bx; ballOffset.y = by; } else ballOffset.x = ballOffset.y = 0;
      }
      projectileOffsets = {};
      if (!reset) latest.projectiles.filter(function (a) { return a.owner === id; }).forEach(function (a) {
        var before = oldShots.find(function (b) { return b.id === a.id; }) || oldShots.find(function (b) { return Math.abs(b.age - a.age) < 30 && Math.hypot(b.x - a.x, b.y - a.y) <= 120; });
        if (before && Math.hypot(before.x - a.x, before.y - a.y) <= 120) { projectileOffsets[a.id] = { x: before.x - a.x, y: before.y - a.y }; oldShots.splice(oldShots.indexOf(before), 1); }
      });
    }
    function update(delta, commands, seq) {
      var decay = Math.exp(-Math.max(0, delta) / .1); offset.x *= decay; offset.y *= decay; ballOffset.x *= decay; ballOffset.y *= decay;
      Object.keys(projectileOffsets).forEach(function (key) { projectileOffsets[key].x *= decay; projectileOffsets[key].y *= decay; });
      if (authoritative.phase !== 'playing' || !own(authoritative).alive) return;
      accumulator += Math.max(0, Math.min(.15, delta));
      while (accumulator >= dt) {
        accumulator -= dt;
        // shortcut: stop after 1.5 seconds without useful acknowledgements; longer outages need a working transport, not more guessed physics.
        if (frames.length >= LIMIT) { accumulator = 0; break; }
        var input = {}; keys.forEach(function (key) { input[key] = !!commands[key]; });
        frames.push({ seq: seq, commands: input }); game.step(inputs(input));
      }
      latest = game.state();
    }
    function state(view) {
      if (!latest || !view || view.phase !== 'playing') return view;
      var p = own(latest), confirmed = own(view); if (!confirmed || !confirmed.alive) return view;
      var result = Object.assign({}, view);
      result.players = view.players.map(function (player) {
        if (player.id !== id) return player;
        return Object.assign({}, player, { x: p.x + offset.x, y: p.y + offset.y, angle: p.angle, aim: p.aim, charge: p.charge, cooldown: p.cooldown, heavy: p.heavy, heavyStrength: p.heavyStrength, grapple: p.grapple, predicted: true });
      });
      result.projectiles = view.projectiles.filter(function (a) { return a.owner !== id; }).concat(latest.projectiles.filter(function (a) { return a.owner === id; }).map(function (a) { var correction = projectileOffsets[a.id] || { x: 0, y: 0 }; return Object.assign({}, a, { x: a.x + correction.x, y: a.y + correction.y, predicted: true }); }));
      if (latest.ball) result.ball = Object.assign({}, latest.ball, { x: latest.ball.x + ballOffset.x, y: latest.ball.y + ballOffset.y, predicted: true });
      return result;
    }
    reconcile(initial);
    return { reconcile: reconcile, update: update, state: state };
  }
  return { create: create };
}));
