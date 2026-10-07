# iPhone app and widgets

The iOS project includes a Capacitor app, an embedded WidgetKit extension and an App Group for the current block and unacknowledged widget changes. The app requires iOS 16 or later; interactive widget controls require iOS 17 or later. **Safari → Add to Home Screen installs the website, not this native iOS app; it cannot provide WidgetKit widgets.** Friends using that version can keep using the tracker, calendar and saved records, but need a signed native app (for example through TestFlight) for iPhone widgets. The Android 1 × 4 / 2 × 4 cell sizes do not map directly to Apple's fixed widget families.

## Build and install

On a Mac with Xcode 26 or later installed:

```sh
npm ci
npm run ios:sync
npx cap open ios
```

In Xcode, choose the same Apple development team for **App** and **MoaWidgets**. Register `app.moa.timetracker`, `app.moa.timetracker.widgets`, and App Group `group.app.moa.timetracker` under that team. Enable that App Group for both targets. If those identifiers are already owned by another team, change them consistently in build settings, entitlements and `Shared/TrackerSnapshot.swift` before provisioning. Run on an iPhone; use Archive and TestFlight to distribute a signed build. An APK cannot be installed on an iPhone.

Home Screen widgets support small and medium sizes with the moa logo and Start/Pause/Resume/Stop buttons; there is no label picker. On iOS 17+, App Intents run without opening moa. A file lock protects the shared durable journal across app and extension processes. The app imports and acknowledges background records on opening; stale owner/block/revision actions are ignored. No authentication tokens or unrelated history are shared. On iOS 16, controls are unavailable rather than launching the app. Lock Screen inline widgets show status, circular widgets toggle start/pause/resume, and rectangular widgets provide controls. iOS controls widget refresh timing and lock-screen authentication. Open moa once to initialize controls, then add block details later in the app.

## Google login

Email/password and existing local accounts use the common app flow. For native Google login, create a Google Cloud **iOS** OAuth client for `app.moa.timetracker` in project `tempo-time-tracking-app`. In `App/Info.plist`, add `GIDClientID` with that client ID and add its reversed ID as a second `CFBundleURLSchemes` entry alongside `moa`. The native plugin uses GoogleSignIn 9.0.0 and the existing web OAuth client ID as its server client ID. Without this console configuration it reports an actionable message; email login remains available.

## Validation

The GitHub Actions `iOS app and widgets` workflow compiles the app and embedded extension on a Mac runner without signing. Its simulator artifact is for Simulator, not a signed iPhone install. Real-device installation and widget/Google login behavior require the Apple team and iOS OAuth setup above. Local development in this Windows workspace cannot run Xcode or issue a signed IPA.

References: [Capacitor iOS](https://capacitorjs.com/docs/ios), [WidgetKit extensions](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension), [Google Sign-In for iOS](https://developers.google.com/identity/sign-in/ios/start-integrating).
