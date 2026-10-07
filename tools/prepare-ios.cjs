const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const icon = path.join(root, 'icon-maskable-512.png');
const target = path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
// Convert the supplied icon to Apple's required size during the Mac build.
if (process.platform === 'darwin') execFileSync('/usr/bin/sips', ['-z', '1024', '1024', icon, '--out', target]);
else fs.copyFileSync(icon, target);
