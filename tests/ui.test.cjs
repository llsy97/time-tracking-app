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
  assert.equal(await evaluate(`document.getElementById('blockCount')`), null);
  const reloadApp = async () => {
    await send('Page.reload');
    await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.getElementById('quickLabels')?.children.length`), 'navigation reload');
  };
  for (const view of ['summary', 'history', 'dashboard']) {
    await click(`.mobile-nav [data-view="${view}"]`);
    await reloadApp();
    assert.equal(await evaluate(`document.body.dataset.view`), view);
    assert.equal(await evaluate(`document.querySelector('.mobile-nav .selected').dataset.view`), view);
  }
  await click('.mobile-nav [data-view="history"]');
  await click('.mobile-nav [data-settings]');
  await reloadApp();
  assert.equal(await evaluate(`document.getElementById('settingsDialog').open`), true);
  await click('#settingsDialog [data-close]');
  await waitFor(() => evaluate(`!document.body.classList.contains('settings-open')`), 'settings closed');
  await reloadApp();
  assert.equal(await evaluate(`document.body.dataset.view`), 'history');
  assert.equal(await evaluate(`document.getElementById('settingsDialog').open`), false);
  await evaluate(`sessionStorage.setItem(NAVIGATION_STORE, '{"view":"invalid","settings":true}')`);
  await reloadApp();
  assert.equal(await evaluate(`document.body.dataset.view`), 'dashboard');
  assert.equal(await evaluate(`document.getElementById('settingsDialog').open`), false);
  console.log('PASS: all tabs survive refresh, settings restores and closes, invalid navigation falls back safely');
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
  const rawEntries = await evaluate(`JSON.stringify(workspace().entries)`);
  await click('#roundingToggle');
  assert.equal(await evaluate(`document.getElementById('donutTotal').textContent`), '14m');
  assert.equal(await evaluate(`JSON.stringify(workspace().entries)`), rawEntries);
  await reloadApp();
  assert.equal(await evaluate(`state.roundUp`), false);
  await evaluate(`setDay(${JSON.stringify(yesterday)})`);
  assert.equal(await evaluate(`document.getElementById('donutTotal').textContent`), '14m');
  const nativeExport = await evaluate(`(async () => {
    const original = window.Capacitor;
    let written, shared;
    window.Capacitor = { isNativePlatform: () => true, Plugins: {
      Filesystem: { writeFile: async options => { written = options; return { uri: 'content://moa/report.csv' }; } },
      Share: { share: async options => { shared = options; } }
    } };
    try { await exportDay(); return { written, shared }; }
    finally { window.Capacitor = original; }
  })()`);
  assert.match(nativeExport.written.data, /Exact duration/);
  assert.match(nativeExport.written.data, /14m/);
  assert.equal(nativeExport.written.directory, 'CACHE');
  assert.deepEqual(nativeExport.shared.files, ['content://moa/report.csv']);
  await click('#roundingToggle');
  assert.equal(await evaluate(`document.getElementById('donutTotal').textContent`), '0.4h');
  assert.equal(await evaluate(`JSON.stringify(workspace().entries)`), rawEntries);
  console.log('PASS: exact/rounded setting persists without changing records; Android CSV share bridge');
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
  await click('[data-settings]'); await click('[data-theme-choice="light"]'); await click('#accountButton');
  await click('#cloudLocal'); await waitFor(() => evaluate(`document.getElementById('authDialog').open`), 'legacy account form');
  await click('[data-auth="signup"]'); await fill('authUsername', 'claire_test'); await fill('authPassword', 'test-password-123'); await fill('authConfirm', 'test-password-123'); await submit('authForm');
  await waitFor(() => evaluate(`!document.getElementById('authDialog').open`), 'account signup');
  assert.equal(await evaluate(`workspace().entries.length`), 0);
  assert.equal(await evaluate(`!!document.querySelector('[data-label="Email"]')`), true);
  assert.equal(await evaluate(`JSON.stringify(state).includes('test-password-123')`), false);
  await click('#toggleTrackingBtn'); await fill('taskTitle', 'Private task');
  await click('[data-settings]'); await click('#signOutBtn');
  assert.equal(await evaluate(`state.session`), null);
  assert.equal(await evaluate(`workspace().entries.some(e => e.title === 'Private task')`), false);
  await click('[data-account]'); await click('#cloudLocal'); await waitFor(() => evaluate(`document.getElementById('authDialog').open`), 'legacy signin form'); await fill('authUsername', 'claire_test'); await fill('authPassword', 'wrong-password'); await submit('authForm');
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
  assert.equal(await evaluate(`document.getElementById('trackerSection').getClientRects().length`), 0);
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
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await evaluate(`document.fonts.ready`);
  assert.equal(await evaluate(`document.fonts.check('16px "Geist"') && document.fonts.check('16px "Geist Mono"') && document.fonts.check('16px "Bricolage Grotesque"')`), true);
  for (const theme of ['light', 'dark']) {
    await click('.mobile-nav [data-settings]'); await click(`[data-theme-choice="${theme}"]`);
    await screenshot(`redesign-settings-${theme}.png`);
    await click('#settingsDialog [data-view="history"]');
    assert.equal(await evaluate(`document.getElementById('settingsDialog').open`), false);
    await screenshot(`redesign-blocks-${theme}.png`);
    await click('[data-edit]');
    assert.match(await evaluate(`document.getElementById('editReadout').textContent`), /billed/);
    await screenshot(`redesign-edit-${theme}.png`);
    await click('#editDialog [data-close]');
    await click('.mobile-nav [data-view="summary"]');
    assert.match(await evaluate(`document.getElementById('dateLabel').textContent`), /\d/);
    await screenshot(`redesign-summary-${theme}.png`);
    await click('.mobile-nav [data-view="dashboard"]');
    await screenshot(`redesign-idle-${theme}.png`);
    await evaluate(`commit(next => { workspace(next).entries.push({ id:'visual-active', title:'Coding', description:'1. Push to github\\n2. Fix the rounding edge case', startedAt:new Date(Date.now()-1450000).toISOString(), endedAt:null }); }); loadFields(); render();`);
    assert.equal(await evaluate(`document.getElementById('roundedCurrent').textContent`), '0.5h rounded');
    assert.equal(await evaluate(`document.querySelector('.button-shortcut')`), null);
    await screenshot(`redesign-tracking-${theme}.png`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
    await evaluate(`commit(next => { workspace(next).entries = workspace(next).entries.filter(entry => entry.id !== 'visual-active'); }); loadFields(); render();`);
  }
  await click('.mobile-nav [data-settings]'); await click('[data-theme-choice="system"]');
  await send('Emulation.setEmulatedMedia', { features: [{ name:'prefers-color-scheme', value:'dark' }] });
  await waitFor(() => evaluate(`document.body.dataset.theme === 'dark'`), 'system dark mode');
  await send('Emulation.setEmulatedMedia', { features: [{ name:'prefers-color-scheme', value:'light' }] });
  await waitFor(() => evaluate(`document.body.dataset.theme === 'light'`), 'system light mode');
  assert.equal(await evaluate(`document.documentElement.dataset.theme`), 'system');
  await click('#settingsDialog [data-close]');
  console.log('PASS: redesign screens in both themes, local fonts, live rounding preview, touch shortcut visibility, system theme');
  const beforeProductivity = await evaluate(`JSON.stringify(state)`);
  await click('.mobile-nav [data-view="dashboard"]');
  await fill('taskTitle','Pause test'); await click('#toggleTrackingBtn');
  await evaluate(`commit(next => {workspace(next).entries.find(e=>!e.endedAt).startedAt=new Date(Date.now()-420000).toISOString();});render();`);
  await click('#pauseTrackingBtn');
  const pausedMs=await evaluate(`T.elapsed(activeEntry())`);
  assert.equal(await evaluate(`T.isPaused(activeEntry())`),true);
  assert.equal(await evaluate(`T.elapsed(activeEntry(),Date.now()+3600000)`),pausedMs);
  await reloadApp();
  assert.equal(await evaluate(`document.getElementById('pauseTrackingBtn').textContent`),'Resume');
  assert.equal(await evaluate(`T.elapsed(activeEntry())`),pausedMs);
  await screenshot('timer-paused.png');
  await click('#pauseTrackingBtn');
  assert.equal(await evaluate(`T.isPaused(activeEntry())`),false);
  await click('#toggleTrackingBtn'); await fill('editTitle','Pause edited'); await submit('editForm');
  assert.equal(await evaluate(`workspace().entries.find(e=>e.title==='Pause edited').pauses.length`),1);
  assert.equal(await evaluate(`workspace().entries.find(e=>e.title==='Pause edited').pauses[0].endedAt !== null`),true);
  for(const view of ['dashboard','summary','history']){
    await click(`.mobile-nav [data-view="${view}"]`); await click('.topbar [data-calendar]');
    assert.equal(await evaluate(`document.getElementById('calendarDialog').open`),true);
    assert.equal(await evaluate(`!!document.querySelector('.calendar-day.selected .recorded-dot')`),true);
    assert.equal(await evaluate(`document.querySelectorAll('.calendar-day').length`),42);
    if(view==='summary')await screenshot('calendar-light.png');
    await click('#calendarDialog [data-close]');
  }
  await click('.mobile-nav [data-settings]');await click('[data-theme-choice="dark"]');await click('#settingsDialog [data-close]');await click('.header-controls [data-calendar]');
  await screenshot('calendar-dark.png');
  const chosen=await evaluate(`document.querySelector('.calendar-day:not(.outside):not(.selected):not(:disabled)').dataset.calendarDay`);
  await click(`[data-calendar-day="${chosen}"]`);
  assert.equal(await evaluate(`selectedDay`),chosen);
  assert.equal(await evaluate(`document.getElementById('settingsDialog').open`),false);
  await reloadApp();assert.equal(await evaluate(`selectedDay`),chosen);
  await click('.header-controls [data-calendar]');await click('#calendarToday');
  await click('.mobile-nav [data-settings]');await click('[data-theme-choice="light"]');await click('#settingsDialog [data-close]');
  for(const view of ['dashboard','summary','history']){
    await click(`.mobile-nav [data-view="${view}"]`);
    assert.equal(await evaluate(`document.getElementById('nextDay').disabled`),true);
    await click('.header-controls [data-calendar]');
    const tomorrow=await evaluate(`(()=>{const d=new Date();d.setDate(d.getDate()+1);return T.dayKey(d)})()`);
    assert.equal(await evaluate(`document.querySelector('[data-calendar-day="${tomorrow}"]').disabled`),true);
    assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`),'none');
    await click(`[data-calendar-day="${tomorrow}"]`);
    assert.equal(await evaluate(`document.getElementById('calendarDialog').open`),true);
    assert.equal(await evaluate(`selectedDay===T.dayKey()`),true);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    assert.equal(await evaluate(`document.activeElement.dataset.calendarDay===T.dayKey()`),true);
    assert.equal(await evaluate(`document.getElementById('calendarNext').disabled`),true);
    assert.equal(await evaluate(`setDay('${tomorrow}')`),false);
    await click('#calendarDialog [data-close]');
  }
  await evaluate(`(()=>{const d=new Date();d.setDate(d.getDate()+1);sessionStorage.setItem(NAVIGATION_STORE,JSON.stringify({view:'history',day:T.dayKey(d)}));})()`);
  await reloadApp();assert.equal(await evaluate(`selectedDay===T.dayKey()`),true);
  await click('.mobile-nav [data-settings]');
  assert.equal(await evaluate(`document.querySelector('#settingsDialog [data-calendar]')`),null);
  assert.equal(await evaluate(`document.getElementById('blockCount')`),null);
  assert.equal(await evaluate(`document.getElementById('listCount')`),null);
  await click('#settingsDialog [data-close]');
  await click('.header-controls [data-calendar]');
  await screenshot('calendar-unavailable.png');
  await click('#calendarDialog [data-close]');
  await click('.mobile-nav [data-view="dashboard"]');
  await evaluate(`document.getElementById('quickLabels').scrollIntoView({block:'center'});document.getElementById('quickLabels').scrollLeft=0;`);
  const labelsBefore=await evaluate(`availableLabels()`);
  const titleBefore=await evaluate(`document.getElementById('taskTitle').value`);
  const points=await evaluate(`[...document.querySelectorAll('#quickLabels [data-label]')].slice(0,2).map(b=>{const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});await sleep(550);
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:points[1].x+20,y:points[1].y,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
  assert.equal(await evaluate(`availableLabels()[0]`),labelsBefore[1]);
  assert.equal(await evaluate(`document.getElementById('taskTitle').value`),titleBefore);
  await reloadApp();assert.equal(await evaluate(`availableLabels()[0]`),labelsBefore[1]);
  await evaluate(`document.querySelector('#quickLabels [data-label]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true}));`);
  assert.equal(await evaluate(`availableLabels()[0]`),labelsBefore[0]);
  await evaluate(`localStorage.setItem(STORE,${JSON.stringify(beforeProductivity)});state=readState();setDay(T.dayKey());loadFields();render();`);
  console.log('PASS: pause/resume persistence, edit preserves breaks, shared calendar and record dots, date persistence, touch and keyboard label ordering');
  await evaluate(`(async()=>{
    window.widgetRequest={};window.widgetSnapshot=null;window.nativeJournal={revision:0,pending:[],entry:null};window.widgetListeners={};
    window.publishNativeChange=(entry,owner=state.session||'guest',draft)=>{
      nativeJournal.revision++;nativeJournal.entry=entry.endedAt?null:entry;
      nativeJournal.pending.push({owner,entry:structuredClone(entry),...(draft?{draft}:{})});
      widgetListeners.trackerChanged();
    };
    window.Capacitor={isNativePlatform:()=>true,Plugins:{MoaTracker:{
      async getSettings(){return {notifications:false};},async getSnapshot(){return structuredClone(nativeJournal);},
      async update(snapshot){
        if(window.raceEntry){const entry=window.raceEntry;window.raceEntry=null;publishNativeChange(entry);}
        if(snapshot.revision!==nativeJournal.revision)return {...structuredClone(nativeJournal),accepted:false};
        window.widgetSnapshot=snapshot;nativeJournal.pending=[];nativeJournal.entry=snapshot.entry;return {...structuredClone(nativeJournal),accepted:true};
      },
      async pinWidget(options){window.requestedWidgetSize=options.size;return {supported:true};},async setNotifications(options){return {enabled:options.enabled};},
      async consumeAction(){const result=window.widgetRequest;window.widgetRequest={};return result;},
      addListener(name,callback){window.widgetListeners[name]=callback;return Promise.resolve({remove(){}});}
    }}};
    (0,eval)(await(await fetch('native-tracker.js')).text());
  })()`);
  await waitFor(()=>evaluate(`widgetSnapshot?.status === 'idle'`),'widget idle snapshot');
  await waitFor(()=>evaluate(`window.nativeTrackerReady === true`),'widget initial migration');
  await click('.mobile-nav [data-settings]');await click('#pinTrackerWidget');
  assert.equal(await evaluate(`requestedWidgetSize`),'1x4');
  await click('#pinTrackerWidgetTall');assert.equal(await evaluate(`requestedWidgetSize`),'2x4');
  await click('#settingsDialog [data-close]');
  await click('.mobile-nav [data-view="summary"]');
  await evaluate(`window.nativeEntry={id:'background-block',title:'Untitled task',description:'',startedAt:new Date(Date.now()-420000).toISOString(),endedAt:null};publishNativeChange(nativeEntry);`);
  await waitFor(()=>evaluate(`!!activeEntry()`),'widget start');
  await waitFor(()=>evaluate(`widgetSnapshot?.status === 'running'`),'widget running snapshot');
  assert.equal(await evaluate(`document.body.dataset.view`),'summary');
  await evaluate(`nativeEntry.pauses=[{startedAt:new Date().toISOString(),endedAt:null}];publishNativeChange(nativeEntry);`);
  await waitFor(()=>evaluate(`T.isPaused(activeEntry())`),'widget pause');
  await waitFor(()=>evaluate(`widgetSnapshot?.status === 'paused'`),'widget paused snapshot');
  await evaluate(`nativeEntry.pauses[0].endedAt=new Date().toISOString();publishNativeChange(nativeEntry);`);
  await waitFor(()=>evaluate(`!T.isPaused(activeEntry())`),'widget resume');
  await evaluate(`nativeEntry.endedAt=new Date().toISOString();publishNativeChange(nativeEntry,undefined,{title:'',description:''});`);
  await waitFor(()=>evaluate(`!activeEntry()`),'widget stop');
  assert.equal(await evaluate(`document.getElementById('editDialog').open`),false);
  assert.equal(await evaluate(`document.body.dataset.view`),'summary');
  assert.equal(await evaluate(`workspace().entries.filter(e=>e.id==='background-block').length`),1);
  // A widget action arriving during a WebView snapshot must win the compare-and-save race.
  await evaluate(`window.raceEntry={id:'race-block',title:'Untitled task',description:'',startedAt:new Date().toISOString(),endedAt:null};window.syncNativeTracker(true);`);
  await waitFor(()=>evaluate(`activeEntry()?.id === 'race-block' && window.nativeTrackerReady === true`),'widget action racing with app snapshot');
  await evaluate(`nativeEntry=structuredClone(activeEntry());nativeEntry.endedAt=new Date().toISOString();publishNativeChange(nativeEntry);`);
  await waitFor(()=>evaluate(`!activeEntry() && window.nativeTrackerReady === true`),'racing block saved');
  // Re-importing an already persisted journal must not undo a later app edit.
  await evaluate(`commit(next=>{workspace(next).entries.find(e=>e.id==='background-block').title='Retitled in app';});nativeJournal.pending=[{owner:state.session||'guest',entry:{...workspace().entries.find(e=>e.id==='background-block'),title:'Untitled task'}}];window.syncNativeTracker(true);`);
  await waitFor(()=>evaluate(`nativeJournal.pending.length === 0 && window.nativeTrackerReady === true`),'idempotent journal acknowledgement');
  assert.equal(await evaluate(`workspace().entries.find(e=>e.id==='background-block').title`),'Retitled in app');
  await evaluate(`window.otherOwner=state.accounts[0].id;publishNativeChange({id:'other-widget-block',title:'Untitled task',description:'',startedAt:new Date(Date.now()-60000).toISOString(),endedAt:new Date().toISOString()},otherOwner);`);
  await waitFor(()=>evaluate(`state.workspaces[otherOwner].entries.some(e=>e.id==='other-widget-block') && window.nativeTrackerReady === true`),'widget records restore to original account');
  assert.equal(await evaluate(`workspace().entries.some(e=>e.id==='other-widget-block')`),false);
  const coldJournal=await evaluate(`({revision:nativeJournal.revision+1,pending:[{owner:state.session||'guest',entry:{id:'cold-widget-block',title:'Untitled task',description:'',startedAt:new Date(Date.now()-120000).toISOString(),endedAt:new Date().toISOString()}}],entry:null})`);
  const coldBridge=await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.nativeJournal=${JSON.stringify(coldJournal)};window.Capacitor={isNativePlatform:()=>true,Plugins:{MoaTracker:{async getSettings(){return {notifications:false}},async getSnapshot(){return structuredClone(nativeJournal)},async update(payload){if(payload.revision!==nativeJournal.revision)return {...structuredClone(nativeJournal),accepted:false};nativeJournal.pending=[];return {...structuredClone(nativeJournal),accepted:true}},async consumeAction(){return {}},addListener(){return Promise.resolve({remove(){}})}}}};`});
  await reloadApp();
  await waitFor(()=>evaluate(`workspace().entries.some(e=>e.id==='cold-widget-block') && window.nativeTrackerReady === true`),'cold start imports widget records');
  assert.equal(await evaluate(`workspace().entries.filter(e=>e.id==='cold-widget-block').length`),1);
  assert.equal(await evaluate(`document.body.dataset.view`),'summary');
  assert.equal(await evaluate(`!!activeEntry()`),false);
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:coldBridge.identifier});
  await evaluate(`localStorage.setItem(STORE,${JSON.stringify(beforeProductivity)});`);
  await reloadApp();
  console.log('PASS: background widget start/pause/resume/stop import, view preserved, no edit popup, compare-and-save race and idempotent acknowledgement');
  await evaluate(`(async()=>{
    window.widgetRequest={};window.widgetSnapshot=null;
    window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:{MoaTracker:{
      async update(snapshot){window.widgetSnapshot=snapshot;},
      async consumeAction(){const result=window.widgetRequest;window.widgetRequest={};return result;},
      addListener(name,callback){window.widgetListener=callback;return Promise.resolve({remove(){}});}
    }}};
    (0,eval)(await(await fetch('native-tracker.js')).text());
  })()`);
  await waitFor(()=>evaluate(`widgetSnapshot?.theme === document.body.dataset.theme`),'iOS appearance snapshot');
  assert.equal(await evaluate(`document.querySelector('#lockTrackerToggle') === null`),true);
  assert.equal(await evaluate(`document.documentElement.classList.contains('native-app')`),true);
  assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--screen-inset-top').trim()`),'0px');
  await click('.mobile-nav [data-settings]');await click('#pinTrackerWidget');
  assert.match(await evaluate(`document.getElementById('toast').textContent`),/Home or Lock Screen/);
  assert.match(await evaluate(`document.querySelector('.widget-settings').textContent`),/Customize.*Add Widgets/);
  await click('#settingsDialog [data-close]');
  await evaluate(`widgetRequest={action:'start'};widgetListener();`);
  await waitFor(()=>evaluate(`!!activeEntry()`),'iOS widget opens and starts tracker');
  await evaluate(`widgetRequest={action:'stop',entryId:activeEntry().id};widgetListener();`);
  await waitFor(()=>evaluate(`!activeEntry()`),'iOS widget stop');
  await click('#editDialog [data-close]');
  await evaluate(`localStorage.setItem(STORE,${JSON.stringify(beforeProductivity)});`);await reloadApp();
  console.log('PASS: iOS widget instructions and action bridge, theme mirror, native CSS safe-area override');
  const standaloneScript=await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'standalone',{value:true});"});
  await reloadApp();
  assert.equal(await evaluate(`document.documentElement.classList.contains('standalone-app')`),true);
  await evaluate(`document.documentElement.style.setProperty('--shell-safe-top','28px');document.documentElement.style.setProperty('--shell-safe-bottom','22px');document.body.scrollTop=400;`);
  assert.equal(await evaluate(`document.body.getBoundingClientRect().top`),28);
  assert.equal(await evaluate(`document.querySelector('.mobile-nav').getBoundingClientRect().bottom===innerHeight-22`),true);
  assert.equal(await evaluate(`document.elementFromPoint(100,10).tagName`),'HTML');
  await click('.mobile-nav [data-settings]');
  assert.equal(await evaluate(`document.getElementById('settingsDialog').getBoundingClientRect().top`),28);
  assert.equal(await evaluate(`document.querySelector('.settings-nav').getBoundingClientRect().bottom===innerHeight-22`),true);
  await click('#settingsDialog [data-close]');await click('.header-controls [data-calendar]');
  assert.equal(await evaluate(`(()=>{const r=document.getElementById('calendarDialog').getBoundingClientRect();return r.top>=28&&r.bottom<=innerHeight-22})()`),true);
  await screenshot('standalone-safe-screen.png');
  await click('#calendarDialog [data-close]');
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:standaloneScript.identifier});await reloadApp();
  console.log('PASS: installed website scroll, navigation and dialogs stay within simulated device safe areas');
  // Exercise account gating with a deterministic SDK double; no real accounts or emails.
  await evaluate(`(() => {
    window.realAuth = window.MoaAuth;
    window.authCalls = { sent: 0, reset: 0 };
    window.MoaAuth = {
      ready: Promise.resolve(), user: null,
      async signup(email, password, name) { this.user = {uid:'test-cloud', email, displayName:name, emailVerified:false}; authCalls.sent++; return this.user; },
      async signin() { throw {code:'auth/invalid-credential'}; },
      async google() { throw {code:'auth/popup-closed-by-user'}; },
      async resend() { authCalls.sent++; },
      async refresh() { return this.user; },
      async reset() { authCalls.reset++; },
      async signout() { this.user = null; syncCloudUser(null); }
    };
  })()`);
  await click('[data-account]');
  await screenshot('cloud-signin.png');
  await fill('cloudEmail', 'test@example.com'); await fill('cloudPassword', 'wrong-password'); await submit('cloudAuthForm');
  await waitFor(() => evaluate(`!cloudBusy`), 'cloud wrong password');
  assert.match(await evaluate(`document.getElementById('cloudError').textContent`), /incorrect/);
  await click('#cloudReset'); await waitFor(() => evaluate(`!cloudBusy`), 'password reset');
  assert.equal(await evaluate(`authCalls.reset`), 1);
  await click('#cloudGoogle'); await waitFor(() => evaluate(`!cloudBusy`), 'cancelled Google popup');
  assert.match(await evaluate(`document.getElementById('cloudError').textContent`), /cancelled/);
  await click('[data-cloud-mode="signup"]');
  await fill('cloudName', 'Cloud test'); await fill('cloudEmail', 'test@example.com'); await fill('cloudPassword', 'test-password-123'); await fill('cloudConfirm', 'test-password-123');
  await submit('cloudAuthForm'); await waitFor(() => evaluate(`!cloudBusy`), 'cloud signup');
  assert.equal(await evaluate(`state.session`), null);
  assert.equal(await evaluate(`document.getElementById('cloudVerification').classList.contains('hidden')`), false);
  assert.equal(await evaluate(`authCalls.sent`), 1);
  await screenshot('cloud-verification.png');
  await click('#verificationResend'); await waitFor(() => evaluate(`!cloudBusy`), 'resend cooldown');
  assert.equal(await evaluate(`authCalls.sent`), 1);
  await evaluate(`lastVerificationSent = 0`);
  await click('#verificationResend'); await waitFor(() => evaluate(`!cloudBusy`), 'verification resend');
  assert.equal(await evaluate(`authCalls.sent`), 2);
  await click('#verificationCheck'); await waitFor(() => evaluate(`!cloudBusy`), 'still unverified');
  assert.equal(await evaluate(`state.session`), null);
  await evaluate(`window.MoaAuth.user.emailVerified = true`);
  await click('#verificationCheck'); await waitFor(() => evaluate(`!cloudBusy`), 'verified signin');
  assert.equal(await evaluate(`state.session`), 'cloud:test-cloud');
  assert.equal(await evaluate(`workspace().entries.length`), 0);
  assert.equal(await evaluate(`document.getElementById('cloudAuthDialog').open`), false);
  await click('#toggleTrackingBtn'); await fill('taskTitle', 'Cloud private block');
  await click('[data-settings]'); await click('#signOutBtn');
  await waitFor(() => evaluate(`state.session === null`), 'cloud signout');
  assert.equal(await evaluate(`state.workspaces['cloud:test-cloud'].entries[0].endedAt !== null`), true);
  assert.equal(await evaluate(`workspace().entries.some(entry => entry.title === 'Cloud private block')`), false);
  await evaluate(`commit(next => { next.session = 'cloud:test-cloud'; }); window.MoaAuth = window.realAuth;`);
  await reloadApp();
  await waitFor(() => evaluate(`!document.body.classList.contains('auth-loading')`), 'untrusted saved cloud session');
  assert.equal(await evaluate(`state.session`), null);
  assert.equal(await evaluate(`state.workspaces['cloud:test-cloud'].entries.length`), 1);
  console.log('PASS: email verification gate, resend cooldown, password reset, cancelled Google flow, cloud isolation and SDK-backed session restore');
  await waitFor(() => evaluate(`navigator.serviceWorker.ready.then(() => true)`), 'service worker');
  await send('Page.reload'); await waitFor(() => evaluate(`document.readyState === 'complete' && !!navigator.serviceWorker.controller`), 'service worker control');
  await send('Network.enable'); await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.reload'); await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.getElementById('quickLabels')?.children.length`), 'offline shell');
  assert.equal(await evaluate(`workspace().entries.length`), 5);
  console.log('PASS: offline reload preserves app and data');
  assert.deepEqual(errors, []);
  await send('Browser.close');
  console.log('All browser integration checks passed. Screenshots saved in .artifacts/.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { socket?.close(); browser.kill(); server.kill(); });
