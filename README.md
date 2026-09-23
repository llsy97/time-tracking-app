# Tempo — Make time count

A mobile-first, offline-ready time tracker with an English interface, local accounts, and a responsive desktop layout. Built with plain HTML, CSS, and JavaScript; local mode has no runtime package dependencies or external font requests. The optional Google integration uses Google's official authentication library.

## Run on Windows

Double-click **run_app.bat**. It starts a local Node.js server and opens **http://localhost:4173** in your browser. Keep the server window open while using the app. Node.js 22 or newer is recommended.

Alternatively:

```sh
npm run web
```

`npm run dev` starts the same server without opening a browser. `npm start` runs the optional Electron desktop edition after `npm install`. `npm run build` builds a Windows portable Electron app. This environment's existing Electron installation is incomplete; the dependency-free browser launcher is the verified run path.

The browser and Electron editions use separate storage. Always open the same edition and browser profile to access your saved records. The former `desktop_app.py` Tkinter application remains in the repository, but `run_app.bat` now opens Tempo.

## Everyday workflow

1. Press **Start tracking** immediately, or select a quick label first.
2. Add a task title and optional description while the timer runs. Both save automatically.
3. Press **Stop & save block**. The recorded block is saved immediately, and an editor opens so you can add or refine its details. Closing the editor keeps the original saved block.
4. Use **Daily summary** to see totals grouped by task title. Repeated titles are combined without regard to capitalization or surrounding whitespace.
5. Select a date with the calendar or day arrows. **Export** downloads that day's blocks and grouped totals as CSV.

Features include editable start/end times, manual blocks, reusable custom labels, individual deletion, clear-day confirmation, live daily totals, dark mode in Settings, and optional installation as a PWA. Records start empty; sample data is confined to automated tests.

Timers use saved timestamps, so closing the app or suspending the device does not lose elapsed time. An overnight block contributes only its portion of time to each local date. Daily boundaries respect daylight saving time. Clearing a date preserves portions on neighboring days; deleting an individual block removes its entire interval. Manually entered overlapping blocks are allowed and are summed independently.

Task summaries and the day total round upward to the next **0.1 hour (6 minutes)** after summing actual time: 57 minutes → 1.0h; 63 minutes → 1.1h. Two 7-minute blocks of the same task total 14 minutes → 0.3h. Individual blocks, timestamps, and the live stopwatch retain actual time. The day total rounds the actual whole-day sum independently, so separately rounded task totals can add up to more than the rounded day total. The chart uses actual time; CSV reports include actual durations and rounded summary hours.

## Accounts and storage

Open **Settings → Sign in or create an account**. Usernames are case-insensitive. Passwords require at least eight characters and are stored as salted PBKDF2-SHA-256 hashes (210,000 iterations), never as plaintext. Guest and account workspaces are separate. Switching accounts or signing out saves and stops any running timer. Sessions, labels, drafts, records, and theme survive reopening.

This is a **local account system**, not a hosted authentication or synchronization service. Records are stored in `localStorage`, unencrypted, in the current browser profile. A person with access to browser developer tools or the device can access them. Clearing site storage removes them; exports provide a portable copy. There is no remote password recovery or cross-device sync. Older web-edition records under `timekeeping-app.entries.v1` are imported into the guest workspace without deleting the old key.

### Google sign-in

The optional Google integration is implemented in `google-auth.js` and `server.js`. It uses the official Google Identity Services button and verifies credentials on the server with `google-auth-library`, including the client ID, signature, expiry, issuer, and a single-use nonce. Requests also require a same-origin request and a matching CSRF challenge cookie/header. Verification follows [Google's server-side token verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

To enable it, create a **Web application** OAuth client in your Google Cloud project, register your app's exact origin as an authorized JavaScript origin, and start the Node server with its client ID:

```powershell
npm install
$env:GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'
$env:APP_ORIGIN = 'http://localhost:4173'
npm run web
```

For deployment, set `APP_ORIGIN` to the public HTTPS origin and run the Node server behind an HTTPS reverse proxy. Set `HOST` if the server must listen beyond loopback. Client IDs are public configuration; no client secret is needed for this ID-token flow. Do not put secrets in browser code.

Without configuration, the button displays **Setup needed**. Static-only deployments and the Electron edition support local accounts; Google verification requires the Node backend. Google sign-in identifies a separate local workspace, does not merge with password accounts, and does not sync records. Google credentials are not persisted. Live Google login has not been tested because no real OAuth client ID was provided; route tests exercise the verification contract with test doubles.

## Install on Android / deploy

Live app: **https://llsy97.github.io/time-tracking-app/**

GitHub Pages publishes the `main` branch from the repository root. `.nojekyll` keeps the app's static files unchanged. Push updates to `main` to redeploy. This hosted edition supports local accounts; Google sign-in requires the separate Node backend described above.

Deploy the following files together on any **HTTPS static host**:

```text
index.html
styles.css
script.js
time-utils.js
sw.js
manifest.webmanifest
icon.svg
icon-192.png
icon-512.png
```

Open that HTTPS URL in Chrome on Android, then use **Install app** / **Add to Home screen** from Chrome's menu. Settings also shows an install button when the browser supplies an installation prompt. After the first successful load, the service worker caches the app shell for offline use. Account passwords need a secure context (HTTPS or localhost).

This delivers an installable **PWA**, not an Android APK or a Play Store package. A phone's `localhost` is the phone itself, so the Windows localhost URL is only for desktop use. Publish to HTTPS for installation and use on a phone. The local Node server is a development launcher and serves only the public app files.

When updating deployed assets, increment `CACHE` in `sw.js`; the new worker activates after older app windows close. User records are independent of the app-shell cache.

## Validation

```sh
npm test
npm run test:ui
```

- Unit tests cover grouping, overnight blocks, running timers, exact midnight, zero-duration entries, clear-day preservation, invalid intervals, and daylight saving boundaries. Google route tests cover configuration, verification, origin checking, CSRF, nonce mismatch, expiry, and replay prevention.
- Browser tests run a real, hidden, headless Chromium session using the DevTools protocol. They cover start/stop, reload persistence, editing validation, custom labels, account isolation, password verification, sign-out, deletion, dark mode, mobile widths, and offline reload.
- The browser runner defaults to Microsoft Edge on Windows. Set `BROWSER_PATH` for a different Chromium executable. It uses ports 4175 and 9225 and isolated test storage under `.artifacts/`, where it also saves screenshots. It does not alter your normal browser data.

The app has been checked on Windows with Edge at desktop, 390px, and 360px viewport widths. Physical Android installation and Play Store distribution have not been tested.
