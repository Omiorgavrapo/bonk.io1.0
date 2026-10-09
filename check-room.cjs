/* Run with Node.js: node check-room.cjs. Controller checks use real maps/physics. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./core.js'), Maps = require('./maps.js');
const source = fs.readFileSync(require.resolve('./lan-room.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
let now = 1000, nextLink = 1;
const codes = new Map(), queue = [];
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
    performance: { now: () => now }, RTCPeerConnection: function () {}, BonkCore: Core, BonkMaps: Maps,
    BonkLAN: { create(callbacks) { const link = createLink(callbacks); links.push(link); return link; } } };
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
  host.element('lanAnswerInput').value = guest.element('lanAnswer').value;
  await host.element('lanAccept').onclick(); pump();
  assert(guest.room.active()); assert.equal(guest.links.at(-1).status, 'open');
}
function step(host, delta = .05) { now += delta * 1000; host.room.update(delta, {}); pump(); }
function player(host, id) { return host.room.state().players.find(value => value.id === id); }

async function main() {
  const host = client('Host'), one = client('One'), two = client('Two'), late = client('Late');
  host.room.host(); assert.equal(host.room.playerId(), 'h1');
  configure(host, 'lanHumans', 5); assert.equal(host.element('lanBots').value, 0);
  configure(host, 'lanHumans', 6); assert(host.room.active()); assert.equal(host.element('lanHumans').value, 5);
  await connect(host, one); await connect(host, two);
  assert.equal(one.room.playerId(), 'g1'); assert.equal(two.room.playerId(), 'g2');
  configure(host, 'lanHumans', 1);
  assert.equal(host.element('lanHumans').value, 5, 'Invalid configuration must retain all existing players');
  assert(one.room.active() && two.room.active());
  host.room.start(); pump();
  for (const c of [host, one, two]) assert.equal(c.room.state().players.length, 3);
  assert.equal(host.element('lanStart').disabled, true);
  for (let i = 0; i < 41; i++) step(host);
  assert.equal(host.room.state().phase, 'playing');

  one.links.at(-1).send({ type: 'input', id: 'g2', seq: 100, mask: 2 }); pump();
  one.links.at(-1).send({ type: 'input', seq: 101, mask: 1 }); pump();
  step(host); assert.equal(player(host, 'g1').controls.right, true); assert.equal(player(host, 'g2').controls.right, false);
  one.links.at(-1).send({ type: 'input', seq: 100, mask: 1 }); pump();
  step(host); assert.equal(player(host, 'g1').controls.right, true, 'Old sequences and fast duplicate input cannot change commands');
  one.links.at(-1).send({ type: 'input', seq: 102, mask: 64 }); pump();
  step(host, .401); assert.equal(player(host, 'g1').controls.right, false, 'Idle input must release after 400 ms');
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
  console.log('Room checks passed: capacity, settings, input ownership/sequence/rate/TTL, late joining, disconnects, match completion, fresh matches, score validation and failed start delivery.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
