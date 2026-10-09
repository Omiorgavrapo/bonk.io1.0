/* Firebase only introduces peers. Physics and match traffic stay on WebRTC. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.BonkPIN = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var TTL = 300000, credentials = null;
  function configuration(value) {
    value = value || {};
    if (!/^AIza[\w-]{30,50}$/.test(value.apiKey || '') ||
        !/^https:\/\/[a-z0-9-]+\.(?:firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)\/?$/.test(value.databaseURL || '')) {
      throw Error('O PIN ainda não foi ativado. Siga FIREBASE.md e preencha online-config.js.');
    }
    return { apiKey: value.apiKey, databaseURL: value.databaseURL.replace(/\/$/, '') };
  }
  function parse(value) {
    var pin = String(value).trim().replace(/\s/g, '');
    if (!/^\d{8}$/.test(pin)) throw Error('Digite os 8 números do convite.');
    return pin;
  }
  function random() {
    var bytes = new Uint32Array(1), limit = 4200000000;
    do { root.crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
    return String(bytes[0] % 100000000).padStart(8, '0');
  }
  function create(raw) {
    var config = configuration(raw), closed = false, requests = new Set(), sleeps = new Set(), owned = null, identity = null;
    function cancelled() { if (closed) throw Error('Convite cancelado.'); }
    async function request(url, method, value, headers, cleanup) {
      if (!cleanup) cancelled();
      var controller = new root.AbortController(), timeout = setTimeout(function () { controller.abort(); }, 12000);
      requests.add(controller);
      try {
        var response = await root.fetch(url, { method: method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: value === undefined ? undefined : JSON.stringify(value), signal: controller.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (!cleanup) cancelled();
        if (!response.ok) {
          var detail = await response.json().catch(function () { return {}; });
          var error = Error(detail.error && /OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/.test(detail.error.message || '') ? 'Ative Authentication → Anônimo no Firebase.' :
            response.status === 401 || response.status === 403 ? 'Acesso ao PIN recusado. Verifique Authentication e as regras do Firebase.' :
            response.status === 412 ? 'Este convite já foi usado. Peça um novo PIN.' : 'O serviço de convites não respondeu. Tente novamente.');
          error.status = response.status; throw error;
        }
        return await response.json();
      } catch (error) {
        if (closed && !cleanup) throw Error('Convite cancelado.');
        if (error.name === 'AbortError' || error.name === 'TypeError') throw Error('Sem conexão com o serviço de convites. Verifique a internet.');
        throw error;
      } finally { clearTimeout(timeout); requests.delete(controller); }
    }
    async function auth(minimum) {
      cancelled();
      if (!credentials || credentials.key !== config.apiKey || credentials.until < Date.now() + (minimum || TTL + 60000)) {
        var value = await request('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + config.apiKey, 'POST', { returnSecureToken: true });
        if (!value.idToken || !value.localId || !Number.isFinite(Number(value.expiresIn))) throw Error('Ative a autenticação anônima no Firebase.');
        identity = { key: config.apiKey, token: value.idToken, uid: value.localId, until: Date.now() + Number(value.expiresIn) * 1000 };
        credentials = identity;
      } else identity = credentials;
      cancelled(); return identity;
    }
    async function database(pin, suffix, method, value, headers) {
      var user = identity || await auth();
      return request(config.databaseURL + '/invites/' + parse(pin) + suffix + '.json?auth=' + encodeURIComponent(user.token), method, value, headers);
    }
    function sleep() {
      return new Promise(function (resolve, reject) {
        var item = { reject: reject, timer: setTimeout(function () { sleeps.delete(item); resolve(); }, 1500) };
        sleeps.add(item);
      });
    }
    async function publish(code) {
      if (owned) throw Error('Gere uma nova conexão para um novo convite.');
      (root.BonkOnline || root.BonkLAN).decode(code, 'offer');
      var user = await auth();
      for (var i = 0; i < 8; i++) {
        var pin = random(); owned = pin;
        try {
          var value = await database(pin, '', 'PUT', { owner: user.uid, offer: code, createdAt: { '.sv': 'timestamp' } }, { 'if-match': 'null_etag' });
          return { pin: pin, createdAt: value.createdAt };
        } catch (error) { owned = null; if (error.status !== 412) throw error; }
      }
      throw Error('Não foi possível reservar o PIN. Tente novamente.');
    }
    async function waitForAnswer(pin) {
      pin = parse(pin); var deadline = Date.now() + TTL;
      while (Date.now() < deadline) {
        cancelled();
        var value = await database(pin, '/answer', 'GET');
        if (value) { (root.BonkOnline || root.BonkLAN).decode(value.code, 'answer'); return value.code; }
        await sleep();
      }
      throw Error('O PIN expirou. Gere outro convite.');
    }
    async function offer(pin) {
      pin = parse(pin);
      var value;
      try { value = await database(pin, '', 'GET'); }
      catch (error) { if (error.status === 401 || error.status === 403) throw Error('PIN expirado ou indisponível. Peça um novo convite.'); throw error; }
      if (!value || value.answer) throw Error('PIN não encontrado ou já usado. Peça um novo convite.');
      if (value.owner === identity.uid) throw Error('Use o PIN em outro navegador para entrar.');
      (root.BonkOnline || root.BonkLAN).decode(value.offer, 'offer'); return value.offer;
    }
    async function answer(pin, code) {
      (root.BonkOnline || root.BonkLAN).decode(code, 'answer');
      var user = identity || await auth();
      try { await database(pin, '/answer', 'PUT', { uid: user.uid, code: code }, { 'if-match': 'null_etag' }); }
      catch (error) { if ([401, 403, 412].indexOf(error.status) >= 0) throw Error('O PIN expirou ou já foi usado. Peça um novo convite.'); throw error; }
    }
    function close() {
      if (closed) return;
      closed = true; requests.forEach(function (c) { c.abort(); });
      sleeps.forEach(function (s) { clearTimeout(s.timer); s.reject(Error('Convite cancelado.')); }); sleeps.clear();
      if (owned && identity) {
        // Expired records remain unreadable if the tab closes before this cleanup finishes.
        request(config.databaseURL + '/invites/' + owned + '.json?auth=' + encodeURIComponent(identity.token), 'DELETE', undefined, null, true).catch(function () {});
      }
    }
    return { publish: publish, waitForAnswer: waitForAnswer, offer: offer, answer: answer, close: close, login: async function (minimum) {
      var user = await auth(minimum); return { uid: user.uid, token: user.token, databaseURL: config.databaseURL };
    } };
  }
  return Object.freeze({ create: create, parse: parse, random: random, configuration: configuration });
}));
