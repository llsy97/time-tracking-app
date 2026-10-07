'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist', 'mobile');
fs.mkdirSync(target, { recursive: true });
// Bundle only public app files, never server configuration, accounts or credentials.
for (const file of ['cloud-auth-ui.js', 'productivity-ui.js', 'native-tracker.js', 'productivity.css', 'index.html', 'styles.css', 'script.js', 'time-utils.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon-48.png']) {
  fs.copyFileSync(path.join(root, file), path.join(target, file));
}
for (const directory of ['fonts', 'logo']) {
  fs.cpSync(path.join(root, 'assets', directory), path.join(target, 'assets', directory), { recursive: true });
}
fs.copyFileSync(path.join(root, 'assets', 'auth.js'), path.join(target, 'assets', 'auth.js'));
fs.copyFileSync(path.join(root, 'assets', 'tokens.css'), path.join(target, 'assets', 'tokens.css'));
console.log('Mobile web assets prepared.');
