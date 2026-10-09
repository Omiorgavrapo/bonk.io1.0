/* REST fixture evaluates the shipped rule expressions; it is not the Firebase emulator. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const LAN = require('./lan.js');
const rules = JSON.parse(fs.readFileSync(require.resolve('./firebase.rules.json'), 'utf8')).rules;
const source = fs.readFileSync(require.resolve('./pin.js'), 'utf8');
const config = { apiKey: 'AIza' + 'x'.repeat(35), databaseURL: 'https://bonk-test.firebaseio.com' };
const copy = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
function snapshot(value, parent) {
  return { val: () => value ?? null, exists: () => value !== null && value !== undefined,
    child: key => snapshot(value?.[key], () => snapshot(value, parent)), parent: parent || (() => snapshot(null)),
    isString: () => typeof value === 'string', isNumber: () => typeof value === 'number',
    hasChild: key => value?.[key] !== null && value?.[key] !== undefined,
    hasChildren: keys => keys.every(key => value?.[key] !== null && value?.[key] !== undefined) };
}
function expression(rule, auth, old, next, now, pin) {
  if (typeof rule === 'boolean') return rule;
  return Function('auth', 'data', 'newData', 'now', '$pin', 'return (' + rule + ')')(
    auth, old, next, now, { matches: re => re.test(pin) });
}
function validate(rule, auth, old, next, now, pin) {
  if (!next.exists()) return true;
  if (rule['.validate'] !== undefined && !expression(rule['.validate'], auth, old, next, now, pin)) return false;
  const value = next.val();
  if (typeof value !== 'object') return true;
  return Object.keys(value).every(key => {
    const child = rule[key] || rule.$other;
    return child && validate(child, auth, old.child(key), next.child(key), now, pin);
  });
}
function firebaseMock() {
  const records = new Map(), tokens = new Map(), calls = [];
  let nextUid = 1, clock = Date.now(), collision = false;
  const reply = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  async function fetch(url, options = {}) {
    if (options.signal?.aborted) throw Object.assign(Error('Abort'), { name: 'AbortError' });
    const parsed = new URL(url), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    calls.push({ host: parsed.hostname, path: parsed.pathname, method });
    if (parsed.hostname === 'identitytoolkit.googleapis.com') {
      if (!body?.returnSecureToken) return reply(400, { error: 'Invalid signup' });
      const uid = 'user-' + nextUid++, token = 'test-token-' + uid; tokens.set(token, uid);
      return reply(200, { idToken: token, localId: uid, expiresIn: '3600' });
    }
    const uid = tokens.get(parsed.searchParams.get('auth')), auth = uid ? { uid } : null;
    const match = parsed.pathname.match(/^\/invites\/(\d{8})(\/answer)?\.json$/);
    if (!match || !auth) return reply(401, { error: 'Permission denied' });
    const pin = match[1], child = !!match[2], oldRecord = copy(records.get(pin)), rule = rules.invites.$pin;
    if (method === 'GET') {
      if (!expression(rule['.read'], auth, snapshot(oldRecord), snapshot(oldRecord), clock, pin)) return reply(401, { error: 'Expired' });
      return reply(200, child ? oldRecord?.answer ?? null : oldRecord);
    }
    if (method === 'PUT' && options.headers?.['if-match'] === 'null_etag' && (child ? oldRecord?.answer : oldRecord)) return reply(412, {});
    if (method === 'PUT' && !child && collision) { collision = false; return reply(412, {}); }
    const next = child ? { ...(oldRecord || {}), answer: body } : method === 'DELETE' ? null : copy(body);
    if (next?.createdAt?.['.sv'] === 'timestamp') next.createdAt = clock;
    let allowed = expression(rule['.write'], auth, snapshot(oldRecord), snapshot(next), clock, pin);
    if (!allowed && child) allowed = expression(rule.answer['.write'], auth, snapshot(oldRecord).child('answer'), snapshot(next).child('answer'), clock, pin);
    if (!allowed || !validate(rule, auth, snapshot(oldRecord), snapshot(next), clock, pin)) return reply(401, { error: 'Permission denied' });
    if (next === null) records.delete(pin); else records.set(pin, next);
    return reply(200, child ? body : next);
  }
  return { fetch, records, tokens, calls, advance: ms => { clock += ms; }, collide: () => { collision = true; } };
}
function client(server, values) {
  const context = { fetch: server.fetch, crypto: values ? { getRandomValues(a) { a[0] = values.shift(); return a; } } : require('node:crypto').webcrypto,
    BonkLAN: LAN, AbortController, Set, URL, setTimeout, clearTimeout, Uint32Array, console };
  vm.runInNewContext(source, context);
  return context.BonkPIN;
}
async function main() {
  const server = firebaseMock(), hostAPI = client(server, [4294967295, 7, 8, 9, 10]), guestAPI = client(server), strangerAPI = client(server);
  const sdp = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=ice-ufrag:fake\r\na=ice-pwd:password\r\na=fingerprint:sha-256 AB:CD\r\na=candidate:1 1 udp 1234 192.168.1.2 5000 typ host\r\n';
  const offerCode = LAN.encode({ type: 'offer', sdp }), answerCode = LAN.encode({ type: 'answer', sdp });
  assert.throws(() => hostAPI.create({}), /ativado/);
  assert.throws(() => hostAPI.configuration({ ...config, databaseURL: 'https://attacker.test' }), /ativado/);
  assert.throws(() => hostAPI.parse('1234567'), /8 números/); assert.throws(() => hostAPI.parse('1234567x'), /8 números/);
  assert.equal(hostAPI.parse('0000 0007'), '00000007');
  server.collide(); const host = hostAPI.create(config), guest = guestAPI.create(config), stranger = strangerAPI.create(config);
  const { pin } = await host.publish(offerCode); assert.equal(pin, '00000008', 'Retry collisions and preserve leading zeroes');
  assert.equal(await guest.offer(pin), offerCode);
  await guest.answer(pin, answerCode); assert.equal(await host.waitForAnswer(pin), answerCode);
  await assert.rejects(stranger.offer(pin), /já usado/);
  await assert.rejects(guest.answer(pin, answerCode), /já foi usado/);
  const user = [...server.tokens.entries()][1];
  const endpoint = config.databaseURL + '/invites/' + pin + '.json?auth=' + user[0];
  assert.equal((await server.fetch(endpoint, { method: 'DELETE' })).status, 401, 'Guest cannot delete the owner record');
  assert.equal((await server.fetch(config.databaseURL + '/invites.json?auth=' + user[0])).status, 401, 'Cannot enumerate PINs');
  const forged = { owner: user[1], offer: offerCode, createdAt: { '.sv': 'timestamp' }, unexpected: true };
  assert.equal((await server.fetch(endpoint.replace(pin, '12345678'), { method: 'PUT', body: JSON.stringify(forged) })).status, 401, 'Reject unexpected fields');
  host.close(); await new Promise(r => setImmediate(r)); assert.equal(server.records.size, 0, 'Owner cleans up the invitation');
  guest.close(); stranger.close();
  const expiring = hostAPI.create(config), unused = await expiring.publish(offerCode);
  server.advance(300001);
  await assert.rejects(guestAPI.create(config).offer(unused.pin), /expirado/);
  assert.equal((await server.fetch(endpoint.replace(pin, unused.pin).replace('.json?', '/answer.json?'), { method: 'PUT',
    body: JSON.stringify({ uid: user[1], code: answerCode }) })).status, 401, 'Expired invitations cannot receive an answer');
  assert.equal((await server.fetch(endpoint.replace(pin, unused.pin) + '&unused=1', { method: 'PUT', body: '{}' })).status, 401, 'Cannot replace an existing owner');
  expiring.close();
  const cancelled = hostAPI.create(config), waiting = await cancelled.publish(offerCode), wait = cancelled.waitForAnswer(waiting.pin);
  await new Promise(r => setImmediate(r));
  cancelled.close(); await assert.rejects(wait, /cancelado/);
  const offline = client({ fetch: async () => { throw new TypeError('Network down'); } });
  await assert.rejects(offline.create(config).publish(offerCode), /conexão/);
  await new Promise(r => setImmediate(r)); assert.equal(server.records.size, 0);
  console.log('PIN checks passed: 8 digits, leading zeros, collision retry, automatic offer/answer, single use, expiration, cancellation, cleanup, offline errors and shipped rule expressions.');
  console.log('LIMIT: REST and rule evaluation are fixtures; validate against the configured Firebase project before public use.');
}
module.exports = { firebaseMock, config };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
