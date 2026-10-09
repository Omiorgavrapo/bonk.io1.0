/* Behavioral physics checks: node check-rules.cjs. No DOM or network. */
'use strict';
const assert = require('node:assert/strict');
const Core = require('./core.js');
const defaults = Core.normalizeRules();
assert.deepEqual(defaults, { gravity: 1, playerSize: 1, shotSpeed: 1, shotLifetime: 5 });
for (const bad of [null, [], { other: 1 }, { gravity: NaN }, { gravity: Infinity }, { playerSize: 0 }, { shotSpeed: '2' }, { shotLifetime: 16 }]) assert.throws(() => Core.normalizeRules(bad));
function arena(mode = 'arrows') { return { id: 'rules-check', version: 1, width: 6000, height: 6000, gravity: 1, mode, bodies: [], spawns: [{ x: 1000, y: 2000 }], goals: [], zones: [], joints: [] }; }
function create(rules, map = arena()) { return Core.create(map, { countdownTicks: 0, players: [{ id: 'p1' }], rules }); }
function run(game, ticks, input) { for (let t = 0; t < ticks; t++) game.step({ p1: input || {} }); return game.state(); }
function player(game) { return game.state().players[0]; }
const zero = create({ gravity: 0 }), down = create({ gravity: 1 }), up = create({ gravity: -1 });
run(zero, 30); run(down, 30); run(up, 30);
assert(Math.abs(player(zero).y - 2000) < 1e-8, 'Zero gravity must float');
assert(player(down).y > 2050 && player(up).y < 1950, 'Signed gravity must change actual acceleration');
const floor = arena('classic'); floor.spawns[0].y = 500;
floor.bodies = [{ id: 'floor', shape: 'rect', x: 1000, y: 600, w: 2000, h: 30 }];
for (const size of [.5, 1, 2]) {
  const game = create({ playerSize: size }, floor); run(game, 240);
  assert.equal(player(game).radius, Core.PARAMS.radius * size);
  assert(Math.abs(player(game).y - (585 - 16 * size)) < 2, 'Size must change collision shape, not just graphics');
}
const football = create({ playerSize: 2 }, arena('football'));
assert.equal(football.state().ball.r, Core.PARAMS.ballRadius, 'Football ball must keep its radius');
const turn = create({ gravity: 0 }); let previous = player(turn).aim, total = 0;
for (let tick = 0; tick < 180; tick++) {
  run(turn, 1, { special: true, right: true }); const next = player(turn).aim;
  total += Math.atan2(Math.sin(next - previous), Math.cos(next - previous)); previous = next;
}
assert(total > Math.PI * 4, 'Aim must pass two complete clockwise rotations');
run(turn, 180, { special: true, left: true });
assert(Math.abs(player(turn).aim) < 1e-9, 'Counterclockwise aim must return continuously');
assert(Math.abs(player(turn).x - 1000) < 1e-8, 'Aiming must not move the player');
run(turn, 1); assert(player(turn).cooldown > .9);
const beforeCooldownAim = player(turn).aim; run(turn, 10, { special: true, right: true });
assert(player(turn).aim > beforeCooldownAim + .7, 'Aim must remain usable while reloading');
assert.equal(player(turn).charge, 0, 'Reloading must not charge a second shot');
run(turn, 44, { special: true }); assert.equal(player(turn).cooldown, 0);
run(turn, 1, { special: true }); assert(player(turn).charge > 0, 'Charging resumes after reload');
function shoot(speed = 1, lifetime = 5, gravity = 0) {
  const game = create({ gravity, shotSpeed: speed, shotLifetime: lifetime });
  run(game, 72, { special: true }); run(game, 1); return game;
}
const slow = shoot(.5), fast = shoot(2);
let a = slow.state().projectiles[0].x, b = fast.state().projectiles[0].x;
run(slow, 6); run(fast, 6);
assert(Math.abs((fast.state().projectiles[0].x - b) / (slow.state().projectiles[0].x - a) - 4) < .001, 'Shot speed must scale actual travel');
const short = shoot(1, .2); run(short, 10); assert.equal(short.state().projectiles.length, 1);
run(short, 1); assert.equal(short.state().projectiles.length, 0, 'Lifetime must expire at 12 ticks including the shot tick');
const curved = shoot(1, 5, 1); run(curved, 30);
const old = curved.state().projectiles[0]; run(curved, 1); const next = curved.state().projectiles[0];
const direction = Math.atan2(next.y - old.y, next.x - old.x);
assert(Math.abs(direction - next.angle) < .01, 'Flying arrow must follow its curved velocity');
for (const mode of Core.MODES) {
  const map = arena(mode), options = { countdownTicks: 0, rules: { gravity: -.3, playerSize: 1.6, shotSpeed: 2.1, shotLifetime: 1.2 }, players: [{ id: 'p1' }, { id: 'p2' }, ...Array.from({ length: 6 }, (_, i) => ({ id: 'b' + i, bot: true }))] };
  const game = Core.create(map, options); run(game, 180, { special: true, right: true });
  const restored = Core.create(map, options); restored.restore(game.snapshot());
  assert.deepEqual(restored.state(), game.state(), mode + ': custom rules must replay exactly');
  run(game, 120); run(restored, 120); assert.deepEqual(restored.state(), game.state());
  assert(game.state().players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
}
console.log('PASS: validated custom rules; signed gravity; actual disc collisions; unchanged Football ball; continuous 360° aiming in both directions and during reload; shot speed/lifetime/trajectory; exact custom-rules replay in six modes with eight players.');
global.BonkMaps = require('./maps.js'); require('./historical-maps.js');
for (const map of global.BonkMaps.maps) for (const rules of [
  { gravity: 3, playerSize: .5, shotSpeed: 3, shotLifetime: .2 },
  { gravity: -3, playerSize: 2, shotSpeed: .25, shotLifetime: 15 }
]) {
  const game = Core.create(map, { countdownTicks: 0, rules, players: [{ id: 'p1' }, { id: 'p2' }, ...Array.from({ length: 6 }, (_, i) => ({ id: 'b' + i, bot: true }))] });
  for (let t = 0; t < 360; t++) {
    game.step({ p1: { special: t % 100 < 75, right: true }, p2: { up: true, left: true } });
    const state = game.state();
    assert([...state.players, ...state.bodies, ...state.projectiles, ...(state.ball ? [state.ball] : [])].every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.angle || 0)), map.id + ': finite physics at allowed extremes');
  }
}
console.log('PASS: 26 maps at both allowed rule extremes, eight participants, 360 ticks per configuration.');
