(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  function dayKey(value = new Date()) {
    const d = new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function dayBounds(day) {
    const start = new Date(`${day}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start.getTime(), end.getTime()];
  }
  function sliceForDay(entry, day, now = Date.now()) {
    const [lo, hi] = dayBounds(day);
    const start = new Date(entry.startedAt).getTime();
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || start >= hi || end < lo || (end === lo && start !== end)) return null;
    const ranges = workRanges(entry, now).map(([a,b]) => [Math.max(a,lo), Math.min(b,hi)]).filter(([a,b]) => b > a);
    if (!ranges.length && start !== end && !(start >= lo && start < hi && !entry.endedAt)) return null;
    return { ...entry, sliceStart: Math.max(start, lo), sliceEnd: Math.min(end, hi), ranges, ms: ranges.reduce((sum,[a,b]) => sum + b-a,0) };
  }
  function isPaused(entry) { return !!entry && !entry.endedAt && (entry.pauses || []).some(p => !p.endedAt); }
  function workRanges(entry, now = Date.now()) {
    const start = Date.parse(entry.startedAt), end = entry.endedAt ? Date.parse(entry.endedAt) : now;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    const pauses = (entry.pauses || []).map(p => [Math.max(start,Date.parse(p.startedAt)), Math.min(end,p.endedAt ? Date.parse(p.endedAt) : end)])
      .filter(([a,b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a,b) => a[0]-b[0]);
    const ranges = []; let cursor = start;
    for (const [a,b] of pauses) { if (a > cursor) ranges.push([cursor,Math.min(a,end)]); cursor = Math.max(cursor,b); }
    if (cursor < end) ranges.push([cursor,end]);
    return ranges.filter(([a,b]) => b > a);
  }
  function elapsed(entry, now = Date.now()) { return workRanges(entry,now).reduce((sum,[a,b]) => sum+b-a,0); }
  function togglePause(entry, now = Date.now()) {
    if (!entry || entry.endedAt) return;
    entry.pauses ||= [];
    const pending = entry.pauses.find(p => !p.endedAt);
    if (pending) pending.endedAt = new Date(Math.max(now,Date.parse(pending.startedAt))).toISOString();
    else entry.pauses.push({startedAt:new Date(Math.max(now,Date.parse(entry.startedAt))).toISOString(), endedAt:null});
  }
  function finish(entry, now = Date.now()) {
    const end = Math.max(now,Date.parse(entry.startedAt));
    (entry.pauses || []).forEach(p => { if (!p.endedAt) p.endedAt = new Date(Math.max(end,Date.parse(p.startedAt))).toISOString(); });
    entry.endedAt = new Date(end).toISOString();
  }
  function dailyEntries(entries, day, now = Date.now()) {
    return entries.map(e => sliceForDay(e, day, now)).filter(Boolean).sort((a, b) => b.sliceStart - a.sliceStart);
  }
  function summarize(entries) {
    const groups = new Map();
    for (const entry of entries) {
      const title = entry.title.trim() || 'Untitled task';
      const key = title.toLowerCase();
      if (!groups.has(key)) groups.set(key, { title, ms: 0, count: 0, tenths: 0 });
      const group = groups.get(key);
      group.ms += entry.ms;
      group.tenths += roundedTenths(entry.ms);
      group.count++;
    }
    return [...groups.values()].sort((a, b) => b.tenths - a.tenths || b.ms - a.ms);
  }
  function timer(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(pad).join(':');
  }
  function duration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
    return `${Math.floor(s / 3600)}h ${pad(Math.floor(s / 60) % 60)}m`;
  }
  function roundedTenths(ms) {
    return Math.ceil(Math.max(0, ms) / 360000);
  }
  function roundedHours(ms) {
    return (roundedTenths(ms) / 10).toFixed(1);
  }
  function exactDuration(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const remainder = seconds % 60;
    return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', remainder || !seconds ? `${remainder}s` : ''].filter(Boolean).join(' ');
  }
  function localInput(value) {
    const d = new Date(value);
    return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  // Remove only time inside the selected day, preserving adjacent days and a continuing timer.
  function clearDay(entries, day, now = Date.now(), id = () => crypto.randomUUID()) {
    const [lo, hi] = dayBounds(day);
    return entries.flatMap(entry => {
      if (!sliceForDay(entry, day, now)) return [entry];
      const start = new Date(entry.startedAt).getTime();
      const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now;
      const remaining = [];
      if (start < lo) remaining.push({ ...entry, endedAt: new Date(lo).toISOString() });
      if (end > hi) remaining.push({ ...entry, id: start < lo ? id() : entry.id, startedAt: new Date(hi).toISOString() });
      return remaining;
    });
  }
  const api = { dayKey, dayBounds, sliceForDay, dailyEntries, summarize, timer, duration, roundedTenths, roundedHours, exactDuration, localInput, clearDay, workRanges, elapsed, isPaused, togglePause, finish };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TempoTime = api;
})(typeof window === 'undefined' ? globalThis : window);
