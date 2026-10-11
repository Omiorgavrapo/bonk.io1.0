'use strict';
const assert = require('node:assert/strict');
const Core = require('./core.js'), Prediction = require('./prediction.js'), Maps = require('./maps.js');
const copy = value => JSON.parse(JSON.stringify(value));
const dt = Core.PARAMS.dt;
const map = Maps.validate({ id: 'prediction-check', name: 'Prediction check', author: 'QA', mode: 'classic', width: 1000, height: 700, gravity: 1,
  bodies: [{ id: 'floor', shape: 'rect', type: 'static', x: 500, y: 500, w: 1000, h: 40 }], spawns: [{ x: 750, y: 450 }, { x: 400, y: 450 }], zones: [], joints: [], goals: [] });
const players = [{ id: 'h1', name: 'Host', color: '#123456' }, { id: 'g1', name: 'Guest', color: '#654321' }];
function make(mode = 'classic', rules) { return Core.create({ ...copy(map), mode }, { players, countdownTicks: 0, rules }); }
function own(state) { return state.players.find(p => p.id === 'g1'); }
function packet(game, seq = -1, ticks = 0) { const state = game.state(); state.players.forEach(p => Object.assign(p, { inputSeq: p.id === 'g1' ? seq : -1, inputTicks: p.id === 'g1' ? ticks : 0 })); return state; }
function step(game, n, command) { for (let i = 0; i < n; i++) game.step({ g1: command || {} }); }
function close(a, b, message, tolerance = .25) { assert(Math.abs(a - b) < tolerance, `${message}: ${a} / ${b}`); }

const server = make(); step(server, 120);
const initial = packet(server), predicted = Prediction.create(initial, 'g1');
assert.equal(Prediction.create(initial, 'g2'), null, 'Spectators must not invent a playable disc');
predicted.update(.1, { right: true }, 0);
assert(own(predicted.state(initial)).x > own(initial).x + 1, 'Movement must respond before any host packet arrives');
assert.equal(own(initial).x, own(packet(server)).x, 'Prediction cannot mutate the host');
step(server, 2, { right: true });
let authoritative = packet(server, 0, 2);
const displayed = own(predicted.state(initial));
predicted.reconcile(authoritative);
close(own(predicted.state(authoritative)).x, displayed.x, 'A normal reconciliation must preserve the displayed position', .000001);
step(server, 2, { right: true }); authoritative = packet(server, 0, 4); predicted.reconcile(authoritative);
predicted.update(.05, { right: true }, 0);
step(server, 2, { right: true }); authoritative = packet(server, 0, 6); predicted.reconcile(authoritative);
const reference = make(); step(reference, 120); step(reference, 9, { right: true });
close(own(predicted.state(authoritative)).x, own(reference.state()).x, 'Cumulative acknowledgements must discard each frame once');
close(own(predicted.state(authoritative)).y, own(reference.state()).y, 'Replayed movement must collide with the floor');
const corrected = copy(authoritative); own(corrected).x += 20;
const beforeCorrection = own(predicted.state(authoritative)).x;
predicted.reconcile(corrected);
close(own(predicted.state(corrected)).x, beforeCorrection, 'A small host correction must not teleport on receipt', .000001);
const exact = Core.create(map, { players, prediction: true }); exact.correct(corrected);
step(exact, 3, { right: true });
const initialError = Math.abs(beforeCorrection - own(exact.state()).x);
predicted.update(.001, {}, 1);
assert(Math.abs(own(predicted.state(corrected)).x - own(exact.state()).x) < initialError, 'Residual correction must decay over time');

for (const mode of Core.MODES) {
  const host = make(mode, { gravity: 0, playerSize: 1.5, shotSpeed: 1.7, shotLifetime: .2 });
  const start = packet(host), client = Prediction.create(start, 'g1');
  client.update(.1, { right: true, up: true }, 0);
  step(host, 6, { right: true, up: true });
  const expected = packet(host, 0, 6);
  close(own(client.state(start)).x, own(expected).x, mode + ' horizontal prediction');
  close(own(client.state(start)).y, own(expected).y, mode + ' vertical prediction');
  client.reconcile(expected);
  assert.deepEqual(client.state(expected).scores, expected.scores, 'Scores remain authoritative');
}

const arrows = make('arrows', { gravity: 0, shotLifetime: 5 });
step(arrows, 75, { special: true });
const charged = packet(arrows), shooter = Prediction.create(charged, 'g1');
shooter.update(dt, {}, 0);
assert.equal(shooter.state(charged).projectiles.filter(a => a.owner === 'g1').length, 1, 'Shot release must draw a projectile immediately without a host reply');
assert.equal(arrows.state().projectiles.length, 0, 'A predicted projectile cannot affect the host');
step(arrows, 1); const shotConfirmed = packet(arrows, 0, 1); shooter.reconcile(shotConfirmed);
assert.equal(shooter.state(shotConfirmed).projectiles.length, 1, 'Acknowledged shots must not duplicate');
shooter.reconcile(shotConfirmed);
assert.equal(shooter.state(shotConfirmed).projectiles.length, 1, 'A repeated acknowledgement must not refire a shot');
const shiftedShot = copy(shotConfirmed); shiftedShot.projectiles[0].x += 20;
const shotBeforeCorrection = shooter.state(shotConfirmed).projectiles[0].x;
shooter.reconcile(shiftedShot);
close(shooter.state(shiftedShot).projectiles[0].x, shotBeforeCorrection, 'A small projectile correction must preserve its displayed position', .000001);
shooter.update(.001, {}, 0);
assert(Math.abs(shooter.state(shiftedShot).projectiles[0].x - shiftedShot.projectiles[0].x) < 20, 'A projectile correction must converge toward the host');
const gone = copy(shotConfirmed); gone.projectiles = []; shooter.reconcile(gone);
assert.equal(shooter.state(gone).projectiles.length, 0, 'The host can remove a speculative projectile');

const dead = copy(corrected); own(dead).alive = false; predicted.reconcile(dead);
assert.equal(own(predicted.state(dead)).alive, false, 'The host confirms death, not a visual guess');
const nextRound = copy(initial); nextRound.round++; predicted.reconcile(nextRound);
close(own(predicted.state(nextRound)).x, own(nextRound).x, 'A new round clears commands and correction offsets', .000001);
const stalled = Prediction.create(initial, 'g1');
for (let i = 0; i < 25; i++) stalled.update(.1, { right: true }, i);
const frozen = own(stalled.state(initial)).x;
stalled.update(.15, { right: true }, 26);
assert.equal(own(stalled.state(initial)).x, frozen, 'An outage must bound speculative work and memory');

const football = Core.create({ ...copy(map), mode: 'football', spawns: [{ x: 750, y: 450, team: 1 }, { x: 400, y: 450, team: 2 }], ballSpawn: { x: 435, y: 450 } }, { players, countdownTicks: 0, rules: { gravity: 0 } });
const beforeKick = packet(football), kicker = Prediction.create(beforeKick, 'g1'); kicker.update(dt, { heavy: true }, 0);
assert(kicker.state(beforeKick).ball.x > beforeKick.ball.x, 'Football kicks must predict the ball before host confirmation');
assert.equal(football.state().ball.x, beforeKick.ball.x, 'A predicted kick cannot mutate the host ball');
step(football, 1, { heavy: true }); const kicked = packet(football, 0, 1); kicker.reconcile(kicked);
close(kicker.state(kicked).ball.x, kicked.ball.x, 'The predicted ball must reconcile with the confirmed kick');

const unsafe = copy(initial); own(unsafe).vx = Infinity;
const physics = Core.create(map, { players, prediction: true }); physics.correct(initial);
const intact = physics.state(); assert.throws(() => physics.correct(unsafe)); assert.deepEqual(physics.state(), intact, 'Invalid motion must be rejected before changing physics');
const started = performance.now();
for (const entry of Maps.maps) {
  const game = Core.create(entry, { players, countdownTicks: 0 });
  const state = packet(game), client = Prediction.create(state, 'g1');
  for (let i = 0; i < 10; i++) { client.update(.05, { right: true }, i); step(game, 3, { right: true }); client.reconcile(packet(game, i, 3)); }
}
console.log('PASS: immediate local movement, shots and Football kicks; replay/acknowledgements; collision physics in six modes; smooth player/projectile correction; host-only scores/death; bounded outages; validation and 26 maps.');
console.log('Desktop prediction benchmark, 260 corrections + local steps across 26 maps: ' + (performance.now() - started).toFixed(0) + ' ms. Not a Chromebook measurement.');
