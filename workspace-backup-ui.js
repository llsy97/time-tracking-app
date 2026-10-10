'use strict';
async function downloadWorkspaceBackup() {
  try {
    const data = JSON.stringify(window.MoaBackup.createBackup(workspace(), state), null, 2);
    const name = `moa-backup-${T.dayKey()}.json`;
    if (window.Capacitor?.isNativePlatform()) {
      const file = await window.Capacitor.Plugins.Filesystem.writeFile({path: name, data, directory: 'CACHE', encoding: 'utf8'});
      await window.Capacitor.Plugins.Share.share({title: 'moa workspace backup', files: [file.uri], dialogTitle: 'Save your backup'});
    } else {
      const blob = new Blob([data], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    toast('Backup ready. Keep it safe for your next device or browser.');
  } catch (error) { toast(error.message || 'Backup could not be saved.'); }
}
async function selectWorkspaceBackup(event) {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('Choose a backup smaller than 20 MB.');
    const backup = window.MoaBackup.readBackup(JSON.parse(await file.text()));
    const owner = state.session;
    confirmAction('Bring your time with you.', `Restore ${backup.entries.length} saved blocks and your labels into this workspace? Existing blocks are kept.`, () => {
      if (state.session !== owner) { toast('The workspace changed. Choose your backup again.'); return; }
      let result;
      if (!commit(next => {
        result = window.MoaBackup.mergeBackup(workspace(next), backup, DEFAULT_LABELS);
        if (result.pristine) {next.theme = backup.settings.theme; next.roundUp = backup.settings.roundUp;}
      })) return;
      loadFields(); render();
      toast(`${result.added} blocks restored${result.kept ? ` · ${result.kept} existing blocks kept` : ''}.`);
    }, 'Restore backup', false);
  } catch (error) { toast(error instanceof SyntaxError ? 'This file is not a valid moa backup.' : error.message); }
}
$('backupWorkspaceBtn').addEventListener('click', downloadWorkspaceBackup);
$('restoreWorkspaceBtn').addEventListener('click', () => $('workspaceBackupFile').click());
$('workspaceBackupFile').addEventListener('change', selectWorkspaceBackup);
