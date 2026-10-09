/* Optional real-browser LAN check. Uses an installed browser; downloads nothing. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^(file|data|blob):/.test(url)) return route.continue();
    outsideRequests.push(url);
    return route.abort();
  });
  await context.addInitScript(name => {
    localStorage.setItem('bonk-local-settings', JSON.stringify({ p1: { name }, volume: 0 }));
  }, name);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  page.setDefaultTimeout(20000);
  await page.goto(fileUrl);
  await page.waitForFunction(() => typeof BonkRoom !== 'undefined');
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
  await host.waitForFunction(() => document.getElementById('lanOffer').value.length > 100);
  const offer = await host.locator('#lanOffer').inputValue();
  await guest.locator('#lanOfferInput').fill(offer);
  await guest.locator('#lanJoin').click();
  await guest.waitForFunction(() => document.getElementById('lanAnswer').value.length > 100);
  const answer = await guest.locator('#lanAnswer').inputValue();
  await host.locator('#lanAnswerInput').fill(answer);
  await host.locator('#lanAccept').click();
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
    await host.getByRole('button', { name: 'Criar sala LAN', exact: true }).click();
    await host.locator('#lanHumans').fill('2');
    await host.locator('#lanHumans').dispatchEvent('change');
    await host.locator('#lanBots').fill('3');
    await host.locator('#lanBots').dispatchEvent('change');
    await host.locator('#lanRounds').fill('5');
    await host.locator('#lanRounds').dispatchEvent('change');
    await host.locator('#lanMap').selectOption('local-flat');
    assert.equal(Number(await host.locator('#lanHumans').inputValue()) + Number(await host.locator('#lanBots').inputValue()), 5, 'Room must allow five humans + bots total');
    await guest.getByRole('button', { name: 'Entrar sala LAN', exact: true }).click();
    const beforeInvalid = await guest.locator('#toast').textContent();
    await guest.locator('#lanOfferInput').fill('invalid LAN offer');
    await guest.locator('#lanJoin').click();
    console.log('PASS: malformed offer gives feedback: ' + await toastAfter(guest, beforeInvalid));
    await handshake();
    await Promise.all([screenshot(host, 'lan-host-lobby'), screenshot(guest, 'lan-guest-lobby')]);
    console.log('PASS: file:// pages connect with a real WebRTC offer/answer and both show both names.');

    await host.locator('#lanStart').click();
    await Promise.all([running(host), running(guest)]);
    const [hostHud, guestHud] = await Promise.all([hud(host), hud(guest)]);
    assert.equal(hostHud.round, guestHud.round, 'Guest must show the host round');
    assert(Math.abs(hostHud.tick - guestHud.tick) <= 30, 'Guest HUD must follow host ticks within half a second');
    const first = await host.evaluate(() => BonkRoom.state());
    assert.equal(first.players.length, 5, 'Started room must contain two humans and three bots');
    assert.equal(first.players.filter(p => p.bot).length, 3);
    const remote = first.players.find(p => p.name === 'Guest QA');
    assert(remote && !remote.bot, 'Guest must be a human participant');
    assert.equal(await guest.evaluate(() => document.activeElement.id), 'arena', 'Starting LAN must focus the arena for keyboard controls');
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
    await guest.getByRole('button', { name: 'Entrar sala LAN', exact: true }).click();
    await handshake();
    assert.match(await guest.locator('#lanStatus').textContent(), /Conectado/, 'Reconnect must give visible feedback');
    await host.locator('#lanStart').click();
    await Promise.all([running(host), running(guest)]);
    await Promise.all([screenshot(host, 'lan-host-reconnected'), screenshot(guest, 'lan-guest-reconnected')]);
    console.log('PASS: a disconnected guest reconnects using a fresh invitation and can play again.');
    assert.deepEqual(errors, [], 'Uncaught browser errors are fatal');
    assert.deepEqual(outsideRequests, [], 'The game must not request external services');
    console.log('PASS: no uncaught browser errors or external page requests. Screenshots: ' + qa);
    console.log('LIMIT: both peers ran on this PC; this does not verify a second device, router, firewall or Chromebook.');
  } catch (error) {
    await Promise.allSettled([screenshot(host, 'lan-host-failure'), screenshot(guest, 'lan-guest-failure')]);
    console.error('FAIL: ' + error.stack);
    if (errors.length) console.error('Browser errors: ' + JSON.stringify(errors));
    process.exitCode = 1;
  } finally { if (browser) await browser.close(); }
})();
