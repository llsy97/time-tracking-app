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
test('exact duration preserves seconds without rounding up', () => {
  assert.equal(T.exactDuration(7 * 60000), '7m');
  assert.equal(T.exactDuration(14 * 60000), '14m');
  assert.equal(T.exactDuration(5766000), '1h 36m 6s');
  assert.equal(T.exactDuration(3600000), '1h');
  assert.equal(T.exactDuration(0), '0s');
});
test('morning and afternoon work group by normalized title', () => {
  const entries = [entry('2026-09-22T09:00:00', '2026-09-22T10:00:00'), entry('2026-09-22T14:00:00', '2026-09-22T15:30:00', ' coding ', 'two')];
  assert.deepEqual(T.summarize(T.dailyEntries(entries, '2026-09-22')), [{ title: 'coding', ms: 9000000, count: 2, tenths: 25 }]);
});
test('each block rounds up before task totals are summed without changing actual time', () => {
  const entries = [entry('2026-09-22T09:00:00', '2026-09-22T09:07:00'), entry('2026-09-22T14:00:00', '2026-09-22T14:07:00')];
  const original = JSON.stringify(entries);
  const grouped = T.summarize(T.dailyEntries(entries, '2026-09-22'));
  assert.equal((grouped[0].tenths / 10).toFixed(1), '0.4');
  assert.equal(grouped[0].ms, 14 * 60000);
  assert.equal(JSON.stringify(entries), original);
});
test('day total adds rounded blocks across titles using integer tenths', () => {
  const groups = T.summarize([{ title: 'Design', ms: 7 * 60000 }, { title: 'Coding', ms: 7 * 60000 }, { title: 'Design', ms: 6 * 60000 }]);
  assert.equal(groups.reduce((sum, group) => sum + group.tenths, 0), 5);
  assert.equal(groups.find(group => group.title === 'Design').tenths, 3);
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

test('pause and resume exclude breaks and round the combined block once', () => {
  const item=entry('2026-10-06T09:00:00',null);
  T.togglePause(item,Date.parse('2026-10-06T09:07:00'));
  assert.equal(T.isPaused(item),true);
  assert.equal(T.elapsed(item,Date.parse('2026-10-06T11:00:00')),420000);
  T.togglePause(item,Date.parse('2026-10-06T11:00:00'));
  assert.equal(T.isPaused(item),false);
  T.finish(item,Date.parse('2026-10-06T11:07:00'));
  const daily=T.dailyEntries([item],'2026-10-06');
  assert.equal(daily[0].ms,840000);
  assert.equal(daily[0].ranges.length,2);
  assert.equal(T.summarize(daily)[0].tenths,3);
});
test('stopping while paused closes the pause without adding break time',()=>{
  const item=entry('2026-10-06T09:00:00',null);
  T.togglePause(item,Date.parse('2026-10-06T09:07:00'));
  T.finish(item,Date.parse('2026-10-06T10:00:00'));
  assert.equal(T.elapsed(item),420000);
  assert.equal(T.isPaused(item),false);
  assert.equal(item.pauses[0].endedAt,item.endedAt);
});
test('paused-only days do not get calendar markers and midnight work clips correctly',()=>{
  const item=entry('2026-10-05T23:50:00',null);
  T.togglePause(item,Date.parse('2026-10-06T00:10:00'));
  const now=Date.parse('2026-10-08T10:00:00');
  assert.equal(T.sliceForDay(item,'2026-10-05',now).ms,600000);
  assert.equal(T.sliceForDay(item,'2026-10-06',now).ms,600000);
  assert.equal(T.sliceForDay(item,'2026-10-07',now),null);
  assert.equal(T.sliceForDay(item,'2026-10-08',now),null);
  const remaining=T.clearDay([item],'2026-10-06',now);
  assert.equal(T.dailyEntries(remaining,'2026-10-06',now).length,0);
  assert.equal(T.dailyEntries(remaining,'2026-10-05',now)[0].ms,600000);
  assert.equal(remaining.filter(e=>!e.endedAt).length,1);
});
test('overlapping imported pauses cannot subtract the same time twice',()=>{
  const item=entry('2026-10-06T09:00:00','2026-10-06T10:00:00');
  item.pauses=[{startedAt:'2026-10-06T09:10:00',endedAt:'2026-10-06T09:30:00'},{startedAt:'2026-10-06T09:20:00',endedAt:'2026-10-06T09:40:00'}];
  assert.equal(T.elapsed(item),1800000);
});
