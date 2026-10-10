'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const B = require('../workspace-backup.js');
const T = require('../time-utils.js');
const defaults = ['Design', 'Meeting', 'Coding'];
const block = {id: 'coding-1', title: 'Coding', description: 'Keep these notes', startedAt: '2026-10-09T09:00:00Z', endedAt: '2026-10-09T09:17:00Z', pauses: [{startedAt: '2026-10-09T09:07:00Z', endedAt: '2026-10-09T09:10:00Z'}]};
const workspace = () => ({entries: [structuredClone(block)], labels: ['Research'], removedDefaultLabels: ['Meeting'], labelOrder: ['Research', 'Coding', 'Design']});
const empty = () => ({entries: [], labels: [], removedDefaultLabels: [], draft: {title: '', description: ''}});
test('backup round-trip preserves exact intervals, breaks, label order and preferences', () => {
  const json = JSON.parse(JSON.stringify(B.createBackup(workspace(), {theme: 'dark', roundUp: false})));
  const backup = B.readBackup(json), restored = empty();
  assert.equal(B.mergeBackup(restored, backup, defaults).added, 1);
  assert.deepEqual(restored.entries, workspace().entries);
  assert.deepEqual(restored.labelOrder, workspace().labelOrder);
  assert.deepEqual(restored.removedDefaultLabels, ['Meeting']);
  assert.equal(T.elapsed(restored.entries[0]), 14 * 60000);
  assert.deepEqual(backup.settings, {theme: 'dark', roundUp: false});
});
test('backup omits accounts, session credentials and unknown entry fields', () => {
  const ws = workspace();ws.entries[0].privateToken = 'secret';ws.accounts = [{passwordHash: 'secret'}];ws.session = 'secret';
  const value = B.createBackup(ws, {theme: 'light', session: 'secret', password: 'secret'});
  assert(!JSON.stringify(value).includes('secret'));
  assert.equal(value.workspace.entries[0].privateToken, undefined);
});
test('restoring twice cannot duplicate blocks or overwrite edits and active tracking', () => {
  const backup = B.readBackup(B.createBackup(workspace(), {theme: 'light'}));
  const ws = empty();B.mergeBackup(ws, backup, defaults);
  ws.entries[0].title = 'Updated locally';ws.entries.push({...block, id: 'active', endedAt: null});
  const result = B.mergeBackup(ws, backup, defaults);
  assert.equal(result.added, 0);assert.equal(result.kept, 1);
  assert.equal(ws.entries[0].title, 'Updated locally');assert.equal(ws.entries[1].endedAt, null);assert.equal(ws.entries.length, 2);
});
test('invalid timestamps, duplicate ids and breaks outside the block are rejected before import', () => {
  for(const mutate of [v=>v.workspace.entries[0].endedAt='invalid',v=>v.workspace.entries.push({...block}),v=>v.workspace.entries[0].pauses[0].endedAt='2026-10-09T10:00:00Z']) {
    const data = B.createBackup(workspace(), {theme: 'light'});mutate(data);assert.throws(()=>B.readBackup(data));
  }
  assert.throws(()=>B.readBackup({format:'other',version:1,workspace:workspace()}));
});
test('unfinished timers cannot be copied into two running workspaces', () => {
  const ws=workspace();ws.entries[0].endedAt=null;
  assert.throws(()=>B.createBackup(ws,{}),/Stop and save/);
});
test('existing label preferences survive a merge into a populated workspace', () => {
  const ws=workspace();ws.labels=['My label'];ws.removedDefaultLabels=['Design'];ws.labelOrder=['My label','Coding'];
  const backup=B.readBackup(B.createBackup(workspace(),{theme:'dark'}));
  B.mergeBackup(ws,backup,defaults);
  assert.deepEqual(ws.removedDefaultLabels,['Design']);assert.equal(ws.labelOrder[0],'My label');assert(ws.labels.includes('Research'));
});
