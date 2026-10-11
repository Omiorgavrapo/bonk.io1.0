'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { fixture, config } = require('./check-online.cjs');
const { PeerConnection, peers } = require('./check-lan.cjs');
class InternetPeer extends PeerConnection {
  constructor(options) { assert.equal(options.iceServers[0].urls, 'stun:stun.l.google.com:19302'); super({ iceServers: [] }); }
  async createOffer() { const result = await super.createOffer(); result.sdp = result.sdp.replace('typ host', 'typ srflx'); return result; }
  async createAnswer() { const result = await super.createAnswer(); result.sdp = result.sdp.replace('typ host', 'typ relay'); return result; }
}
function client(server, RTC = InternetPeer) {
  const context = { crypto: require('node:crypto').webcrypto, fetch: server.fetch, BonkOnlineConfig: config, RTCPeerConnection: RTC,
    TextEncoder, TextDecoder, ArrayBuffer, Uint8Array, DataView, AbortController, Error, btoa, atob, setTimeout, clearTimeout, setInterval, clearInterval };
  for (const file of ['pin.js', 'lan.js', 'online.js']) vm.runInNewContext(fs.readFileSync(require.resolve('./' + file), 'utf8'), context);
  const messages = [], errors = [];
  return { context, messages, errors, link: context.BonkOnline.create({ onMessage: (_, value) => messages.push(value), onError: (_, e) => errors.push(e.message) }) };
}
async function until(check) { const deadline = Date.now() + 4000; while (!check()) { if (Date.now() > deadline) throw Error('Hybrid test timed out'); await new Promise(resolve => setTimeout(resolve, 10)); } }
async function connect(host, guest) { const offer = await host.link.offer(); const answer = await guest.link.answer(offer); await host.link.accept(answer); await until(() => host.link.status === 'open' && guest.link.status === 'open'); }
(async () => {
  const server = fixture(), host = client(server), guest = client(server);
  try {
    await connect(host, guest); await until(() => host.link.fast && guest.link.fast);
    const mailCount = () => server.calls.filter(call => /Mail\.json$/.test(call.url)).length;
    const before = mailCount();
    host.link.send({ type: 'state', tick: 300, text: 'Olá 🌎'.repeat(5000) }); guest.link.send({ type: 'input', mask: 2 });
    await until(() => guest.messages.length === 1 && host.messages.length === 1);
    assert.equal(guest.messages[0].tick, 300); assert.equal(host.messages[0].mask, 2);
    assert.equal(mailCount(), before, 'Direct movement must bypass the database');
    host.link.send({ type: 'start', map: { nullable: null } });
    await until(() => guest.messages.length === 2); assert.equal(guest.messages[1].map.nullable, null);
    const hostPC = [...peers.values()].find(pc => pc.localDescription?.type === 'offer');
    hostPC.channel.bufferedAmount = 70000;
    const count = guest.messages.length, backedUp = mailCount();
    assert(host.link.send({ type: 'state', tick: 301 }));
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(guest.messages.length, count); assert.equal(mailCount(), backedUp, 'Congestion must drop stale movement instead of building another queue');
    hostPC.channel.bufferedAmount = 0; host.link.send({ type: 'state', tick: 302 });
    await until(() => guest.messages.at(-1).tick === 302);
    hostPC.channel.close(); assert(!host.link.fast && !guest.link.fast);
    assert.equal(host.link.status, 'open'); assert.equal(guest.link.status, 'open');
    host.link.send({ type: 'state', tick: 400 }); guest.link.send({ type: 'input', mask: 0 });
    await until(() => guest.messages.at(-1).tick === 400 && host.messages.at(-1).mask === 0);
    assert.deepEqual(host.errors, []); assert.deepEqual(guest.errors, []);
    console.log('PASS: public ICE candidates, automatic direct upgrade, UTF-8 fragmentation, movement bypasses Firebase, reliable controls, bounded backlog and automatic fallback after direct failure.');
  } finally { host.link.close(); guest.link.close(); }
  const blocked = client(server, class { constructor() { throw Error('UDP blocked'); } }), fallback = client(server);
  try {
    await connect(blocked, fallback); assert(!blocked.link.fast && !fallback.link.fast);
    blocked.link.send({ type: 'state', tick: 1 }); await until(() => fallback.messages.length === 1);
    assert.deepEqual(blocked.errors, []); assert.equal(fallback.messages[0].tick, 1);
    console.log('PASS: a failed direct negotiation preserves the global relay connection.');
  } finally { blocked.link.close(); fallback.link.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
