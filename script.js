'use strict';
const $ = id => document.getElementById(id);
const T = window.TempoTime;
const STORE = 'tempo.workspace.v2';
const DEFAULT_LABELS = ['Design', 'Meeting', 'Email', 'Coding', 'Planning', 'Docs', 'Review', 'Other'];
const COLORS = ['var(--cat-design)', 'var(--cat-meeting)', 'var(--cat-email)', 'var(--cat-coding)', 'var(--cat-planning)', 'var(--cat-docs)', 'var(--cat-review)', 'var(--cat-other)'];
const blankWorkspace = () => ({ entries: [], labels: [], removedDefaultLabels: [], draft: { title: '', description: '' } });
const blankState = () => ({ version: 2, accounts: [], session: null, theme: 'light', workspaces: { guest: blankWorkspace() } });
let storageBroken = false;
function readState() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 2 || !Array.isArray(parsed.accounts) || !parsed.workspaces?.guest) throw new Error('Invalid workspace');
      if (!parsed.accounts.some(a => a.id === parsed.session)) parsed.session = null;
      return parsed;
    }
    const initial = blankState();
    const legacy = JSON.parse(localStorage.getItem('timekeeping-app.entries.v1') || '[]');
    if (Array.isArray(legacy)) initial.workspaces.guest.entries = legacy.filter(e => e.id && Number.isFinite(Date.parse(e.startedAt)) && (!e.endedAt || Date.parse(e.endedAt) >= Date.parse(e.startedAt))).map(e => ({ ...e, title: String(e.title || 'Untitled task'), description: String(e.description || '') }));
    return initial;
  } catch {
    storageBroken = true;
    return blankState();
  }
}
let state = readState();
let selectedDay = T.dayKey();
let editingId = null;
let authMode = 'signin';
let confirmation = null;
let toastTimeout;
let installPrompt = null;
let googleLibrary;
let googleSetupGeneration = 0;
const workspace = (s = state) => s.workspaces[s.session || 'guest'];
const activeEntry = () => workspace().entries.find(e => !e.endedAt);
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const color = title => {
  const index = DEFAULT_LABELS.findIndex(label => label.toLowerCase() === title.trim().toLowerCase());
  return COLORS[index >= 0 ? index : [...title.toLowerCase()].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
};
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 4200);
}
function commit(change) {
  if (storageBroken) { toast('Storage could not be read. Export existing data before resetting browser storage.'); return false; }
  try {
    // Read immediately before writing so another open window cannot silently overwrite newer blocks.
    const latest = localStorage.getItem(STORE);
    const next = latest ? JSON.parse(latest) : structuredClone(state);
    if (next.session !== state.session) {
      state = next; loadFields(); render(); toast('The account changed in another window. Please try again.'); return false;
    }
    change(next);
    localStorage.setItem(STORE, JSON.stringify(next));
    state = next;
    return true;
  } catch { toast('Could not save. Your device storage may be full or unavailable.'); return false; }
}
function showDialog(id) {
  const dialog = $(id);
  if (!dialog.open) dialog.showModal();
  if (id === 'settingsDialog') document.body.classList.add('settings-open');
}
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const theme = ['light', 'dark', 'system'].includes(state.theme) ? state.theme : 'light';
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
}
systemTheme.addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });
function loadFields() {
  const entry = activeEntry();
  const values = entry || workspace().draft;
  $('taskTitle').value = entry?.title === 'Untitled task' ? '' : values.title;
  $('taskDescription').value = values.description;
}
function availableLabels(ws = workspace()) {
  return [...DEFAULT_LABELS.filter(label => !(ws.removedDefaultLabels || []).includes(label)), ...ws.labels];
}
function removeLabel(name) {
  if (!commit(next => {
    const ws = workspace(next);
    if (DEFAULT_LABELS.includes(name)) ws.removedDefaultLabels = [...new Set([...(ws.removedDefaultLabels || []), name])];
    ws.labels = ws.labels.filter(label => label !== name);
  })) return;
  renderLabels();
  $('newLabelBtn').focus({ preventScroll: true });
  toast('Label removed. Your time blocks are unchanged.');
}
function renderLabels() {
  const current = $('taskTitle').value.trim().toLowerCase();
  $('quickLabels').innerHTML = availableLabels().map(label => `<span class="label-chip"><button class="chip${label.toLowerCase() === current ? ' selected' : ''}" data-label="${escapeHtml(label)}" aria-pressed="${label.toLowerCase() === current}"><i style="--chip-color:${color(label)}"></i>${escapeHtml(label)}</button><button class="remove-label" data-remove-label="${escapeHtml(label)}" aria-label="Remove ${escapeHtml(label)} label" title="Remove label">×</button></span>`).join('') + '<button class="chip add-label" id="newLabelBtn">' + icon('plus') + ' New label</button>';
}
function updateLabelSelection() {
  document.querySelectorAll('[data-label]').forEach(el => {
    const selected = el.dataset.label.toLowerCase() === $('taskTitle').value.trim().toLowerCase();
    el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected));
  });
}
function renderAccount() {
  const account = state.accounts.find(a => a.id === state.session);
  $('profileName').textContent = account?.username || 'Your workspace';
  $('profileStatus').textContent = account ? 'Local account' : 'Saved on this device';
  $('avatar').textContent = (account?.username || 'Y').slice(0, 1).toUpperCase();
  $('settingsAccount').textContent = account ? account.username : 'Local workspace';
  $('settingsAccountHint').textContent = account ? 'Stored in this account on this device' : 'Stored in this browser only';
  $('accountButton').classList.toggle('hidden', !!account);
  $('signOutBtn').classList.toggle('hidden', !account);
}
function readableDay(day) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function updateDateLabel() {
  const summary = document.body.dataset.view === 'summary';
  $('dateLabel').textContent = new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US', { ...(summary ? {} : { weekday: 'short' }), month: 'short', day: 'numeric' });
  $('dateLabel').title = readableDay(selectedDay);
}
function timeLabel(value, includeDate = false) {
  return new Date(value).toLocaleTimeString('en-US', { ...(includeDate ? { month: 'short', day: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' });
}
function renderLive() {
  const now = Date.now();
  const active = activeEntry();
  const elapsed = active ? Math.max(0, now - Date.parse(active.startedAt)) : 0;
  const timerParts = T.timer(elapsed).split(':');
  $('timerDisplay').innerHTML = `${timerParts[0]}<span class="colon">:</span>${timerParts[1]}<span class="colon">:</span><span class="seconds">${timerParts[2]}</span>`;
  const wasTracking = document.body.classList.contains('is-tracking');
  document.body.classList.toggle('is-tracking', !!active);
  if (!!active !== wasTracking) $('taskNotes').open = !!active;
  $('workingMeta').innerHTML = active ? `<span class="working-label"><i style="background:${color(active.title)}"></i>${escapeHtml(active.title)}</span><span>since ${timeLabel(active.startedAt)}</span>` : '';
  const rounded = T.roundedTenths(elapsed);
  const boundary = Math.max(1, rounded) * 360000;
  $('roundingFill').style.width = `${Math.min(100, elapsed / boundary * 100)}%`;
  $('roundedCurrent').textContent = `${T.roundedHours(elapsed)}h rounded`;
  $('roundingNext').textContent = `next ${((rounded + 1) / 10).toFixed(1)}h after ${T.timer(rounded * 360000).replace(/^00:/, '')}`;
  $('trackingStatus').innerHTML = `<i></i>${active ? 'Recording' : 'Ready when you are'}`;
  $('trackingStatus').classList.toggle('active', !!active);
  $('toggleTrackingBtn').classList.toggle('running', !!active);
  $('trackingButtonText').textContent = active ? 'Stop & save block' : 'Start tracking';
  $('timerHint').textContent = active ? `Started at ${timeLabel(active.startedAt)} · You can add a title as you go.` : 'One task. One timer. A little more clarity.';
  const entries = T.dailyEntries(workspace().entries, selectedDay, now);
  const groups = T.summarize(entries);
  const total = groups.reduce((sum, group) => sum + group.ms, 0);
  const totalTenths = groups.reduce((sum, group) => sum + group.tenths, 0);
  $('totalTracked').innerHTML = `${(totalTenths / 10).toFixed(1)}<span>h</span>`;
  $('totalTracked').title = T.timer(total);
  $('actualTotal').textContent = T.timer(total);
  $('summaryActual').textContent = T.timer(total);
  $('trackerFootnote').textContent = active ? `Day total ${(totalTenths / 10).toFixed(1)}h · ${entries.length} blocks` : 'Saved automatically, even if you close the app.';
  $('totalCaption').textContent = entries.some(e => !e.endedAt && selectedDay === T.dayKey()) ? 'Tracking live · keep your focus' : entries.length ? `${T.timer(total)} actual · each block rounded up` : 'A fresh start for your day';
  $('blockCount').textContent = entries.length;
  $('listCount').textContent = entries.length;
  $('blockCaption').textContent = entries.length ? `${groups.length} unique task${groups.length === 1 ? '' : 's'} throughout the day` : 'One task, one moment at a time';
  $('topTask').textContent = groups[0]?.title || 'A clean slate';
  $('topTaskCaption').textContent = groups.length ? `${(groups[0].tenths / 10).toFixed(1)}h · rounded task total` : 'Your focus will show up here';
  $('donutTotal').innerHTML = `${(totalTenths / 10).toFixed(1)}<span>h</span>`;
  $('donutSubtitle').textContent = `actual · ${groups.length} tasks`;
  $('summaryDonut').innerHTML = groups.map(group => `<span style="flex:${group.tenths};background:${color(group.title)}" title="${escapeHtml(group.title)}: ${(group.tenths / 10).toFixed(1)}h"></span>`).join('');
  $('summaryDonut').setAttribute('aria-label', groups.length ? groups.map(group => `${group.title}: ${(group.tenths / 10).toFixed(1)} hours`).join(', ') : 'No time tracked');
  $('summaryList').innerHTML = groups.length ? groups.map(group => {
    const percentage = totalTenths ? Math.round(group.tenths / totalTenths * 100) : 0;
    return `<div class="summary-row" style="--color:${color(group.title)}"><i class="color-dot"></i><div class="summary-task"><span class="summary-name">${escapeHtml(group.title)}</span><span class="num actual-duration">${T.timer(group.ms)}</span></div><strong>${(group.tenths / 10).toFixed(1)}h</strong><small>${percentage}%</small></div>`;
  }).join('') : '<div class="summary-empty"><strong>A little focus starts here.</strong>Track your first task to see how your day comes together.</div>';
  renderRibbons(entries, now);
  $('summaryExportBtn').disabled = !entries.length;
  $('settingsExportBtn').disabled = !entries.length;
  entries.forEach(entry => {
    const durationEl = document.querySelector(`[data-duration="${CSS.escape(entry.id)}"]`);
    if (durationEl) durationEl.textContent = `${T.roundedHours(entry.ms)}h`;
    const actualEl = document.querySelector(`[data-actual-duration="${CSS.escape(entry.id)}"]`);
    if (actualEl) actualEl.textContent = T.duration(entry.ms);
  });
  $('clearDayBtn').disabled = !entries.length;
  $('exportBtn').disabled = !entries.length;
}
function renderRibbons(entries, now) {
  const [start, end] = T.dayBounds(selectedDay);
  const fraction = value => {
    if (value <= start) return 0;
    if (value >= end) return 100;
    const date = new Date(value);
    return (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) / 864;
  };
  const segments = entries.map(entry => `<span class="ribbon-segment" style="left:${fraction(entry.sliceStart)}%;width:${Math.max(0, fraction(entry.sliceEnd) - fraction(entry.sliceStart))}%;background:${color(entry.title)}" title="${escapeHtml(entry.title)} · ${T.duration(entry.ms)}"></span>`).join('');
  const marker = selectedDay === T.dayKey(now) ? `<span class="ribbon-now" style="left:${fraction(now)}%" title="Now"></span>` : '';
  document.querySelectorAll('[data-ribbon]').forEach(ribbon => { ribbon.innerHTML = segments + marker; });
}
function renderEntries() {
  const entries = T.dailyEntries(workspace().entries, selectedDay);
  $('entryList').innerHTML = entries.length ? entries.map((entry, index) => {
    const crossesDay = T.dayKey(entry.startedAt) !== T.dayKey(entry.endedAt || Date.now());
    const labelTime = timeLabel(entry.startedAt).split(' ');
    return `<article class="entry${index === 0 ? ' featured' : ''}" style="--color:${color(entry.title)}"><time class="timeline-time" datetime="${escapeHtml(entry.startedAt)}">${labelTime[0]}<span>${labelTime.slice(1).join(' ')}</span></time><div class="timeline-rail"><i></i></div><div class="entry-card"><div class="entry-heading"><h3 class="entry-name">${escapeHtml(entry.title)}${!entry.endedAt ? '<span class="entry-live">● Live</span>' : ''}</h3><span class="entry-duration" data-duration="${escapeHtml(entry.id)}">${T.roundedHours(entry.ms)}h</span></div><div class="entry-time">${timeLabel(entry.startedAt, crossesDay)} – ${entry.endedAt ? timeLabel(entry.endedAt, crossesDay) : 'Now'} · <span data-actual-duration="${escapeHtml(entry.id)}">${T.duration(entry.ms)}</span>${crossesDay ? '<br>Duration shown for selected day' : ''}</div>${entry.description ? `<p class="entry-description">${escapeHtml(entry.description)}</p>` : ''}<div class="entry-actions"><button class="icon-button" data-edit="${escapeHtml(entry.id)}" aria-label="Edit ${escapeHtml(entry.title)}">${icon('edit')}</button><button class="icon-button" data-delete="${escapeHtml(entry.id)}" aria-label="Delete ${escapeHtml(entry.title)}">${icon('trash')}</button></div></div></article>`;
  }).join('') : `<div class="empty-blocks"><div class="empty-clock">${icon('clock')}</div><h3>Your day is a blank canvas.</h3><p>Start the timer or add a block.<br>We’ll keep the details so you don’t have to.</p></div>`;
}
function render() {
  $('dayFilter').value = selectedDay;
  updateDateLabel();
  $('dayEyebrow').textContent = `${selectedDay === T.dayKey() ? 'TODAY' : readableDay(selectedDay).toUpperCase()} · ROUNDED TOTAL`;
  renderLabels(); renderAccount(); applyTheme(); renderEntries(); renderLive();
}
function persistDraft() {
  const title = $('taskTitle').value;
  const description = $('taskDescription').value;
  commit(next => {
    const ws = workspace(next);
    ws.draft = { title, description };
    const active = ws.entries.find(e => !e.endedAt);
    if (active) { active.title = title.trim() || 'Untitled task'; active.description = description; }
  });
  updateLabelSelection();
}
function toggleTracking() {
  let stoppedId;
  const now = new Date().toISOString();
  const ok = commit(next => {
    const ws = workspace(next);
    const active = ws.entries.find(e => !e.endedAt);
    if (active) {
      active.endedAt = new Date(Math.max(Date.parse(now), Date.parse(active.startedAt))).toISOString();
      active.title = $('taskTitle').value.trim() || 'Untitled task';
      active.description = $('taskDescription').value.trim();
      stoppedId = active.id;
      ws.draft = { title: '', description: '' };
    } else {
      ws.entries.push({ id: crypto.randomUUID(), title: $('taskTitle').value.trim() || 'Untitled task', description: $('taskDescription').value.trim(), startedAt: now, endedAt: null });
    }
  });
  if (!ok) return;
  selectedDay = T.dayKey(); loadFields(); render();
  if (stoppedId) { toast('Time saved. Add the finishing details.'); openEdit(stoppedId); }
  else toast('Timer started. You’ve got this.');
}
function openEdit(id = null) {
  const entry = id ? workspace().entries.find(e => e.id === id) : null;
  if (id && !entry) return;
  editingId = id;
  $('editHeading').textContent = id ? 'Make it accurate' : 'Make time count';
  $('editEyebrow').textContent = id ? 'EDIT BLOCK' : 'ADD BLOCK';
  $('editTitle').value = entry?.title === 'Untitled task' ? '' : entry?.title || '';
  $('editDescription').value = entry?.description || '';
  const end = selectedDay === T.dayKey() ? new Date() : new Date(`${selectedDay}T10:00:00`);
  $('editStart').value = T.localInput(entry?.startedAt || new Date(end.getTime() - 1800000));
  $('editEnd').value = entry ? (entry.endedAt ? T.localInput(entry.endedAt) : '') : T.localInput(end);
  $('editEnd').required = !entry || !!entry.endedAt;
  $('editError').textContent = '';
  renderEditLabels(); updateEditReadout();
  showDialog('editDialog');
}
function renderEditLabels() {
  $('editLabels').innerHTML = availableLabels().map(label => `<button type="button" class="chip${label.toLowerCase() === $('editTitle').value.trim().toLowerCase() ? ' selected' : ''}" aria-pressed="${label.toLowerCase() === $('editTitle').value.trim().toLowerCase()}" data-edit-label="${escapeHtml(label)}"><i style="--chip-color:${color(label)}"></i>${escapeHtml(label)}</button>`).join('');
}
function updateEditReadout() {
  const start = Date.parse($('editStart').value);
  const end = $('editEnd').value ? Date.parse($('editEnd').value) : Date.now();
  $('editReadout').innerHTML = Number.isFinite(start) && Number.isFinite(end) && end >= start ? `<span>${T.duration(end - start)}</span><span class="muted">→</span><span>${T.roundedHours(end - start)}h billed</span>` : '<span>Choose a valid time range</span>';
}
function saveEdit(event) {
  event.preventDefault();
  const start = new Date($('editStart').value).getTime();
  const end = $('editEnd').value ? new Date($('editEnd').value).getTime() : null;
  const title = $('editTitle').value.trim();
  if (!title) { $('editError').textContent = 'Give this block a title.'; return; }
  if (!Number.isFinite(start) || (end !== null && (!Number.isFinite(end) || end < start))) { $('editError').textContent = 'End time must be at or after the start time.'; return; }
  if (start > Date.now() || (end !== null && end > Date.now() + 1000)) { $('editError').textContent = 'Time blocks cannot be in the future.'; return; }
  const existing = workspace().entries.find(e => e.id === editingId);
  if (end === null && (!existing || existing.endedAt)) { $('editError').textContent = 'An end time is required for a saved block.'; return; }
  const entry = { id: editingId || crypto.randomUUID(), title, description: $('editDescription').value.trim(), startedAt: new Date(start).toISOString(), endedAt: end === null ? null : new Date(end).toISOString() };
  const ok = commit(next => {
    const ws = workspace(next);
    if (editingId) {
      const index = ws.entries.findIndex(e => e.id === editingId);
      if (index < 0) throw new Error('Entry no longer exists');
      ws.entries[index] = entry;
    } else ws.entries.push(entry);
  });
  if (!ok) return;
  $('editDialog').close(); loadFields(); render(); toast('Block saved. Your summary is up to date.');
}
function confirmAction(title, copy, action, button = 'Delete') {
  $('confirmTitle').textContent = title; $('confirmCopy').textContent = copy;
  $('confirmAction').textContent = button; confirmation = action; showDialog('confirmDialog');
}
function deleteEntry(id) {
  confirmAction('Delete this block?', 'This removes the entire block, including any time on adjacent days. This cannot be undone.', () => {
    if (!commit(next => { workspace(next).entries = workspace(next).entries.filter(e => e.id !== id); })) return;
    loadFields(); render(); toast('Time block deleted.');
  });
}
function setDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T12:00:00`))) return;
  selectedDay = day; render();
}
function moveDay(offset) {
  const day = new Date(`${selectedDay}T12:00:00`); day.setDate(day.getDate() + offset); setDay(T.dayKey(day));
}
function setView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('.desktop-nav [data-view], .mobile-nav [data-view]').forEach(button => {
    if (button === document.body) return;
    button.classList.toggle('selected', button.dataset.view === view);
    button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false');
  });
  const titles = { dashboard: ['Overview', 'Your day, at a glance', 'Less watching the clock. More time for what matters.'], summary: ['Daily summary', 'A clearer picture of your day', 'Every small moment, brought together by task.'], history: ['Time blocks', 'The moments that made your day', 'Review, refine, and remember what you worked on.'] };
  $('pageCrumb').textContent = titles[view][0]; $('pageTitle').textContent = { dashboard: 'Overview', summary: 'Summary', history: 'Blocks' }[view]; $('pageSubtitle').textContent = titles[view][2];
  updateDateLabel();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function setAuthMode(mode) {
  authMode = mode; const signup = mode === 'signup';
  $('authHeading').textContent = signup ? 'Make space for your day.' : 'Welcome back.';
  $('authCopy').textContent = signup ? 'Create a personal workspace on this device. Guest records stay in the guest workspace.' : 'A clearer day starts here. Sign in to your local workspace.';
  $('authSubmit').textContent = signup ? 'Create account' : 'Sign in';
  $('confirmField').classList.toggle('hidden', !signup); $('authConfirm').required = signup;
  $('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
  $('authError').textContent = ''; $('authPassword').value = ''; $('authConfirm').value = '';
  document.querySelectorAll('[data-auth]').forEach(b => b.classList.toggle('selected', b.dataset.auth === mode));
}
function openAuth() { $('settingsDialog').close(); setAuthMode('signin'); showDialog('authDialog'); setupGoogleSignIn(); }
async function setupGoogleSignIn() {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  const generation = ++googleSetupGeneration;
  $('googleButtonContainer')?.replaceChildren();
  $('googleSignIn').classList.remove('hidden');
  $('googleInfo').classList.add('hidden');
  try {
    const response = await fetch('./api/config', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    if (!config.googleClientId) return;
    if (!googleLibrary) googleLibrary = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
      script.onload = resolve; script.onerror = () => { googleLibrary = null; script.remove(); reject(new Error('Google could not load. Check your internet connection.')); };
      document.head.append(script);
    });
    await googleLibrary;
    if (generation !== googleSetupGeneration || !$('authDialog').open) return;
    let container = $('googleButtonContainer');
    if (!container) { container = document.createElement('div'); container.id = 'googleButtonContainer'; $('googleSignIn').before(container); }
    container.replaceChildren();
    google.accounts.id.initialize({ client_id: config.googleClientId, nonce: config.nonce, auto_select: false, callback: async result => {
      if (!$('authDialog').open || generation !== googleSetupGeneration) return;
      try {
        const verification = await fetch('./api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tempo-CSRF': config.csrfToken }, body: JSON.stringify({ credential: result.credential }) });
        const identity = await verification.json();
        if (!verification.ok) throw new Error(identity.error || 'Google sign-in could not be verified.');
        if (!$('authDialog').open || generation !== googleSetupGeneration) return;
        const id = 'google:' + identity.sub;
        if (!commit(next => {
          const ws = workspace(next); const active = ws.entries.find(entry => !entry.endedAt);
          if (active) active.endedAt = new Date(Math.max(Date.now(), Date.parse(active.startedAt))).toISOString();
          ws.draft = { title: '', description: '' };
          if (!next.accounts.some(account => account.id === id)) { next.accounts.push({ id, username: identity.name, provider: 'google' }); next.workspaces[id] = blankWorkspace(); }
          next.session = id;
        })) return;
        $('authDialog').close(); $('authForm').reset(); selectedDay = T.dayKey(); loadFields(); setView('dashboard'); render(); toast(`Welcome, ${identity.name}.`);
      } catch (error) { $('authError').textContent = error.message; }
    } });
    google.accounts.id.renderButton(container, { theme: state.theme === 'dark' ? 'filled_black' : 'outline', size: 'large', shape: 'rectangular', width: Math.min(390, $('googleSignIn').parentElement.clientWidth), text: 'continue_with' });
    $('googleSignIn').classList.add('hidden'); $('googleInfo').classList.add('hidden');
  } catch { $('googleInfo').textContent = 'Google sign-in is unavailable right now. Check your connection, or use a local account.'; $('googleInfo').classList.remove('hidden'); }
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bytes = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 210000, salt: Uint8Array.from(salt.match(/.{2}/g), x => parseInt(x, 16)) }, key, 256);
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
}
async function submitAuth(event) {
  event.preventDefault();
  if ($('authSubmit').disabled) return;
  const username = $('authUsername').value.trim(); const password = $('authPassword').value;
  const mode = authMode;
  $('authError').textContent = '';
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username) || password.length < 8) { $('authError').textContent = 'Use a valid username and a password with at least 8 characters.'; return; }
  if (mode === 'signup' && password !== $('authConfirm').value) { $('authError').textContent = 'The passwords don’t match.'; return; }
  $('authSubmit').disabled = true;
  try {
    const account = state.accounts.find(a => a.provider !== 'google' && a.username.toLowerCase() === username.toLowerCase());
    if (mode === 'signup' && account) throw new Error('That username is already in use on this device.');
    if (mode === 'signin' && !account) throw new Error('Username or password is incorrect.');
    const salt = account?.salt || Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join('');
    const hash = await passwordHash(password, salt);
    if (mode === 'signin' && hash !== account.hash) throw new Error('Username or password is incorrect.');
    if (!$('authDialog').open || mode !== authMode) return;
    const newAccount = account || { id: crypto.randomUUID(), username, salt, hash };
    const ok = commit(next => {
      const ws = workspace(next); const active = ws.entries.find(e => !e.endedAt);
      if (active) active.endedAt = new Date(Math.max(Date.now(), Date.parse(active.startedAt))).toISOString();
      ws.draft = { title: '', description: '' };
      if (!account) { if (next.accounts.some(a => a.provider !== 'google' && a.username.toLowerCase() === username.toLowerCase())) throw new Error('Duplicate account'); next.accounts.push(newAccount); next.workspaces[newAccount.id] = blankWorkspace(); }
      next.session = newAccount.id;
    });
    if (!ok) return;
    $('authDialog').close(); $('authForm').reset(); selectedDay = T.dayKey(); loadFields(); setView('dashboard'); render(); toast(`Welcome${mode === 'signin' ? ' back' : ''}, ${username}.`);
  } catch (error) { $('authError').textContent = error instanceof TypeError ? 'Accounts require HTTPS or localhost. Open Tempo using run_app.bat.' : error.message; }
  finally { $('authSubmit').disabled = false; }
}
function signOut() {
  if (!commit(next => {
    const ws = workspace(next); const active = ws.entries.find(e => !e.endedAt);
    if (active) active.endedAt = new Date(Math.max(Date.now(), Date.parse(active.startedAt))).toISOString();
    ws.draft = { title: '', description: '' }; next.session = null;
  })) return;
  window.google?.accounts?.id?.disableAutoSelect();
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  selectedDay = T.dayKey(); loadFields(); setView('dashboard'); render(); toast('Signed out. Your account’s time blocks are saved.');
}
function exportDay() {
  const entries = T.dailyEntries(workspace().entries, selectedDay);
  const csvCell = value => '"' + String(value).replace(/^[=+@\-\t\r]/, x => "'" + x).replace(/"/g, '""') + '"';
  const rows = [['Date', 'Title', 'Description', 'Start (local)', 'End (local)', 'Actual duration for selected day', 'Actual seconds', 'Rounded hours (0.1h per block)']];
  entries.forEach(e => rows.push([selectedDay, e.title, e.description, T.localInput(e.startedAt), e.endedAt ? T.localInput(e.endedAt) : 'In progress', T.timer(e.ms), Math.floor(e.ms / 1000), T.roundedHours(e.ms)]));
  rows.push([], ['Daily summary'], ['Title', 'Actual total duration', 'Actual seconds', 'Blocks', 'Rounded hours (sum of rounded blocks)']);
  T.summarize(entries).forEach(g => rows.push([g.title, T.timer(g.ms), Math.floor(g.ms / 1000), g.count, (g.tenths / 10).toFixed(1)]));
  const actualTotal = entries.reduce((sum, entry) => sum + entry.ms, 0);
  rows.push([], ['Day total', 'Actual duration', 'Rounded hours (sum of rounded blocks)'], [selectedDay, T.timer(actualTotal), (entries.reduce((sum, entry) => sum + T.roundedTenths(entry.ms), 0) / 10).toFixed(1)]);
  const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `tempo-${selectedDay}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Daily report exported.');
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-close')) button.closest('dialog').close();
  if (button.dataset.view) { $('settingsDialog').close(); setView(button.dataset.view); }
  if (button.hasAttribute('data-settings')) showDialog('settingsDialog');
  if (button.hasAttribute('data-account')) state.session ? showDialog('settingsDialog') : openAuth();
  if (button.dataset.themeChoice) { if (commit(next => { next.theme = button.dataset.themeChoice; })) applyTheme(); }
  if (button.dataset.editLabel) { $('editTitle').value = button.dataset.editLabel; renderEditLabels(); }
  if (button.dataset.auth) setAuthMode(button.dataset.auth);
  if (button.dataset.edit) openEdit(button.dataset.edit);
  if (button.dataset.delete) deleteEntry(button.dataset.delete);
  if (button.dataset.removeLabel) removeLabel(button.dataset.removeLabel);
  if (button.dataset.label) { $('taskTitle').value = button.dataset.label; persistDraft(); renderEntries(); renderLive(); }
  if (button.id === 'newLabelBtn') { $('labelForm').reset(); $('labelError').textContent = ''; showDialog('labelDialog'); }
});
$('toggleTrackingBtn').addEventListener('click', toggleTracking);
['taskTitle', 'taskDescription'].forEach(id => $(id).addEventListener('input', persistDraft));
$('taskTitle').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); toggleTracking(); } });
$('taskTitle').addEventListener('change', () => { renderEntries(); renderLive(); });
$('taskDescription').addEventListener('change', renderEntries);
$('dayFilter').addEventListener('change', event => setDay(event.target.value));
$('previousDay').addEventListener('click', () => moveDay(-1));
$('nextDay').addEventListener('click', () => moveDay(1));
$('addBlockBtn').addEventListener('click', () => openEdit());
$('editForm').addEventListener('submit', saveEdit);
$('clearDayBtn').addEventListener('click', () => {
  const day = selectedDay;
  confirmAction('Clear this day?', `Remove all time recorded on ${readableDay(day)}? Time on adjacent days is preserved. A timer running on this day will stop. This cannot be undone.`, () => {
    if (!commit(next => { workspace(next).entries = T.clearDay(workspace(next).entries, day); })) return;
    loadFields(); render(); toast('The selected day has been cleared.');
  }, 'Clear day');
});
$('confirmForm').addEventListener('submit', event => { event.preventDefault(); const action = confirmation; confirmation = null; $('confirmDialog').close(); action?.(); });
$('confirmDialog').addEventListener('close', () => { if (!$('confirmDialog').open) confirmation = null; });
$('labelForm').addEventListener('submit', event => {
  event.preventDefault(); const name = $('labelName').value.trim();
  if (!name) { $('labelError').textContent = 'Enter a label name.'; return; }
  if (availableLabels().some(label => label.toLowerCase() === name.toLowerCase())) { $('labelError').textContent = 'You already have a label with that name.'; return; }
  if (!commit(next => {
    const ws = workspace(next);
    const defaultLabel = DEFAULT_LABELS.find(label => label.toLowerCase() === name.toLowerCase());
    if (defaultLabel) ws.removedDefaultLabels = (ws.removedDefaultLabels || []).filter(label => label !== defaultLabel);
    else ws.labels.push(name);
  })) return;
  $('taskTitle').value = name; persistDraft(); $('labelDialog').close(); render(); toast('Label saved for next time.');
});
$('settingsDialog').addEventListener('close', () => { if (!$('settingsDialog').open) document.body.classList.remove('settings-open'); });
$('editTitle').addEventListener('input', renderEditLabels);
['editStart', 'editEnd'].forEach(id => $(id).addEventListener('input', updateEditReadout));
$('summaryExportBtn').addEventListener('click', exportDay);
$('settingsExportBtn').addEventListener('click', exportDay);
document.querySelector('[data-home]').addEventListener('click', event => { event.preventDefault(); setView('dashboard'); });
$('accountButton').addEventListener('click', openAuth);
$('authForm').addEventListener('submit', submitAuth);
$('authDialog').addEventListener('close', () => { googleSetupGeneration++; $('authPassword').value = ''; $('authConfirm').value = ''; });
$('googleSignIn').addEventListener('click', () => $('googleInfo').classList.remove('hidden'));
$('signOutBtn').addEventListener('click', signOut);
$('exportBtn').addEventListener('click', exportDay);
document.querySelector('.brand[href]').addEventListener('click', event => { event.preventDefault(); setView('dashboard'); });
window.addEventListener('storage', event => {
  if (event.key === STORE || event.key === null) {
    const previousSession = state.session;
    state = readState();
    if (previousSession !== state.session) document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    loadFields(); render();
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { state = readState(); render(); } });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('installBtn').classList.remove('hidden'); });
$('installBtn').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; } else { $('installHint').classList.remove('hidden'); } });
const settingsNav = document.querySelector('.mobile-nav').cloneNode(true);
settingsNav.className = 'settings-nav';
settingsNav.setAttribute('aria-label', 'Settings navigation');
settingsNav.querySelectorAll('button').forEach(button => {
  button.classList.toggle('selected', button.hasAttribute('data-settings'));
  button.setAttribute('aria-current', button.hasAttribute('data-settings') ? 'page' : 'false');
});
$('settingsDialog').append(settingsNav);
loadFields(); setView('dashboard'); render();
if (storageBroken) toast('Saved workspace could not be read. Existing data has not been overwritten.');
let lastDay = T.dayKey();
setInterval(() => {
  const today = T.dayKey();
  if (today !== lastDay) { if (selectedDay === lastDay) selectedDay = today; lastDay = today; render(); }
  else if (activeEntry()) renderLive();
}, 1000);
if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {});
