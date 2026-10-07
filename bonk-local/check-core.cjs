/* Run with Node.js: node check-core.cjs. No npm install required. */
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const Core = require('./core.js');
const copy = x => JSON.parse(JSON.stringify(x));
function map(mode = 'classic') {
  return { version: 1, id: 'check', name: 'Physics checks', width: 1000, height: 700, gravity: 1, mode,
    bodies: [{ id: 'floor', shape: 'rect', x: 500, y: 600, w: 960, h: 30, friction: .3, restitution: .1 },
      { id: 'left', shape: 'rect', x: 20, y: 350, w: 20, h: 500 }, { id: 'right', shape: 'rect', x: 980, y: 350, w: 20, h: 500 }],
    spawns: [{ x: 200, y: 500, team: 1 }, { x: 800, y: 500, team: 2 }],
    goals: [{ x: 80, y: 550, w: 80, h: 80, team: 1 }, { x: 920, y: 550, w: 80, h: 80, team: 2 }], zones: [], joints: [] };
}
function run(g, count, inputs) { for (let t = 0; t < count; t++) g.step(typeof inputs === 'function' ? inputs(t) : inputs); return g.state(); }
function player(s, id = 'p1') { return s.players.find(p => p.id === id); }

// Falling body reaches its floor without tunnelling, held movement and heavy differ.
const one = { countdownTicks: 0, players: [{ id: 'p1' }], seed: 42 };
const normal = Core.create(map(), one), heavy = Core.create(map(), one);
let floorState = run(normal, 240);
assert(player(floorState).alive);
assert(Math.abs(player(floorState).y - (585 - Core.PARAMS.radius)) < 2, 'disc must settle above floor');
run(normal, 30, { p1: { right: true } });
run(heavy, 240);
run(heavy, 30, { p1: { right: true, heavy: true } });
assert(player(normal.state()).x - 200 > (player(heavy.state()).x - 200) * 1.5, 'heavy must reduce manoeuvrability');
const beforeJump = player(normal.state()).y;
run(normal, 10, { p1: { up: true } });
assert(player(normal.state()).y < beforeJump - 20, 'up at contact must jump');

// A fast editable body must hit even a 1-pixel platform instead of crossing it.
const fastMap = map(); fastMap.height = 6000; fastMap.gravity = 0;
fastMap.bodies = [{ id: 'thin', shape: 'rect', x: 500, y: 5000, w: 900, h: 1, restitution: 0 },
  { id: 'fast', shape: 'circle', x: 500, y: 4500, r: 4, type: 'dynamic', restitution: 0, linearVelocity: { x: 0, y: 10000 } }];
const fast = Core.create(fastMap, one);
run(fast, 20);
const fastBody = fast.state().bodies.find(b => b.id === 'fast');
assert(fastBody.y <= 4996 && fastBody.y >= 4993, 'continuous collision must stop a fast body above the thin platform');

// Replay includes seeded bots, map joints, impulses, projectiles and contact caches.
for (const mode of Core.MODES) {
  const options = { countdownTicks: 4, players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }, ...Array.from({ length: 6 }, (_, i) => ({ id: 'b' + i, bot: true, team: i % 2 + 1 }))], seed: 5419, roundsToWin: 2, roundTimeTicks: 480 };
  const a = Core.create(map(mode), options), b = Core.create(map(mode), options);
  const input = t => ({ p1: { right: t % 160 < 80, left: t % 160 >= 80, up: t % 80 < 20, heavy: t % 91 < 18, special: t % 100 < 65 }, p2: { left: t % 150 < 60, up: t % 61 < 10, special: t % 123 < 65 } });
  run(a, 300, input);
  b.restore(copy(a.snapshot()));
  assert.deepEqual(b.state(), a.state(), mode + ': restored state must be exact on this runtime');
  for (let t = 300; t < 420; t++) { a.step(input(t)); b.step(input(t)); }
  assert.deepEqual(b.state(), a.state(), mode + ': restored evolution must remain exact');
  a.restartRound(); b.restore(copy(a.snapshot()));
  assert.deepEqual(b.state(), a.state(), mode + ': manual round restart must replay');
  assert(a.state().players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), mode + ': finite state with eight players');
}

// Special modes trigger distinct gameplay, rather than reusing Classic under another name.
const arrowMap = map('deatharrows'); arrowMap.gravity = 0;
arrowMap.spawns = [{ x: 200, y: 300 }, { x: 500, y: 300 }];
const death = Core.create(arrowMap, { ...one, players: [{ id: 'p1' }, { id: 'p2' }], roundsToWin: 1 });
run(death, 72, { p1: { special: true, right: true } });
assert(player(death.state()).charge > .99);
assert(Math.abs(player(death.state()).x - 200) < .01, 'aiming must disable movement');
death.step({ p1: {} });
assert(death.state().projectiles.length === 1, 'release must shoot');
run(death, 60);
assert.equal(death.state().matchWinner, 'p1', 'death arrow must eliminate and finish match');

const grapple = Core.create(map('grapple'), one);
run(grapple, 1, { p1: { special: true } });
assert(player(grapple.state()).grapple, 'grapple must attach to a platform');
run(grapple, 1);
assert.equal(player(grapple.state()).grapple, null, 'release must detach');

const flight = Core.create(map('vtol'), one);
const flightY = player(flight.state()).y;
run(flight, 30, { p1: { up: true } });
assert(player(flight.state()).y < flightY, 'both VTOL thrusters must overcome gravity');
const turn = Core.create(map('vtol'), one);
run(turn, 20, { p1: { right: true } });
assert(Math.abs(player(turn.state()).angle) > 5, 'single thruster must rotate disc');

const footballMap = map('football'); footballMap.ballSpawn = { x: 920, y: 550 };
const football = Core.create(footballMap, { ...one, roundsToWin: 1, players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }] });
football.step({});
assert.equal(football.state().matchWinner, 'team1', 'goal scores for opposing team');
assert.equal(football.state().teamScores[1], 1);

// Team-filtered editor zones must affect the requested team only.
const zoneMap = map(); zoneMap.gravity = 0;
zoneMap.zones.push({ x: 500, y: 500, w: 1000, h: 100, lethal: true, team: 2 });
const zoneGame = Core.create(zoneMap, { ...one, players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }] });
zoneGame.step({});
assert(player(zoneGame.state()).alive);
assert(!player(zoneGame.state(), 'p2').alive);
assert.equal(zoneGame.state().winner, 'p1');

// Each new physics world checkpoints its scores/RNG, bounding replay RAM per round.
const sessionOptions = { ...one, roundTimeTicks: 25, countdownTicks: 2 };
const session = Core.create(map('grapple'), sessionOptions);
run(session, 18000, { p1: { special: true } });
const checkpoint = copy(session.snapshot());
assert(checkpoint.commands.length <= 25 + 2 + Core.PARAMS.roundOverTicks, 'session history must stay bounded per round');
assert(checkpoint.base.round > 50, 'long session must cross many round checkpoints');
const resumed = Core.create(map('grapple'), sessionOptions);
resumed.restore(checkpoint);
assert.deepEqual(resumed.state(), session.state(), 'checkpoint replay must preserve tick, round, RNG and physics');
const invalidCheckpoint = copy(checkpoint); invalidCheckpoint.base.tick = -1;
assert.throws(() => resumed.restore(invalidCheckpoint), /checkpoint/);
assert.deepEqual(resumed.state(), session.state(), 'invalid checkpoint must not change the running match');
for (let t = 0; t < 240; t++) { session.step({ p1: { right: true, special: true } }); resumed.step({ p1: { right: true, special: true } }); }
assert.deepEqual(resumed.state(), session.state(), 'checkpoint replay must evolve exactly across another round');
const beforeInvalidTick = copy(resumed.snapshot()), invalidTick = copy(checkpoint); invalidTick.state.tick++;
assert.throws(() => resumed.restore(invalidTick), /command log/);
assert.deepEqual(resumed.state(), beforeInvalidTick.state, 'invalid snapshot tick must preserve the running state');
assert.deepEqual(resumed.snapshot(), beforeInvalidTick, 'invalid snapshot tick must preserve history, scores and RNG too');
football.restartRound();
const rematch = Core.create(footballMap, { ...one, roundsToWin: 1, players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }] });
rematch.restore(copy(football.snapshot()));
assert.deepEqual(rematch.state(), football.state(), 'new match checkpoint must reset all scores');
assert.equal(rematch.state().teamScores[1], 0);
assert.throws(() => Core.create(map(), { players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }), /two humans/);
assert.throws(() => Core.create(map(), { players: Array.from({ length: 7 }, (_, i) => ({ id: 'b' + i, bot: true })) }), /six bots/);

// Concave map geometry and a motor joint must remain stable.
const jointMap = map();
jointMap.bodies.push({ id: 'anchor', shape: 'circle', x: 500, y: 270, r: 12, type: 'static' }, { id: 'rotor', shape: 'rect', x: 500, y: 300, w: 140, h: 20, type: 'dynamic' },
  { id: 'concave', shape: 'polygon', x: 350, y: 530, points: [[-60, -20], [60, -20], [60, 20], [0, 0], [-60, 20]] });
jointMap.joints.push({ type: 'revolute', bodyA: 'anchor', bodyB: 'rotor', x: 500, y: 300, enableMotor: true, motorSpeed: 1, maxMotorTorque: 100 });
const joints = Core.create(jointMap, one); run(joints, 120);
assert(Math.abs(joints.state().bodies.find(b => b.id === 'rotor').angle) > 10);

const start = performance.now();
for (const mode of Core.MODES) {
  const g = Core.create(map(mode), { countdownTicks: 0, players: [{ id: 'p1' }, { id: 'p2' }, ...Array.from({ length: 6 }, (_, i) => ({ id: 'b' + i, bot: true }))], seed: 19, roundTimeTicks: 600 });
  const seen = new Set();
  for (let t = 0; t < 1800; t++) { g.step({}); g.state().events.forEach(e => seen.add(e.type)); }
  assert(g.state().round > 1 || g.state().phase === 'matchover', mode + ': complete round lifecycle');
  if (mode === 'arrows' || mode === 'deatharrows') assert(seen.has('shoot'), mode + ': bots use arrows');
  if (mode === 'grapple') assert(seen.has('grapple'), mode + ': bots use grapple');
  if (mode === 'football') assert(seen.has('kick'), mode + ': bots kick football');
}
console.log('PASS: floor/CCD, heavy control, jump, six modes, bots, 8 participants, scoring, map geometry/joints and exact same-runtime snapshot/replay.');
console.log('Desktop Node simulation benchmark (including state snapshots): 10,800 ticks / ' + ((performance.now() - start) / 1000).toFixed(2) + ' s. This is not a Chromebook measurement.');

// Editor logic runs without a DOM; actual clicks/layout still need browser QA.
global.BonkMaps = require('./maps.js');
require('./historical-maps.js');
assert.equal(global.BonkMaps.maps.length, 26, 'complete local and imported catalogue must load');
assert.equal(new Set(global.BonkMaps.maps.map(m => m.id)).size, 26, 'catalogue IDs must be unique');
const fullRoster = [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }, ...Array.from({ length: 6 }, (_, i) => ({ id: 'b' + i, bot: true, team: i % 2 + 1 }))];
for (const original of global.BonkMaps.maps) {
  const arena = global.BonkMaps.validate(copy(original));
  assert.deepEqual(global.BonkMaps.validate(copy(arena)), arena, original.id + ': JSON round trip must preserve supported map fields');
  const game = Core.create(arena, { players: fullRoster, seed: 5427, countdownTicks: 0 });
  for (let t = 0; t < 600; t++) {
    game.step({ p1: { right: t % 120 < 60, up: t % 80 < 10, special: t % 100 < 75 }, p2: { left: t % 120 < 60, up: t % 90 < 10, heavy: t % 60 < 12 } });
    const state = game.state();
    for (const object of [...state.players, ...state.bodies, ...state.projectiles, ...(state.ball ? [state.ball] : [])]) {
      assert([object.x, object.y, object.angle == null ? 0 : object.angle].every(Number.isFinite), original.id + ': simulation must remain finite at full participant load');
    }
  }
}
for (const mode of Core.MODES) assert(global.BonkMaps.maps.some(m => m.mode === mode), mode + ': catalogue must cover all six modes');
console.log('PASS: all 26 catalogue entries validate, survive JSON round trip and simulate 600 ticks with two humans plus six bots.');
require('./editor.js');
console.log(global.BonkEditor.selfCheck());
console.log('PASS: team zone filtering, bounded 18,000-tick session replay and score reset after match.');
