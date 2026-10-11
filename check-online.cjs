/* Local fixture evaluates shipped rules and splits SSE events; it is not Firebase's emulator. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const rules = JSON.parse(fs.readFileSync(require.resolve('./firebase.rules.json'), 'utf8')).rules;
const config = { apiKey: 'AIza' + 'x'.repeat(35), databaseURL: 'https://bonk-test.firebaseio.com' };
const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
function fixture() {
  let tree = {}, nextUser = 1, clock = Date.now();
  const tokens = new Map(), streams = new Set(), calls = [];
  function get(tree, keys) { return keys.reduce((value, key) => value?.[key], tree) ?? null; }
  function set(tree, keys, value) {
    let parent = tree;
    keys.forEach((key, index) => { if (index === keys.length - 1) { if (value === null) delete parent[key]; else parent[key] = value; } else parent = parent[key] ||= {}; });
  }
  function snapshot(tree, keys) {
    const value = get(tree, keys);
    return { val: () => value, exists: () => value !== null, child: key => snapshot(tree, keys.concat(key)), parent: () => snapshot(tree, keys.slice(0, -1)),
      isString: () => typeof value === 'string', isNumber: () => typeof value === 'number', hasChild: key => value?.[key] != null, hasChildren: keys => keys.every(key => value?.[key] != null) };
  }
  function chain(keys) {
    const nodes = [{ rule: rules, keys: [] }]; let rule = rules;
    keys.forEach((key, index) => { rule = rule[key] || rule.$id || rule.$pin || rule.$other || {}; nodes.push({ rule, keys: keys.slice(0, index + 1) }); });
    return nodes;
  }
  function evaluate(expression, uid, old, next, keys) {
    if (typeof expression === 'boolean') return expression;
    return Function('auth', 'data', 'newData', 'now', '$id', '$pin', 'return (' + expression + ')')(
      uid ? { uid } : null, snapshot(old, keys), snapshot(next, keys), clock, { matches: re => re.test(keys[1] || '') }, { matches: re => re.test(keys[1] || '') });
  }
  function permitted(mode, uid, old, next, keys) { return chain(keys).some(node => node.rule[mode] !== undefined && evaluate(node.rule[mode], uid, old, next, node.keys)); }
  function valid(uid, old, next, keys) {
    if (get(next, keys) === null) return true;
    if (chain(keys).some(node => node.rule['.validate'] !== undefined && !evaluate(node.rule['.validate'], uid, old, next, node.keys))) return false;
    const value = get(next, keys);
    return typeof value !== 'object' || Object.keys(value).every(key => valid(uid, old, next, keys.concat(key)));
  }
  function wire(stream, type, value) {
    if (stream.closed) return;
    const encoded = Buffer.from('event: ' + type + '\r\ndata: ' + JSON.stringify(value) + '\r\n\r\n');
    for (let offset = 0; offset < encoded.length; offset += 37) stream.controller.enqueue(new Uint8Array(encoded.subarray(offset, offset + 37)));
  }
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  function timestamp(value) { if (value && typeof value === 'object') { if (value['.sv'] === 'timestamp') return clock; Object.keys(value).forEach(key => { value[key] = timestamp(value[key]); }); } return value; }
  async function fetch(url, options = {}) {
    const parsed = new URL(url), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: parsed.pathname, method });
    if (parsed.hostname === 'identitytoolkit.googleapis.com') { const uid = 'test-' + nextUser++, token = 'token-' + uid; tokens.set(token, uid); return json(200, { idToken: token, localId: uid, expiresIn: '3600' }); }
    if (options.signal?.aborted) throw Object.assign(Error('Abort'), { name: 'AbortError' });
    const keys = parsed.pathname.replace(/^\//, '').replace(/\.json$/, '').split('/'), uid = tokens.get(parsed.searchParams.get('auth'));
    if (method === 'GET') {
      if (!permitted('.read', uid, tree, tree, keys)) return json(401, { error: 'Permission denied' });
      if (options.headers?.Accept === 'text/event-stream') {
        const stream = { keys, uid, closed: false };
        const readable = new ReadableStream({ start(controller) { stream.controller = controller; streams.add(stream); wire(stream, 'put', { path: '/', data: clone(get(tree, keys)) }); }, cancel() { stream.closed = true; streams.delete(stream); } });
        options.signal?.addEventListener('abort', () => { if (!stream.closed) { stream.closed = true; streams.delete(stream); stream.controller.close(); } });
        return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return json(200, clone(get(tree, keys)));
    }
    if (!['PUT', 'DELETE'].includes(method)) return json(405, {});
    if (options.headers?.['if-match'] === 'null_etag' && get(tree, keys) !== null) return json(412, {});
    const next = clone(tree); set(next, keys, method === 'DELETE' ? null : timestamp(clone(body)));
    if (!permitted('.write', uid, tree, next, keys) || !valid(uid, tree, next, keys)) return json(401, { error: 'Permission denied' });
    tree = next;
    for (const stream of streams) {
      if (keys.slice(0, stream.keys.length).join('/') !== stream.keys.join('/')) continue;
      if (get(tree, stream.keys) === null) wire(stream, 'put', { path: '/', data: null });
      else if (!permitted('.read', stream.uid, tree, tree, stream.keys)) wire(stream, 'cancel', null);
      else wire(stream, 'put', { path: '/' + keys.slice(stream.keys.length).join('/'), data: clone(get(tree, keys)) });
    }
    return json(200, clone(get(tree, keys)));
  }
  return { fetch, calls, tokens, get tree() { return tree; }, advance(ms) { clock += ms; } };
}
function client(server, options) {
  const context = { console, crypto, fetch: server.fetch, AbortController, TextDecoder, btoa, atob, setTimeout, clearTimeout, setInterval, clearInterval, BonkOnlineConfig: config };
  for (const file of ['pin.js', 'online.js']) vm.runInNewContext(fs.readFileSync(require.resolve('./' + file), 'utf8'), context);
  const messages = [], errors = [], callbacks = { onMessage: (_, message) => messages.push(message), onError: (_, error) => errors.push(error.message), ...options };
  return { context, link: context.BonkOnline.create(callbacks), messages, errors };
}
async function until(predicate) { const deadline = Date.now() + 4000; while (!predicate()) { if (Date.now() > deadline) throw Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 10)); } }
async function main() {
  const server = fixture(), host = client(server), guest = client(server), outsider = client(server), sessions = [host, guest, outsider];
  try {
    const offer = await host.link.offer();
    assert.throws(() => host.context.BonkOnline.decode('BONK-LAN1.old', 'offer'));
    assert.throws(() => host.context.BonkOnline.decode(offer.replace('BONK-ONLINE4.', 'BONK-ONLINE3.'), 'offer'), 'Older clients cannot skip input acknowledgement fields');
    assert.throws(() => host.context.BonkOnline.decode(offer, 'answer'));
    const answer = await guest.link.answer(offer); await host.link.accept(answer);
    await until(() => guest.link.status === 'open');
    assert(host.link.send({ type: 'start', map: { nullable: null }, text: 'olá 🌎' }));
    for (let i = 0; i < 30; i++) assert(host.link.send({ type: 'state', tick: i }));
    assert(guest.link.send({ type: 'input', mask: 1 }));
    await until(() => guest.messages.length === 2 && host.messages.length === 1);
    assert.equal(guest.messages[0].text, 'olá 🌎'); assert.equal(guest.messages[0].map.nullable, null); assert.equal(guest.messages[1].tick, 29);
    assert.equal(host.messages[0].mask, 1);
    assert.equal(host.link.send({ huge: 'x'.repeat(1048576) }), false);
    const stranger = await outsider.context.BonkPIN.create(config).login(), route = host.context.BonkOnline.decode(offer, 'offer').id;
    const endpoint = path => config.databaseURL + '/connections/' + route + path + '.json?auth=' + stranger.token;
    assert.equal((await server.fetch(endpoint(''))).status, 401);
    assert.equal((await server.fetch(endpoint('/guest'), { method: 'PUT', body: JSON.stringify(stranger.uid) })).status, 401);
    assert.equal((await server.fetch(endpoint(''), { method: 'DELETE' })).status, 401);
    const guestIdentity = await guest.context.BonkPIN.create(config).login();
    assert.equal((await server.fetch(config.databaseURL + '/connections/' + route + '/hostMail.json?auth=' + guestIdentity.token, { method: 'PUT', body: JSON.stringify({ seq: 2, payload: '[]' }) })).status, 401);
    assert.equal((await server.fetch(endpoint('/unknown'), { method: 'PUT', body: 'true' })).status, 401);
    assert.equal(host.errors.length, 0); assert.equal(guest.errors.length, 0);
    guest.link.close(); await until(() => host.link.status === 'closed');
    console.log('PASS: HTTPS relay, fragmented SSE/UTF-8, ordered packets, latest state/input, null preservation, limits and disconnect.');
    console.log('PASS: Actual rule expressions block outsiders, slot replacement, guest host-packet forgery and unexpected fields (local fixture).');
  } finally { sessions.forEach(session => session.link.close()); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture, config };
