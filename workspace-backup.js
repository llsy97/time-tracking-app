(function (root) {
  'use strict';
  const FORMAT = 'moa-workspace-backup';
  const validText = (value, max) => typeof value === 'string' && value.length <= max;
  const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  function readBackup(value) {
    if (!value || value.format !== FORMAT || value.version !== 1 || !value.workspace) throw Error('Choose a moa backup file (.json).');
    const ws = value.workspace;
    if (!Array.isArray(ws.entries) || ws.entries.length > 100000) throw Error('This backup has invalid time blocks.');
    const seen = new Set();
    const entries = ws.entries.map(entry => {
      if (!entry || !validText(entry.id, 200) || !entry.id || seen.has(entry.id) ||
          !validText(entry.title, 80) || !validText(entry.description, 2000) ||
          !timestamp(entry.startedAt) || !timestamp(entry.endedAt) || Date.parse(entry.endedAt) < Date.parse(entry.startedAt)) {
        throw Error('This backup has invalid or unfinished time blocks.');
      }
      seen.add(entry.id);
      if (entry.pauses != null && (!Array.isArray(entry.pauses) || entry.pauses.length > 100000)) throw Error('This backup has invalid breaks.');
      const pauses = (entry.pauses || []).map(pause => {
        if (!pause || !timestamp(pause.startedAt) || !timestamp(pause.endedAt) ||
            Date.parse(pause.startedAt) < Date.parse(entry.startedAt) ||
            Date.parse(pause.endedAt) < Date.parse(pause.startedAt) || Date.parse(pause.endedAt) > Date.parse(entry.endedAt)) {
          throw Error('This backup has invalid breaks.');
        }
        return {startedAt: pause.startedAt, endedAt: pause.endedAt};
      });
      return {id: entry.id, title: entry.title, description: entry.description, startedAt: entry.startedAt, endedAt: entry.endedAt, ...(pauses.length ? {pauses} : {})};
    });
    const labels = name => {
      const list = ws[name] || [];
      if (!Array.isArray(list) || list.length > 1000 || list.some(label => !validText(label, 80) || !label.trim())) throw Error('This backup has invalid labels.');
      return [...new Set(list)];
    };
    const settings = value.settings || {};
    return {
      entries, labels: labels('labels'), removedDefaultLabels: labels('removedDefaultLabels'), labelOrder: labels('labelOrder'),
      settings: {theme: ['light', 'dark', 'system'].includes(settings.theme) ? settings.theme : 'light', roundUp: settings.roundUp !== false}
    };
  }
  function createBackup(workspace, settings, now = new Date().toISOString()) {
    if (workspace.entries.some(entry => !entry.endedAt)) throw Error('Stop and save your timer before creating a backup.');
    const value = {format: FORMAT, version: 1, exportedAt: now,
      workspace: {entries: workspace.entries, labels: workspace.labels,
        removedDefaultLabels: workspace.removedDefaultLabels || [], labelOrder: workspace.labelOrder || []},
      settings: {theme: settings.theme, roundUp: settings.roundUp !== false}};
    // Sanitize output: no accounts, sessions, hashes or authentication tokens.
    const clean = readBackup(value);
    return {...value, workspace: {entries: clean.entries, labels: clean.labels,
      removedDefaultLabels: clean.removedDefaultLabels, labelOrder: clean.labelOrder}, settings: clean.settings};
  }
  function mergeBackup(workspace, backup, defaults) {
    const existing = new Set(workspace.entries.map(entry => entry.id));
    const added = backup.entries.filter(entry => !existing.has(entry.id));
    const pristine = !workspace.entries.length && !workspace.labels.length && !(workspace.removedDefaultLabels || []).length && !(workspace.labelOrder || []).length;
    workspace.entries.push(...structuredClone(added));
    workspace.labels = [...new Set([...workspace.labels, ...backup.labels.filter(label => !defaults.includes(label))])];
    if (pristine) workspace.removedDefaultLabels = backup.removedDefaultLabels.filter(label => defaults.includes(label));
    workspace.labelOrder = [...new Set([...(pristine ? backup.labelOrder : workspace.labelOrder || []), ...backup.labelOrder])];
    return {added: added.length, kept: backup.entries.length - added.length, pristine};
  }
  const api = {readBackup, createBackup, mergeBackup};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoaBackup = api;
})(typeof window !== 'undefined' ? window : globalThis);
