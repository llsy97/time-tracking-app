# Web hosting

The primary moa website uses Sites hosting. Its project identity is in
`.openai/hosting.json`. The generated origin is:

https://moa-time-tracker.eversince.chatgpt.site

Build public assets with `npm run build:web`. Only the allowlisted HTML, scripts,
styles, fonts and icons are copied to `dist/client`. App records, accounts, Android
signing keys, OAuth client secrets and development servers are excluded.

For Sites updates, use the Sites skill's source helper from the isolated checkout
`.artifacts/moa-site`, with the same project ID and a newly issued source credential.
Copy the current `dist/client` and `.openai/hosting.json` into that checkout before
packaging. The source helper pushes the exact source and creates the archive;
save that commit/archive as a version, then deploy the saved version. Preserve the
Site's audience. Credential tokens are passed through stdin and never saved.

The GitHub Pages address remains available for existing local records:
https://llsy97.github.io/time-tracking-app/

## Keep your records when changing addresses

Browser storage belongs to an origin. Signing into the same online account on
the new address does not automatically copy records or labels.

1. On the old address, stop and save any running timer.
2. Sign into the workspace containing your records. In Settings, choose
   **Back up all records** and keep the JSON file.
3. Open the new address, sign into the desired workspace and choose
   **Restore a backup** in Settings.
4. Check the restore confirmation. Existing blocks are kept; matching IDs are
   not duplicated. Dates, notes, pauses, custom labels and ordering are retained.

Backups contain the selected workspace's saved blocks and labels, without
password hashes, login sessions or authentication tokens. Restore settings only
into a pristine workspace. Keep backup files private because notes may be personal.

## Google Cloud login

Keep the existing `tempo-time-tracking-app` Identity Platform project and email
sender. Add `moa-time-tracker.eversince.chatgpt.site` to its authorized domains
before using Google login on the new origin. Keep the current OAuth handler
`https://tempo-time-tracking-app.firebaseapp.com/__/auth/handler`.

Online account verification and sign-in are separate from local record storage.
The hosted website does not add cross-device synchronization.

## App updates

The service worker installs a complete shell before activation. It checks for
updates when the app is opened or brought back into view. Online navigation,
scripts and styles use the network with an offline cache fallback so an old
browser calendar cannot stay pinned indefinitely. Every shell change increments
the cache version. Fonts and icons remain cache-first. Local records are separate
from these caches and are not cleared when updating.
