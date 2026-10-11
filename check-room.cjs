/* Run with Node.js: node check-room.cjs. Controller checks use real maps/physics. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./core.js'), Maps = require('./maps.js');
const source = fs.readFileSync(require.resolve('./lan-room.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
let now = 1000, nextLink = 1;
const codes = new Map(), queue = [], invitations = new Map();
let nextPin = 1;
function signalling() {
  let owned, closed = false;
  return {
    async publish(code) { owned = String(nextPin++).padStart(8, '0'); invitations.set(owned, { code }); return { pin: owned }; },
    waitForAnswer(pin) { return new Promise((resolve, reject) => Object.assign(invitations.get(pin), { resolve, reject })); },
    async offer(pin) { const value = invitations.get(pin); if (!value || value.used) throw Error('Invalid PIN'); return value.code; },
    async answer(pin, code) { const value = invitations.get(pin); if (!value || value.used) throw Error('Used PIN'); value.used = true; value.resolve(code); },
    close() { if (closed) return; closed = true; const value = invitations.get(owned); if (value) { if (!value.used && value.reject) value.reject(Error('Cancelled')); invitations.delete(owned); } }
  };
}
function pump() {
  while (queue.length) {
    const item = queue.shift();
    if (item.link.status === 'open') item.link.callbacks.onMessage(item.link, item.value);
  }
}
function createLink(callbacks) {
  const link = { callbacks, status: 'new', sent: [], id: nextLink++,
    async offer() { link.status = 'connecting'; codes.set('offer-' + link.id, link); return 'offer-' + link.id; },
    async answer(code) {
      const other = codes.get(code); if (!other) throw Error('Invalid offer');
      link.partner = other; other.partner = link; link.status = 'connecting';
      codes.set('answer-' + link.id, link); return 'answer-' + link.id;
    },
    async accept(code) {
      assert.equal(codes.get(code), link.partner);
      link.status = link.partner.status = 'open';
      callbacks.onOpen(link); link.partner.callbacks.onOpen(link.partner);
    },
    send(value) {
      if (link.status !== 'open' || link.blocked) return false;
      link.sent.push(copy(value)); queue.push({ link: link.partner, value: copy(value) }); return true;
    },
    close() {
      if (link.status === 'closed') return;
      link.status = 'closed'; callbacks.onClose(link);
      if (link.partner && link.partner.status !== 'closed') link.partner.close();
    }
  };
  return link;
}
const quick = Maps.validate(Object.assign(copy(Maps.maps[0]), { id: 'check-final', name: 'Quick final',
  spawns: [{ x: 500, y: 300 }, ...Array.from({ length: 4 }, () => ({ x: 500, y: 6800 }))] }));
function client(name) {
  const elements = new Map(), links = [], calls = { errors: [], games: [], lobby: 0, exit: 0 };
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, value: '', disabled: false, hidden: false,
      textContent: '', innerHTML: '', focus() {}, select() {} });
    return elements.get(id);
  }
  const context = { document: { getElementById: element }, window: { addEventListener() {} },
    performance: { now: () => now }, RTCPeerConnection: function () {}, BonkCore: Core, BonkPrediction: require('./prediction.js'), BonkMaps: Maps, setTimeout, clearTimeout,
    BonkOptions: { mount(container, prefix, change) { container.changeRules = change; return { set(value, disabled) { container.rules = copy(value); container.rulesDisabled = disabled; } }; } },
    BonkPIN: { create: signalling, parse(value) { assert.match(value, /^\d{8}$/); return value; } },
    BonkOnline: { create(callbacks) { const link = createLink(callbacks); links.push(link); return link; } } };
  vm.runInNewContext(source, context);
  const room = context.BonkRoom;
  room.init({ profile: () => ({ name, color: '#123456', skin: 'face' }), maps: () => [Maps.maps[0], quick],
    onError: message => calls.errors.push(message), onEvent() {}, onGame: state => calls.games.push(copy(state)),
    onLobby: () => calls.lobby++, onExit: () => calls.exit++ });
  return { room, element, links, calls };
}
function configure(host, id, value) { host.element(id).value = value; host.element(id).onchange({ target: host.element(id) }); pump(); }
async function connect(host, guest) {
  await host.element('lanInvite').onclick();
  guest.room.join(); guest.element('lanOfferInput').value = host.element('lanOffer').value;
  await guest.element('lanJoin').onclick();
  await new Promise(resolve => setImmediate(resolve)); pump();
  assert(guest.room.active()); assert.equal(guest.links.at(-1).status, 'open');
}
function step(host, delta = .05) { now += delta * 1000; host.room.update(delta, {}); pump(); }
function player(host, id) { return host.room.state().players.find(value => value.id === id); }

async function main() {
  const host = client('Host'), one = client('One'), two = client('Two'), late = client('Late');
  host.room.host(); assert.equal(host.room.playerId(), 'h1');
  configure(host, 'lanHumans', 5); assert.equal(host.element('lanBots').value, 0);
  configure(host, 'lanHumans', 6); assert(host.room.active()); assert.equal(host.element('lanHumans').value, 5);
  const rules = { gravity: .8, playerSize: 1.5, shotSpeed: 1.7, shotLifetime: 2.3 };
  host.element('onlinePhysics').changeRules(rules);
  await connect(host, one); await connect(host, two);
  assert.deepEqual(one.element('onlinePhysics').rules, rules, 'Guest must receive all host physics settings');
  assert.equal(one.element('onlinePhysics').rulesDisabled, true, 'Only the host can change rules');
  one.element('onlinePhysics').changeRules(Core.normalizeRules()); pump();
  assert.deepEqual(host.element('onlinePhysics').rules, rules, 'Guest cannot replace host rules');
  assert.equal(one.room.playerId(), 'g1'); assert.equal(two.room.playerId(), 'g2');
  configure(host, 'lanHumans', 1);
  assert.equal(host.element('lanHumans').value, 5, 'Invalid configuration must retain all existing players');
  assert(one.room.active() && two.room.active());
  host.room.start(); pump();
  const packedStart = host.links[0].sent.findLast(value => value.type === 'start');
  assert(packedStart.state.bodies.every(body => Object.keys(body).sort().join(',') === 'angle,id,spin,vx,vy,x,y'), 'Repeated map definitions must be omitted from live packets');
  for (const c of [host, one, two]) assert.equal(c.room.state().players.length, 3);
  for (const c of [host, one, two]) { assert.deepEqual(c.room.state().rules, rules); assert(c.room.state().players.every(p => p.radius === 24)); }
  assert.equal(host.element('lanStart').disabled, true);
  for (let i = 0; i < 41; i++) step(host);
  assert.equal(host.room.state().phase, 'playing');

  one.links.at(-1).send({ type: 'input', id: 'g2', seq: 100, mask: 2 }); pump();
  one.links.at(-1).send({ type: 'input', seq: 101, mask: 1 }); pump();
  step(host); assert.equal(player(host, 'g1').controls.right, true); assert.equal(player(host, 'g2').controls.right, false);
  one.links.at(-1).send({ type: 'input', seq: 100, mask: 1 }); pump();
  step(host); assert.equal(player(host, 'g1').controls.right, true, 'Old sequences and fast duplicate input cannot change commands');
  one.links.at(-1).send({ type: 'input', seq: 102, mask: 64 }); pump();
  step(host, 1.201); assert.equal(player(host, 'g1').controls.right, false, 'Idle input must release after 1200 ms');
  one.links.at(-1).send({ type: 'input', seq: 102, mask: 1 }); pump();
  step(host); assert.equal(player(host, 'g1').controls.left, true);

  await connect(host, late);
  assert.equal(late.room.playerId(), 'g3'); assert(!late.room.state().players.some(p => p.id === 'g3'), 'A midgame join must spectate');
  two.links.at(-1).close(); pump();
  assert.equal(host.room.state(), null); assert.equal(one.room.state(), null); assert.equal(late.room.state(), null);
  assert(host.room.active() && one.room.active() && late.room.active()); assert.equal(two.room.active(), false);
  configure(host, 'lanRounds', 1); configure(host, 'lanMap', quick.id);
  host.room.start(); pump();
  assert(late.room.state().players.some(p => p.id === 'g3'), 'The late join must play in the next match');
  for (let i = 0; i < 41; i++) step(host);
  assert.equal(host.room.state().phase, 'matchover');
  assert.equal(host.element('lanStart').disabled, false); assert.equal(host.element('lanMap').disabled, false);
  assert.equal(host.element('lanHumans').disabled, false, 'Match completion must unlock room configuration');
  configure(host, 'lanMap', Maps.maps[0].id);
  host.room.start(); pump(); assert.equal(late.room.state().phase, 'countdown');

  const fourth = client('Fourth'), fifth = client('Fifth');
  await connect(host, fourth); await connect(host, fifth);
  assert.equal(fourth.room.playerId(), 'g2'); assert.equal(fifth.room.playerId(), 'g4');
  assert.equal(host.element('lanInvite').disabled, true);
  const count = host.links.length; await host.element('lanInvite').onclick(); assert.equal(host.links.length, count, 'Capacity is five including the host');
  const full = host.links.at(-1).sent.findLast(value => value.type === 'room');
  assert.equal(full.players.length, 5); assert.equal(full.humans + full.bots, 5);

  const start = host.links[0].sent.findLast(value => value.type === 'start');
  const angleBefore = copy(host.links[0].sent.findLast(value => value.type === 'state').state);
  angleBefore.tick += 6;
  angleBefore.players.find(p => p.id === 'h1').aim = 3.05;
  angleBefore.players.find(p => p.id === 'h1').cooldown = .9;
  angleBefore.projectileSerial = 1;
  angleBefore.projectiles = [{ id: 'arrow1', owner: 'h1', x: 200, y: 300, angle: 3.05, vx: 200, vy: 0, spin: 0, age: 1, charge: .5 }];
  host.links[0].send({ type: 'state', match: start.match, seq: 9000, state: angleBefore }); pump(); now += 100;
  const angleAfter = copy(angleBefore); angleAfter.tick += 6; angleAfter.players.find(p => p.id === 'h1').aim = -3.05;
  angleAfter.players.find(p => p.id === 'h1').cooldown = .1; angleAfter.projectiles[0].angle = -3.05;
  host.links[0].send({ type: 'state', match: start.match, seq: 9001, state: angleAfter }); pump(); now += 50;
  const smooth = one.room.state();
  assert(Math.abs(smooth.players.find(p => p.id === 'h1').aim - Math.PI) < 1e-6, 'Remote aim must cross the angle boundary without reversing');
  assert(Math.abs(smooth.projectiles[0].angle - Math.PI) < 1e-6, 'Guest projectile must not spin backward at the angle boundary');
  assert(Math.abs(smooth.players.find(p => p.id === 'h1').cooldown - .5) < 1e-6, 'Remote cooldown ring must interpolate smoothly');
  angleAfter.players.find(p => p.id === 'h1').cooldown = .9;
  host.links[0].send({ type: 'state', match: start.match, seq: 9002, state: angleAfter }); pump();
  assert.equal(one.room.state().players.find(p => p.id === 'h1').cooldown, .9, 'A new reload must appear immediately');
  const jitter = copy(angleAfter);
  for (const [index, interval] of [20, 85, 30, 170, 45].entries()) {
    const beforePacket = one.room.state().players.find(p => p.id === 'h1');
    jitter.tick += 3; jitter.players.find(p => p.id === 'h1').x += 25;
    host.links[0].send({ type: 'state', match: start.match, seq: 9010 + index, state: copy(jitter) }); pump();
    const afterPacket = one.room.state().players.find(p => p.id === 'h1');
    assert.equal(afterPacket.x, beforePacket.x, 'An early/late packet must not jump directly to the previous raw snapshot');
    now += interval;
  }
  const inputCount = one.links.at(-1).sent.length;
  one.room.update(.001, { left: true }); pump();
  assert(one.links.at(-1).sent.length > inputCount && one.links.at(-1).sent.at(-1).type === 'input', 'Changed controls must be sent on the first frame');
  const forged = copy(host.room.state()); delete forged.map;
  forged.scores.g1 = '</b><img src=x onerror=alert(1)>';
  host.links[0].send({ type: 'state', match: start.match, seq: 999999, state: forged }); pump();
  assert.equal(one.room.active(), false, 'Untrusted score HTML must be rejected before the HUD');
  assert(host.room.active());
  host.room.end(); pump();
  for (const c of [host, late, fourth, fifth]) { assert.equal(c.room.active(), false); assert.equal(c.room.state(), null); }
  const slowHost = client('Slow host'), slowGuest = client('Slow guest');
  slowHost.room.host(); await connect(slowHost, slowGuest);
  slowHost.links[0].blocked = true;
  assert.doesNotThrow(() => slowHost.room.start()); pump();
  assert.equal(slowHost.room.state(), null, 'An undelivered start must abort the match');
  assert(slowHost.room.active()); assert.equal(slowGuest.room.active(), false);
  assert(slowHost.calls.errors.some(message => /enviar|começou/.test(message)), 'Control delivery failure must be visible');
  slowHost.room.end();
  const cancelledHost = client('Cancelled'); cancelledHost.room.host();
  await cancelledHost.element('lanInvite').onclick(); const expired = cancelledHost.element('lanOffer').value;
  await cancelledHost.element('lanInvite').onclick(); assert(!invitations.has(expired), 'A fresh invitation invalidates the old PIN');
  cancelledHost.room.end(); await new Promise(resolve => setImmediate(resolve)); assert.equal(invitations.size, 0);
  console.log('Room checks passed: automatic PIN handshake, cancellation, capacity, settings, input ownership/sequence/rate/TTL, late joining, disconnects, match completion, fresh matches, score validation and failed start delivery.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
