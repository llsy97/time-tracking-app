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
    return { ...entry, sliceStart: Math.max(start, lo), sliceEnd: Math.min(end, hi), ms: Math.max(0, Math.min(end, hi) - Math.max(start, lo)) };
  }
  function dailyEntries(entries, day, now = Date.now()) {
    return entries.map(e => sliceForDay(e, day, now)).filter(Boolean).sort((a, b) => b.sliceStart - a.sliceStart);
  }
  function summarize(entries) {
    const groups = new Map();
    for (const entry of entries) {
      const title = entry.title.trim() || 'Untitled task';
      const key = title.toLowerCase();
      if (!groups.has(key)) groups.set(key, { title, ms: 0, count: 0 });
      const group = groups.get(key);
      group.ms += entry.ms;
      group.count++;
    }
    return [...groups.values()].sort((a, b) => b.ms - a.ms);
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
  const api = { dayKey, dayBounds, sliceForDay, dailyEntries, summarize, timer, duration, localInput, clearDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TempoTime = api;
})(typeof window === 'undefined' ? globalThis : window);
