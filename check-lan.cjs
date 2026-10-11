/* Run with Node.js: node check-lan.cjs. No npm install required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const LAN = require('./lan.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
let nextPeer = 1;
const peers = new Map();

function sdp(id, candidates = true) {
  return 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' +
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
    'a=ice-ufrag:fake\r\na=ice-pwd:fakepassword\r\na=fingerprint:sha-256 AB:CD\r\n' +
    (candidates ? 'a=candidate:1 1 udp 1234 192.168.1.2 5000 typ host\r\n' : '') +
    'a=x-fake-id:' + id + '\r\n';
}
class Channel {
  constructor(label, options) {
    Object.assign(this, { label, protocol: options.protocol, ordered: options.ordered,
      maxRetransmits: null, maxPacketLifeTime: null, bufferedAmount: 0, readyState: 'connecting', sent: [] });
  }
  send(data) {
    if (this.readyState !== 'open') throw new Error('Channel closed');
    assert(data instanceof ArrayBuffer);
    assert(data.byteLength <= 16384, 'WebRTC frames must stay within 16 KiB');
    if (this.failAfter !== undefined && this.sent.length >= this.failAfter) throw new Error('Simulated send failure');
    this.sent.push(data.slice(0));
    this.bufferedAmount += data.byteLength;
    const copy = data.slice(0);
    queueMicrotask(() => {
      this.bufferedAmount -= data.byteLength;
      if (this.partner?.readyState === 'open') this.partner.onmessage({ data: copy });
    });
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    if (this.onclose) this.onclose();
    if (this.partner && this.partner.readyState !== 'closed') {
      this.partner.readyState = 'closed';
      if (this.partner.onclose) this.partner.onclose();
    }
  }
}
class PeerConnection {
  constructor(options) {
    assert.equal(Object.keys(options).join(','), 'iceServers');
    assert(Array.isArray(options.iceServers) && options.iceServers.length === 0, 'LAN must not contact STUN/TURN servers');
    this.id = nextPeer++; peers.set(this.id, this);
    this.iceGatheringState = 'complete'; this.connectionState = 'new';
  }
  createDataChannel(label, options) { return (this.channel = new Channel(label, options)); }
  async createOffer() { return { type: 'offer', sdp: sdp(this.id, !this.noCandidates) }; }
  async createAnswer() { return { type: 'answer', sdp: sdp(this.id, !this.noCandidates) }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) {
    this.remoteDescription = value;
    this.remote = peers.get(Number(value.sdp.match(/a=x-fake-id:(\d+)/)[1]));
    assert(this.remote);
    if (value.type === 'answer') {
      const other = new Channel(this.channel.label, this.channel);
      this.channel.partner = other; other.partner = this.channel;
      this.remote.channel = other;
      this.remote.ondatachannel({ channel: other });
      this.connectionState = this.remote.connectionState = 'connected';
      for (const channel of [this.channel, other]) { channel.readyState = 'open'; channel.onopen(); }
    }
  }
  addEventListener() {}
  removeEventListener() {}
  close() { this.connectionState = 'closed'; if (this.channel) this.channel.close(); }
}
async function pair(api = LAN) {
  const a = { messages: [], errors: [], opened: 0, closed: 0 }, b = { messages: [], errors: [], opened: 0, closed: 0 };
  for (const side of [a, b]) {
    side.link = api.create({ PeerConnection,
      onOpen: link => { assert.equal(link.status, 'open'); side.opened++; },
      onClose: link => { assert.equal(link.status, 'closed'); side.closed++; },
      onError: (link, error) => { assert(error instanceof Error); side.errors.push(error); },
      onMessage: (link, message) => side.messages.push(message) });
  }
  a.pc = peers.get(nextPeer - 2); b.pc = peers.get(nextPeer - 1);
  const offer = await a.link.offer();
  assert.equal(a.link.status, 'connecting'); assert.equal(a.opened, 0);
  await assert.rejects(b.link.answer('invalid'));
  assert.equal(b.link.status, 'new', 'A pasted invalid code must allow another attempt');
  const answer = await b.link.answer(offer);
  assert.equal(b.link.status, 'connecting'); assert.equal(b.opened, 0);
  await assert.rejects(a.link.accept(offer));
  assert.equal(a.link.status, 'connecting');
  await a.link.accept(answer);
  assert.equal(a.opened, 1); assert.equal(b.opened, 1);
  return { a, b, offer, answer };
}
async function corrupted(mutator) {
  const { a, b } = await pair();
  const frames = [];
  a.pc.channel.send = frame => frames.push(frame.slice(0));
  assert(a.link.send({ text: 'x'.repeat(40000) }));
  mutator(frames, b.pc.channel);
  assert.equal(b.messages.length, 0, 'Malformed payload must never reach the application');
  assert.equal(b.errors.length, 1); assert.equal(b.link.status, 'closed');
  assert.equal(b.closed, 1); assert.equal(a.closed, 1);
  a.link.close(); b.link.close(); assert.equal(b.closed, 1);
}

async function main() {
  const { a, b, offer, answer } = await pair();
  assert(offer.startsWith('BONK-LAN1.')); assert.equal(LAN.decode(answer, 'answer').type, 'answer');
  assert.equal(LAN.encode(LAN.decode(offer, 'offer')), offer);
  for (const bad of ['', 'other.' + offer, 'BONK-LAN1.@@@=', 'x'.repeat(100001),
      'BONK-LAN1.' + btoa('{"v":2,"type":"offer","sdp":"v=0"}')]) {
    assert.throws(() => LAN.decode(bad, 'offer'));
  }
  assert.throws(() => LAN.decode(offer, 'answer'));
  assert.throws(() => LAN.encode({ type: 'offer', sdp: sdp(1, false) }), /endereço local/);
  assert.throws(() => LAN.encode({ type: 'offer', sdp: sdp(1).replace('typ host', 'typ relay') }));
  await assert.rejects(a.link.accept(answer));
  a.pc.channel.onopen(); b.pc.channel.onopen(); assert.equal(a.opened, 1); assert.equal(b.opened, 1);

  const large = { type: 'map', text: 'Olá 🐹 '.repeat(50000), nested: { x: 1, y: true } };
  assert(a.link.send(large)); assert(b.link.send({ type: 'input', keys: { left: true } }));
  await flush();
  assert.deepEqual(b.messages, [large]); assert.deepEqual(a.messages, [{ type: 'input', keys: { left: true } }]);
  assert(a.pc.channel.sent.length > 1, 'Large messages require fragmented round trips');

  const before = a.pc.channel.sent.length;
  a.pc.channel.bufferedAmount = 2 * 1024 * 1024 - 1;
  assert.equal(a.link.send({ x: 1 }), false); assert.equal(a.pc.channel.sent.length, before, 'Backpressure must send no partial fragments');
  a.pc.channel.bufferedAmount = 0;
  assert.equal(a.link.send({ text: 'x'.repeat(1024 * 1024) }), false);
  assert.equal(a.link.send({ text: '🐹'.repeat(300000) }), false);
  assert.equal(a.link.send(null), false); assert.equal(a.link.send([]), false);
  assert.equal(a.link.send({ toJSON: () => null }), false);
  const circular = {}; circular.self = circular; assert.equal(a.link.send(circular), false);
  assert.equal(a.pc.channel.sent.length, before);
  assert(a.link.send({ ok: true })); await flush(); assert.deepEqual(b.messages[1], { ok: true });
  const boundary = { text: 'x'.repeat(1024 * 1024 - 11) };
  assert(a.link.send(boundary)); await flush(); assert.deepEqual(b.messages[2], boundary);
  a.link.close(); a.link.close(); b.link.close(); assert.equal(a.closed, 1); assert.equal(b.closed, 1);
  assert.equal(a.link.send({ x: 1 }), false);

  await corrupted((frames, channel) => channel.onmessage({ data: frames[1] }));
  await corrupted((frames, channel) => {
    channel.onmessage({ data: frames[0] }); channel.onmessage({ data: frames[0] });
  });
  await corrupted((frames, channel) => {
    new DataView(frames[0]).setUint32(8, 1024 * 1024 + 1); channel.onmessage({ data: frames[0] });
  });
  await corrupted((frames, channel) => {
    new Uint8Array(frames[1])[20] ^= 1;
    frames.forEach(data => channel.onmessage({ data }));
  });
  await corrupted((frames, channel) => channel.onmessage({ data: '{"hello":true}' }));
  await corrupted((frames, channel) => {
    channel.onmessage({ data: frames[0] }); new DataView(frames[1]).setUint32(4, 2);
    channel.onmessage({ data: frames[1] });
  });

  const partial = await pair(); partial.a.pc.channel.failAfter = 1;
  assert.equal(partial.a.link.send({ text: 'x'.repeat(40000) }), false); await flush();
  assert.equal(partial.b.messages.length, 0); assert.equal(partial.a.errors.length, 1);
  assert.equal(partial.a.closed, 1); assert.equal(partial.b.closed, 1);
  const missing = LAN.create({ PeerConnection }); peers.get(nextPeer - 1).noCandidates = true;
  await assert.rejects(missing.offer(), /endereço local/); assert.equal(missing.status, 'closed');

  // Short fake timers verify absolute assembly deadlines without waiting ten seconds.
  const sandbox = { module: { exports: {} }, btoa, atob, TextEncoder, TextDecoder, ArrayBuffer, Uint8Array, DataView, Error,
    setTimeout: fn => setTimeout(fn, 20), clearTimeout };
  vm.runInNewContext(fs.readFileSync(require.resolve('./lan.js'), 'utf8'), sandbox);
  const stalled = sandbox.module.exports.create({ PeerConnection });
  peers.get(nextPeer - 1).noCandidates = true; peers.get(nextPeer - 1).iceGatheringState = 'gathering';
  await assert.rejects(stalled.offer(), /endereço local/); assert.equal(stalled.status, 'closed');
  const timed = await pair(sandbox.module.exports), frames = [];
  timed.a.pc.channel.send = frame => frames.push(frame.slice(0));
  assert(timed.a.link.send({ text: 'x'.repeat(40000) }));
  timed.b.pc.channel.onmessage({ data: frames[0] });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(timed.b.link.status, 'closed'); assert.match(timed.b.errors[0].message, /incompleta/);
  console.log('LAN checks passed: signalling, reliable round trips, limits, backpressure, malformed frames, failure cleanup and deadline.');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { PeerConnection, peers };
