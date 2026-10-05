// Copy the supplied moa artwork verbatim. Do not redraw or rasterize the logo.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon-48.png']) {
  fs.copyFileSync(path.join(root, 'assets/logo/icons', name), path.join(root, name));
}
fs.copyFileSync(path.join(root, 'assets/logo/moa-mark-ink.svg'), path.join(root, 'icon.svg'));
