'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'client');
// An explicit allowlist prevents source tooling, signing keys and local data
// from being published by the hosting service.
const files = ['index.html', 'styles.css', 'script.js', 'time-utils.js', 'cloud-auth-ui.js',
  'productivity-ui.js', 'native-tracker.js', 'productivity.css', 'workspace-backup.js',
  'workspace-backup-ui.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png',
  'icon-512.png', 'icon-maskable-512.png', 'favicon-48.png', 'assets/auth.js', 'assets/tokens.css'];
for (const file of files) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(path.join(root, file), target);
}
for (const directory of ['fonts', 'logo']) {
  fs.cpSync(path.join(root, 'assets', directory), path.join(output, 'assets', directory), {recursive: true});
}
console.log('Public web assets prepared in dist/client.');
