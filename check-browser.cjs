/* Real-browser global check. Uses the configured Firebase project and no WebRTC. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const configVM = require('node:vm'), configContext = { window: {} };
configVM.runInNewContext(fs.readFileSync(require.resolve('./online-config.js'), 'utf8'), configContext);
const config = configContext.window.BonkOnlineConfig;
const identities = [], connections = new Map();

let playwright;
try { playwright = require('playwright'); }
catch (_) {
  playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}
const executablePath = [
  path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
  playwright.chromium.executablePath(),
  path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')
].find(file => fs.existsSync(file));
assert(executablePath, 'Install Chrome/Chromium first; this check does not download a browser.');
const qa = path.join(__dirname, '.qa');
fs.mkdirSync(qa, { recursive: true });
const fileUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
const errors = [], outsideRequests = [];
let browser, host, guest;

async function pageFor(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (/^(file|data|blob):/.test(url)) return route.continue();
    if (url.startsWith('https://identitytoolkit.googleapis.com/') || /^https:\/\/[a-z0-9.-]+\.firebaseio\.com\//.test(url)) return route.continue();
    outsideRequests.push(url);
    return route.abort();
  });
  await context.addInitScript(name => {
    localStorage.setItem('bonk-local-settings', JSON.stringify({ p1: { name }, volume: 0 }));
    window.RTCPeerConnection = undefined; // A successful game must use only the HTTPS relay.
  }, name);
  const page = await context.newPage();
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('accounts:signUp') && response.ok()) identities.push(await response.json());
    const match = new URL(url).pathname.match(/^\/connections\/([a-f0-9]{32})\.json$/);
    if (match && response.request().method() === 'PUT' && response.ok()) connections.set(match[1], JSON.parse(response.request().postData()).owner);
  });
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  page.setDefaultTimeout(20000);
  await page.goto(fileUrl);
  await page.waitForFunction(() => typeof BonkRoom !== 'undefined');
  await page.evaluate(config => { window.BonkOnlineConfig = Object.freeze(config); }, config);
  return page;
}
async function screenshot(page, name) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(qa, name + '.png'), fullPage: true });
}
async function connected(page) {
  await page.waitForFunction(() => {
    const list = document.getElementById('lanPlayers');
    return list && list.textContent.includes('Host QA') && list.textContent.includes('Guest QA');
  });
}
async function handshake() {
  await host.locator('#lanInvite').click();
  await host.waitForFunction(() => /^\d{8}$/.test(document.getElementById('lanOffer').value));
  const offer = await host.locator('#lanOffer').inputValue();
  await guest.locator('#lanOfferInput').fill(offer);
  await guest.locator('#lanJoin').click();
  await Promise.all([connected(host), connected(guest)]);
}
async function running(page) {
  await page.waitForFunction(() => {
    const hud = document.getElementById('gameHud');
    return hud.classList.contains('active') && Number(hud.dataset.tick) > 150 && hud.dataset.phase === 'playing';
  });
}
async function hud(page) {
  return page.locator('#gameHud').evaluate(element => ({ tick: Number(element.dataset.tick), round: Number(element.dataset.round) }));
}
async function toastAfter(page, before) {
  await page.waitForFunction(before => {
    const toast = document.getElementById('toast');
    return toast.classList.contains('visible') && toast.textContent && toast.textContent !== before;
  }, before);
  return page.locator('#toast').textContent();
}

(async () => {
  try {
    browser = await playwright.chromium.launch({ executablePath, headless: true, chromiumSandbox: true, timeout: 20000 });
    host = await pageFor('Host QA');
    guest = await pageFor('Guest QA');
    await screenshot(host, 'pin-menu');
    await host.locator('[data-action="lan-host"]').click();
    await screenshot(host, 'pin-host-empty');
    await host.locator('#lanHumans').fill('2');
    await host.locator('#lanHumans').dispatchEvent('change');
    await host.locator('#lanBots').fill('3');
    await host.locator('#lanBots').dispatchEvent('change');
    await host.locator('#lanRounds').fill('5');
    await host.locator('#lanRounds').dispatchEvent('change');
    await host.locator('#lanMap').selectOption('local-flat');
    const rules = { gravity: .8, playerSize: 1.5, shotSpeed: 1.7, shotLifetime: 2.3 };
    for (const [key, value] of Object.entries(rules)) {
      await host.locator('#online-' + key).fill(String(value));
      await host.locator('#online-' + key).dispatchEvent('change');
    }
    assert.equal(Number(await host.locator('#lanHumans').inputValue()) + Number(await host.locator('#lanBots').inputValue()), 5, 'Room must allow five humans + bots total');
    await guest.locator('[data-action="lan-join"]').click();
    await screenshot(guest, 'pin-guest-entry');
    const beforeInvalid = await guest.locator('#toast').textContent();
    await guest.locator('#lanOfferInput').fill('1234567');
    await guest.locator('#lanJoin').click();
    console.log('PASS: incomplete PIN gives feedback: ' + await toastAfter(guest, beforeInvalid));
    await handshake();
    for (const [key, value] of Object.entries(rules)) {
      assert.equal(Number(await guest.locator('#online-' + key).inputValue()), value);
      assert(await guest.locator('#online-' + key).isDisabled(), 'Guest settings must be read-only');
    }
    await Promise.all([screenshot(host, 'lan-host-lobby'), screenshot(guest, 'lan-guest-lobby')]);
    console.log('PASS: file:// pages connect through an 8-digit PIN, real Firebase REST and HTTPS relay. Both show both names.');

    await host.locator('#lanStart').click();
    await Promise.all([running(host), running(guest)]);
    const [hostHud, guestHud] = await Promise.all([hud(host), hud(guest)]);
    assert.equal(hostHud.round, guestHud.round, 'Guest must show the host round');
    assert(Math.abs(hostHud.tick - guestHud.tick) <= 60, 'Guest HUD must follow host ticks within one second');
    const first = await host.evaluate(() => BonkRoom.state());
    assert.deepEqual(first.rules, rules);
    const guestState = await guest.evaluate(() => BonkRoom.state());
    assert.deepEqual(guestState.rules, rules);
    assert(first.players.every(p => p.radius === 24) && guestState.players.every(p => p.radius === 24), 'Both peers must render the configured disc size');
    assert.equal(first.players.length, 5, 'Started room must contain two humans and three bots');
    assert.equal(first.players.filter(p => p.bot).length, 3);
    const remote = first.players.find(p => p.name === 'Guest QA');
    assert(remote && !remote.bot, 'Guest must be a human participant');
    assert.equal(await guest.evaluate(() => document.activeElement.id), 'arena', 'Starting online must focus the arena for keyboard controls');
    await guest.keyboard.down('ArrowRight');
    try {
      await host.waitForFunction(id => {
        const p = BonkRoom.state().players.find(p => p.id === id);
        return p && p.controls && p.controls.right;
      }, remote.id);
      await host.waitForFunction(({ id, x }) => {
        const p = BonkRoom.state().players.find(p => p.id === id);
        return p && p.x > x + 2;
      }, { id: remote.id, x: remote.x });
    } finally { await guest.keyboard.up('ArrowRight'); }
    await host.waitForFunction(id => {
      const p = BonkRoom.state().players.find(p => p.id === id);
      return p && !p.controls.right;
    }, remote.id);
    await Promise.all([screenshot(host, 'lan-host-game'), screenshot(guest, 'lan-guest-game')]);
    console.log('PASS: five participants, synchronized round/ticks, guest keyboard reaches host physics and key release clears input.');

    const beforeDisconnect = await host.locator('#toast').textContent();
    await guest.context().close();
    console.log('PASS: guest disconnect gives feedback: ' + await toastAfter(host, beforeDisconnect));
    await host.locator('#lanInvite').waitFor({ state: 'visible' });
    guest = await pageFor('Guest QA');
    await guest.locator('[data-action="lan-join"]').click();
    await handshake();
    assert.match(await guest.locator('#lanStatus').textContent(), /Conectado/, 'Reconnect must give visible feedback');
    await host.locator('#lanStart').click();
    await Promise.all([running(host), running(guest)]);
    await Promise.all([screenshot(host, 'lan-host-reconnected'), screenshot(guest, 'lan-guest-reconnected')]);
    console.log('PASS: a disconnected guest reconnects using a fresh invitation and can play again.');
    await host.evaluate(() => BonkRoom.end());
    await guest.waitForFunction(() => document.getElementById('menu').classList.contains('active'));
    await host.locator('[data-action="lan-host"]').click();
    await host.locator('#lanHumans').fill('2'); await host.locator('#lanHumans').dispatchEvent('change');
    await host.locator('#lanBots').fill('0'); await host.locator('#lanBots').dispatchEvent('change');
    await host.locator('#lanMap').selectOption('local-arrows');
    await host.locator('#online-gravity').fill('0'); await host.locator('#online-gravity').dispatchEvent('change');
    await guest.locator('[data-action="lan-join"]').click(); await handshake();
    await host.locator('#lanStart').click(); await Promise.all([running(host), running(guest)]);
    await guest.keyboard.down('KeyZ'); await guest.keyboard.down('ArrowRight');
    const aimTick = (await host.evaluate(() => BonkRoom.state())).tick;
    await host.waitForFunction(tick => BonkRoom.state().tick > tick + 110, aimTick);
    assert((await host.evaluate(() => BonkRoom.state().players.find(p => p.name === 'Guest QA'))).charge > .95, 'Guest keyboard must charge a shot');
    await guest.keyboard.up('ArrowRight');
    await Promise.all([screenshot(host, 'online-bow-host'), screenshot(guest, 'online-bow-guest')]);
    await guest.keyboard.up('KeyZ');
    await Promise.all([host, guest].map(page => page.waitForFunction(() => BonkRoom.state().players.find(p => p.name === 'Guest QA').cooldown > 0)));
    await Promise.all([screenshot(host, 'online-reload-host'), screenshot(guest, 'online-reload-guest')]);
    console.log('PASS: guest arrows controls, full-charge release, Canvas bow and synchronized reload indicator through real Firebase.');
    assert.deepEqual(errors, [], 'Uncaught browser errors are fatal');
    assert.deepEqual(outsideRequests, [], 'The game must not request external services');
    console.log('PASS: no uncaught browser errors or unexpected external page requests. Screenshots: ' + qa);
    console.log('LIMIT: Both peers ran on this PC with WebRTC disabled and real Firebase. Different physical devices and Chromebook remain unverified.');
  } catch (error) {
    await Promise.allSettled([screenshot(host, 'lan-host-failure'), screenshot(guest, 'lan-guest-failure')]);
    console.error('FAIL: ' + error.stack);
    if (errors.length) console.error('Browser errors: ' + JSON.stringify(errors));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    for (const [id, uid] of connections) {
      const identity = identities.find(item => item.localId === uid);
      if (identity) await fetch(config.databaseURL + '/connections/' + id + '.json?auth=' + encodeURIComponent(identity.idToken), { method: 'DELETE' }).catch(() => {});
    }
    for (const identity of identities) await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + config.apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: identity.idToken })
    }).catch(() => {});
  }
})();
