const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'America/Denver';
const T = require('../time-utils.js');
const entry = (start, end, title = 'Coding', id = 'one') => ({ id, title, description: '', startedAt: new Date(start).toISOString(), endedAt: end ? new Date(end).toISOString() : null });
test('reported hours round upward in six-minute increments', () => {
  for (const [minutes, expected] of [[0, '0.0'], [1, '0.1'], [6, '0.1'], [7, '0.2'], [54, '0.9'], [57, '1.0'], [60, '1.0'], [63, '1.1'], [66, '1.1']]) {
    assert.equal(T.roundedHours(minutes * 60000), expected);
  }
  assert.equal(T.roundedHours(360000 + 1), '0.2');
  assert.equal(T.roundedHours(3600000 + 1000), '1.1');
  assert.equal(T.roundedHours(-1000), '0.0');
});
test('morning and afternoon work group by normalized title', () => {
  const entries = [entry('2026-09-22T09:00:00', '2026-09-22T10:00:00'), entry('2026-09-22T14:00:00', '2026-09-22T15:30:00', ' coding ', 'two')];
  assert.deepEqual(T.summarize(T.dailyEntries(entries, '2026-09-22')), [{ title: 'coding', ms: 9000000, count: 2 }]);
});
test('rounding is applied after summing repeated tasks, never to individual blocks', () => {
  const entries = [entry('2026-09-22T09:00:00', '2026-09-22T09:07:00'), entry('2026-09-22T14:00:00', '2026-09-22T14:07:00')];
  const original = JSON.stringify(entries);
  const grouped = T.summarize(T.dailyEntries(entries, '2026-09-22'));
  assert.equal(T.roundedHours(grouped[0].ms), '0.3');
  assert.equal(grouped[0].ms, 14 * 60000);
  assert.equal(JSON.stringify(entries), original);
});
test('overnight work is clipped to each local day', () => {
  const item = entry('2026-09-22T23:30:00', '2026-09-23T01:00:00');
  assert.equal(T.sliceForDay(item, '2026-09-22').ms, 1800000);
  assert.equal(T.sliceForDay(item, '2026-09-23').ms, 3600000);
  assert.equal(T.sliceForDay(item, '2026-09-24'), null);
});
test('running timers use wall time and survive app suspension', () => {
  const item = entry('2026-09-22T23:30:00', null);
  const now = new Date('2026-09-23T02:00:00').getTime();
  assert.equal(T.sliceForDay(item, '2026-09-22', now).ms, 1800000);
  assert.equal(T.sliceForDay(item, '2026-09-23', now).ms, 7200000);
});
test('midnight boundary does not produce a block in the following day', () => {
  const item = entry('2026-09-22T23:30:00', '2026-09-23T00:00:00');
  assert.equal(T.sliceForDay(item, '2026-09-23'), null);
});
test('zero-duration blocks remain editable on their starting day', () => {
  const item = entry('2026-09-22T10:00:00', '2026-09-22T10:00:00');
  assert.equal(T.dailyEntries([item], '2026-09-22').length, 1);
});
test('clearing a day preserves portions on both adjacent days', () => {
  const item = entry('2026-09-21T23:00:00', '2026-09-23T01:00:00');
  const result = T.clearDay([item], '2026-09-22', Date.now(), () => 'new-id');
  assert.equal(result.length, 2);
  assert.equal(T.dailyEntries(result, '2026-09-22').length, 0);
  assert.equal(T.dailyEntries(result, '2026-09-21')[0].ms, 3600000);
  assert.equal(T.dailyEntries(result, '2026-09-23')[0].ms, 3600000);
  assert.notEqual(result[0].id, result[1].id);
});
test('clearing a past day preserves a timer running today', () => {
  const item = entry('2026-09-22T23:00:00', null);
  const now = new Date('2026-09-23T02:00:00').getTime();
  const result = T.clearDay([item], '2026-09-22', now);
  assert.equal(result.length, 1); assert.equal(result[0].endedAt, null);
  assert.equal(T.dailyEntries(result, '2026-09-23', now)[0].ms, 7200000);
});
test('clearing today stops its active timer', () => {
  const item = entry('2026-09-22T09:00:00', null);
  assert.equal(T.clearDay([item], '2026-09-22', new Date('2026-09-22T10:00:00').getTime()).length, 0);
});
test('day bounds follow DST rather than assuming 24 hours', () => {
  const spring = T.dayBounds('2026-03-08'); const fall = T.dayBounds('2026-11-01');
  assert.equal(spring[1] - spring[0], 23 * 3600000);
  assert.equal(fall[1] - fall[0], 25 * 3600000);
});
test('invalid and reversed intervals are excluded', () => {
  assert.equal(T.sliceForDay({ startedAt: 'bad', endedAt: null }, '2026-09-22'), null);
  assert.equal(T.sliceForDay(entry('2026-09-22T10:00:00', '2026-09-22T09:00:00'), '2026-09-22'), null);
});
