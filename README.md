# moa — Gather your time. Wrap your day.

A mobile-first, offline-ready time tracker with an English interface, local accounts, and a responsive desktop layout. Built with plain HTML, CSS, and JavaScript; fonts and the Google Cloud authentication SDK are bundled for offline loading. See AUTHENTICATION.md for provider configuration.

See [ANDROID.md](ANDROID.md) for the signed Android APK and screen insets, [IOS.md](IOS.md) for the iPhone app and WidgetKit extension, and [EMAIL-DELIVERY.md](EMAIL-DELIVERY.md) for authentication email sender configuration.

The interface follows the supplied **Paper · Ink · Signal** design: warm paper surfaces, orange accents, a day ribbon, stacked task summaries, a block timeline, and a bottom-sheet editor. Design tokens live in `assets/tokens.css`. Bricolage Grotesque, Geist, and Geist Mono are bundled in `assets/fonts/` with their OFL licenses and cached for offline use. Settings supports Light, Dark, and System appearance.

The handoff's example data is not imported. Existing timestamps, local accounts, custom/deleted labels, and per-block rounding remain unchanged. Notes can be expanded using the notes button; starting or stopping keeps the same layout. Label remove buttons and full date/time editing are retained; Settings exports the selected day, matching the app's existing export behavior.

## Run on Windows

Double-click **run_app.bat**. It starts a local Node.js server and opens **http://localhost:4173** in your browser. Keep the server window open while using the app. Node.js 22 or newer is recommended.

Alternatively:

```sh
npm run web
```

`npm run dev` starts the same server without opening a browser. `npm start` runs the optional Electron desktop edition after `npm install`. `npm run build` builds a Windows portable Electron app. This environment's existing Electron installation is incomplete; the dependency-free browser launcher is the verified run path.

The browser and Electron editions use separate storage. Always open the same edition and browser profile to access your saved records. The former `desktop_app.py` Tkinter application remains in the repository, but `run_app.bat` now opens moa.

## Everyday workflow

1. Press **Start tracking** immediately, or select a quick label first.
2. Add a task title and optional description while the timer runs. Both save automatically.
3. Press **Stop & save block**. The recorded block is saved immediately, and an editor opens so you can add or refine its details. Closing the editor keeps the original saved block.
4. Use **Daily summary** to see totals grouped by task title. Repeated titles are combined without regard to capitalization or surrounding whitespace.
5. Select a date with the calendar or day arrows. **Export** downloads that day's blocks and grouped totals as CSV.

Features include editable start/end times, manual blocks, reusable custom labels, individual deletion, clear-day confirmation, live daily totals, dark mode in Settings, and optional installation as a PWA. Records start empty; sample data is confined to automated tests.

Timers use saved timestamps, so closing the app or suspending the device does not lose elapsed time. An overnight block contributes only its portion of time to each local date. Daily boundaries respect daylight saving time. Clearing a date preserves portions on neighboring days; deleting an individual block removes its entire interval. Manually entered overlapping blocks are allowed and are summed independently.

Each time block rounds upward to the next **0.1 hour (6 minutes)** before adding it to task and day totals: 57 minutes = 1.0h; 63 minutes = 1.1h. Two separate 7-minute blocks each become 0.2h, giving **0.4h** together. Totals sum integer tenths to avoid floating-point drift. Original timestamps and the stopwatch remain exact; blocks show both rounded hours and actual duration. Charts and CSV summary totals use the same rounded-block sums. Overnight blocks are split at local midnight, with each daily portion rounded independently.

## Accounts and storage

The default login uses Google Cloud Identity Platform: email/password accounts require email verification, and Google accounts use the browser popup or native Android Credential Manager. Verification resend and password reset are included. See [AUTHENTICATION.md](AUTHENTICATION.md) for configuration and validation limits.

Existing local accounts remain available through the local-account link. Their salted password hashes and workspaces are preserved. Local and online accounts are separate; matching names do not merge records. New online passwords are handled by the authentication SDK and are not stored in the workspace data.

All time records remain in this device's local storage, unencrypted. Online login does not add record synchronization or cloud backup. Clearing app data removes local records. Export reports before clearing data or uninstalling. Switching accounts stops the previous workspace's active timer.

## Install on Android / deploy

Live app: **https://llsy97.github.io/time-tracking-app/**

GitHub Pages publishes the `main` branch from the repository root. `.nojekyll` keeps the app's static files unchanged. Push updates to `main` to redeploy. This hosted edition supports local accounts; Google sign-in requires the separate Node backend described above.

Deploy the following files together on any **HTTPS static host**:

```text
index.html
styles.css
assets/tokens.css
assets/fonts/ (include font files and licenses)
script.js
time-utils.js
sw.js
manifest.webmanifest
icon.svg
icon-192.png
icon-512.png
```

Open that HTTPS URL in Chrome on Android, then use **Install app** / **Add to Home screen** from Chrome's menu. Settings also shows an install button when the browser supplies an installation prompt. After the first successful load, the service worker caches the app shell for offline use. Account passwords need a secure context (HTTPS or localhost).

The website delivers an installable **PWA**. A separate Android APK can also be built; see [ANDROID.md](ANDROID.md). A phone's `localhost` is the phone itself, so the Windows localhost URL is only for desktop use. Publish to HTTPS for installation and use on a phone. The local Node server is a development launcher and serves only the public app files.

When updating deployed assets, increment `CACHE` in `sw.js`; the new worker activates after older app windows close. User records are independent of the app-shell cache.

## Validation

```sh
npm test
npm run test:ui
```

- Unit tests cover grouping, overnight blocks, running timers, exact midnight, zero-duration entries, clear-day preservation, invalid intervals, and daylight saving boundaries. Google route tests cover configuration, verification, origin checking, CSRF, nonce mismatch, expiry, and replay prevention.
- Browser tests run a real, hidden, headless Chromium session using the DevTools protocol. They cover start/stop, reload persistence, editing validation, custom labels, account isolation, password verification, sign-out, deletion, dark mode, mobile widths, and offline reload.
- The browser runner defaults to Microsoft Edge on Windows. Set `BROWSER_PATH` for a different Chromium executable. It uses ports 4175 and 9225 and isolated test storage under `.artifacts/`, where it also saves screenshots. It does not alter your normal browser data.
- Visual checks capture idle/tracking, summary, blocks, editing, and settings in light and dark mode at 390px, and verify 360px layout, self-hosted fonts, system-theme changes, and hidden keyboard hints on touch devices.

The app has been checked on Windows with Edge at desktop, 390px, and 360px viewport widths. Physical Android installation and Play Store distribution have not been tested.

## Android APK

See [ANDROID.md](ANDROID.md) for signed APK builds, installation, storage differences and updates. Run `npm run android:apk` to build.

## Calendar, breaks and label ordering

All tabs share a custom date picker. Its month grid marks days with recorded time using a small dot. Month/year controls and keyboard arrow navigation are supported; the selected date survives a refresh. Days spent entirely paused do not acquire dots.

Pause/Resume keeps one block and stores excluded break intervals. Actual totals, daily summaries, CSV export, the day ribbon and billable rounding all exclude breaks. Rounding applies once to each block's worked time within the selected day. Editing a paused block's title or bounds preserves its break intervals.

Hold a quick label for 450 ms, then drag to reorder. Moving before the hold scrolls the strip. With a keyboard, focus a chip and press Alt+Left/Right. Orders persist per local workspace, including reusable custom labels.
