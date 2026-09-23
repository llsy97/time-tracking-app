'use strict';
// Integration tests against real Chromium, using its built-in DevTools protocol.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, '.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const browserPath = process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(artifacts, `browser-profile-${Date.now()}`);
const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: '4175' }, windowsHide: true, stdio: 'ignore' });
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9225', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let startError;
server.on('error', error => { startError = error; });
browser.on('error', error => { startError = error; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
async function waitFor(fn, name, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (startError) throw startError; if (await fn()) return; await sleep(100); }
  throw new Error(`Timeout: ${name}`);
}
async function run() {
  let targets;
  await waitFor(async () => { try { targets = await (await fetch('http://127.0.0.1:9225/json')).json(); return targets.some(t => t.type === 'page'); } catch { return false; } }, 'browser startup');
  await waitFor(async () => { try { return (await fetch('http://127.0.0.1:4175')).ok; } catch { return false; } }, 'server startup');
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map(); const errors = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) { const promise = pending.get(data.id); if (!promise) return; pending.delete(data.id); data.error ? promise.reject(new Error(data.error.message)) : promise.resolve(data.result); }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text + ' ' + (data.params.exceptionDetails.exception?.description || ''));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (id, value) => evaluate(`document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(value)}; document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input', {bubbles:true}));`);
  const submit = id => evaluate(`document.getElementById(${JSON.stringify(id)}).requestSubmit()`);
  const screenshot = async name => { await evaluate(`document.getElementById('toast').classList.remove('visible')`); await sleep(250); const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(artifacts, name), Buffer.from(image.data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:4175' });
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.getElementById('quickLabels')?.children.length`), 'app ready');
  assert.equal(await evaluate(`document.getElementById('blockCount').textContent`), '0');
  await screenshot('desktop-empty.png');
  await click('#toggleTrackingBtn');
  assert.equal(await evaluate(`!!activeEntry()`), true);
  await fill('taskTitle', 'Coding'); await fill('taskDescription', 'Build the daily overview');
  await send('Page.reload');
  await waitFor(() => evaluate(`document.readyState === 'complete' && document.getElementById('taskTitle')?.value === 'Coding'`), 'running timer reload');
  assert.equal(await evaluate(`!!activeEntry()`), true);
  await click('#toggleTrackingBtn');
  assert.equal(await evaluate(`document.getElementById('editDialog').open`), true);
  await submit('editForm');
  assert.equal(await evaluate(`workspace().entries.length`), 1);
  console.log('PASS: tracking, persistence, post-stop editing');
  await click('[data-remove-label="Coding"]');
  assert.equal(await evaluate(`!!document.querySelector('[data-label="Coding"]')`), false);
  assert.equal(await evaluate(`workspace().entries[0].title`), 'Coding');
  await send('Page.reload');
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.getElementById('quickLabels')?.children.length`), 'deleted label reload');
  assert.equal(await evaluate(`!!document.querySelector('[data-label="Coding"]')`), false);
  await click('#newLabelBtn'); await fill('labelName', 'coding'); await submit('labelForm');
  assert.equal(await evaluate(`document.querySelectorAll('[data-label="Coding"]').length`), 1);
  await click('[data-remove-label="Email"]');
  console.log('PASS: default label deletion persists, preserves records, and supports restoring labels');
  // Two manual blocks with the same title should be merged in the summary.
  const yesterday = await evaluate(`(() => { const date = new Date(); date.setDate(date.getDate()-1); return T.dayKey(date); })()`);
  await evaluate(`setDay(${JSON.stringify(yesterday)})`);
  for (const [start, end] of [['09:00:00', '09:07:00'], ['13:00:00', '13:07:00']]) {
    await click('#addBlockBtn'); await fill('editTitle', 'Design'); await fill('editDescription', 'Product explorations');
    await fill('editStart', `${yesterday}T${start}`); await fill('editEnd', `${yesterday}T${end}`); await submit('editForm');
    assert.equal(await evaluate(`document.getElementById('editDialog').open`), false);
  }
  assert.equal(await evaluate(`T.summarize(T.dailyEntries(workspace().entries, selectedDay))[0].ms`), 840000);
  assert.equal(await evaluate(`document.querySelectorAll('.summary-row').length`), 1);
  assert.equal(await evaluate(`document.querySelector('.summary-row strong').textContent`), '0.4h');
  assert.equal(await evaluate(`document.getElementById('donutTotal').textContent`), '0.4h');
  await click('[data-edit]'); await fill('editEnd', `${yesterday}T08:00:00`); await submit('editForm');
  assert.match(await evaluate(`document.getElementById('editError').textContent`), /End time/);
  await click('#editDialog [data-close]');
  console.log('PASS: manual entries, grouping, invalid time rejection');
  await click('#newLabelBtn'); await fill('labelName', 'Research'); await submit('labelForm');
  assert.equal(await evaluate(`workspace().labels.includes('Research')`), true);
  await click('[data-remove-label="Research"]');
  assert.equal(await evaluate(`workspace().labels.includes('Research')`), false);
  await click('#newLabelBtn'); await fill('labelName', 'Research'); await submit('labelForm');
  await click('[data-settings]'); await click('#themeToggle');
  assert.equal(await evaluate(`document.body.dataset.theme`), 'dark');
  await click('#settingsDialog [data-close]');
  await send('Page.reload'); await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.getElementById('quickLabels')?.children.length`), 'theme reload');
  assert.equal(await evaluate(`document.body.dataset.theme`), 'dark');
  assert.equal(await evaluate(`workspace().labels.includes('Research')`), true);
  await click('[data-settings]'); await click('#themeToggle'); await click('#accountButton');
  await click('[data-auth="signup"]'); await fill('authUsername', 'claire_test'); await fill('authPassword', 'test-password-123'); await fill('authConfirm', 'test-password-123'); await submit('authForm');
  await waitFor(() => evaluate(`!document.getElementById('authDialog').open`), 'account signup');
  assert.equal(await evaluate(`workspace().entries.length`), 0);
  assert.equal(await evaluate(`!!document.querySelector('[data-label="Email"]')`), true);
  assert.equal(await evaluate(`JSON.stringify(state).includes('test-password-123')`), false);
  await click('#toggleTrackingBtn'); await fill('taskTitle', 'Private task');
  await click('[data-settings]'); await click('#signOutBtn');
  assert.equal(await evaluate(`state.session`), null);
  assert.equal(await evaluate(`workspace().entries.some(e => e.title === 'Private task')`), false);
  await click('[data-account]'); await fill('authUsername', 'claire_test'); await fill('authPassword', 'wrong-password'); await submit('authForm');
  await waitFor(() => evaluate(`!!document.getElementById('authError').textContent`), 'wrong password');
  assert.match(await evaluate(`document.getElementById('authError').textContent`), /incorrect/);
  await fill('authPassword', 'test-password-123'); await submit('authForm'); await waitFor(() => evaluate(`!document.getElementById('authDialog').open`), 'account signin');
  assert.equal(await evaluate(`workspace().entries[0].title`), 'Private task');
  assert.equal(await evaluate(`!!activeEntry()`), false);
  await send('Page.reload');
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.getElementById('quickLabels')?.children.length`), 'account session reload');
  assert.equal(await evaluate(`state.accounts.find(a => a.id === state.session).username`), 'claire_test');
  console.log('PASS: labels, theme persistence, hashed accounts, sign-out, account isolation');
  await click('[data-settings]'); await click('#signOutBtn');
  await evaluate(`setDay(${JSON.stringify(yesterday)})`);
  await click('[data-delete]'); await submit('confirmForm');
  assert.equal(await evaluate(`T.dailyEntries(workspace().entries, selectedDay).length`), 1);
  await click('#clearDayBtn'); await submit('confirmForm');
  assert.equal(await evaluate(`T.dailyEntries(workspace().entries, selectedDay).length`), 0);
  assert.equal(await evaluate(`workspace().entries.length`), 1);
  console.log('PASS: delete and clear day preserve other dates');
  // Test-only sample data for visual review, never seeded into the real app.
  await evaluate(`commit(next => { const day = T.dayKey(); const [start] = T.dayBounds(day); workspace(next).entries = [
    ['Design','Exploring a new direction for the dashboard',9,10.5], ['Meeting','Weekly team sync & priorities',10.5,11],
    ['Email','Inbox catch-up and client follow-ups',11,11.5], ['Coding','Bringing the dashboard to life',12.5,14],
    ['Design','Refining the details',14,14.75]
  ].map(([title,description,a,b])=>({id:crypto.randomUUID(),title,description,startedAt:new Date(start+a*3600000).toISOString(),endedAt:new Date(start+b*3600000).toISOString()})); }); selectedDay = T.dayKey(); loadFields(); render();`);
  await screenshot('desktop.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
  assert.equal(await evaluate(`document.getElementById('toggleTrackingBtn').getBoundingClientRect().bottom < window.innerHeight - 70`), true);
  await screenshot('mobile.png');
  await click('.mobile-nav [data-view="summary"]');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('trackerSection')).display`), 'none');
  await screenshot('mobile-summary.png');
  await click('.mobile-nav [data-settings]'); await click('#themeToggle'); await click('#settingsDialog [data-close]');
  await screenshot('mobile-dark.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await click('.mobile-nav [data-view="dashboard"]');
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
  await click('#addBlockBtn');
  assert.equal(await evaluate(`document.getElementById('editDialog').scrollWidth <= document.getElementById('editDialog').clientWidth`), true);
  await click('#editDialog [data-close]');
  console.log('PASS: mobile layout at 390px/360px, navigation, dark mode, modal fit');
  await waitFor(() => evaluate(`navigator.serviceWorker.ready.then(() => true)`), 'service worker');
  await send('Page.reload'); await waitFor(() => evaluate(`document.readyState === 'complete' && !!navigator.serviceWorker.controller`), 'service worker control');
  await send('Network.enable'); await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.reload'); await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.getElementById('quickLabels')?.children.length`), 'offline shell');
  assert.equal(await evaluate(`document.getElementById('blockCount').textContent`), '5');
  console.log('PASS: offline reload preserves app and data');
  assert.deepEqual(errors, []);
  await send('Browser.close');
  console.log('All browser integration checks passed. Screenshots saved in .artifacts/.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { socket?.close(); browser.kill(); server.kill(); });
