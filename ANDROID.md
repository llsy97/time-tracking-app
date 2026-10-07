# moa Android APK

The Android app bundles the existing web UI with Capacitor. It runs offline, stores accounts and records in its own WebView storage, and shares CSV reports through the Android share sheet. Browser/PWA records are not automatically imported. Google sign-in uses Android Credential Manager and Identity Platform. Email accounts require email verification. See [AUTHENTICATION.md](AUTHENTICATION.md) for Android OAuth registration; existing local accounts work offline.

## Build on Windows

Install Node.js, Android Studio with Java 21, Android SDK 36 and Build Tools 36.0.0. Then run:

```
npm ci
npm run android:apk
```

The signed, non-debuggable APK is written to `dist/moa-1.4.1.apk`. The script uses Android Studio's JDK and the standard SDK location, or `JAVA_HOME` / `ANDROID_HOME` overrides. Core library desugaring supplies the journal's `java.time` APIs on Android 7.x (API 24/25) as well as newer phones.

Signing credentials are generated once under `.artifacts/android-signing/` and never committed. **Back up that entire directory securely.** Future APKs must use the same signing key and application ID to update without uninstalling. Increment Android `versionCode` and `versionName` in `android/app/build.gradle` for future releases, and update the output filename in the build script.

Open the APK on Android and allow installation from the browser/file manager when prompted. This is a directly installable release, not a Play Store publication. Web deployments update the PWA; bundled Android updates require installing a new APK. Uninstalling or clearing app storage removes local records.

## Widgets and lock screen controls

In the APK, open Settings → Widgets & lock screen, then choose **Add 1 × 4 widget** or **Add 2 × 4 widget**. These are four columns wide and one or two rows high. You can also long-press the home screen, choose Widgets, and find moa. Both widgets show the moa logo and Start, Pause/Resume, Stop controls, with no label picker. Controls save directly without opening the app. Open moa once after updating to initialize widget storage. A block uses the current app draft title when one is present, otherwise “Untitled task”; add or edit its details later in Blocks.

The widgets declare both home-screen and keyguard support, but lock-screen placement depends on the phone's Android version and manufacturer. Enable lock screen controls to request notification permission and show an ongoing timer notification. Notification visibility on the lock screen also follows Android privacy settings. The notification shows elapsed time and excludes pauses. Widgets follow the system light/dark appearance.

The current block and draft are mirrored to app-private preferences. Widget changes are written synchronously to a durable journal with their workspace ID, timestamps, pauses and descriptions. The app imports changes when opened, then acknowledges them; an outdated snapshot cannot discard unacknowledged changes. Authentication tokens and unrelated history are not copied. Signing out ends the current account's block before switching widget controls to the guest workspace. Stale block/account/revision controls are ignored. No continuously running background service is needed: elapsed time is calculated from saved timestamps. Notification Pause/Stop actions use the same background receiver.

Version 1.4.0 adds the moa logo and background controls to both sizes. Existing launcher placements retain their allocated space; remove an old widget and add a new size if its shape is wrong. Launchers ultimately decide exact cell dimensions. Samsung's home launcher can host standard Android widgets. Cover-screen, Always On Display and lock-screen widget placement remains controlled by Samsung and One UI; declaring keyguard support does not bypass those restrictions. The lock-screen notification remains available where phone notification/privacy settings allow it.

Run `npm run test:android` for the journal tests, including process restart, pauses, duplicate/stale controls, several unsynced blocks and acknowledgements. The runner uses a temporary ASCII classpath because some Windows Gradle/JDK workers cannot load classes from this Korean workspace path. Browser integration covers importing background changes, app relaunch, account isolation and concurrent snapshot rejection. Native launcher placement and physical-device notification behavior still need device testing.

## Screen boundaries

The native activity applies system-bar, display-cutout and keyboard insets to the whole WebView container. It clips child rendering to those bounds and recalculates insets when Android changes the available screen. Capacitor's automatic inset handling is disabled to prevent double padding or WebView-version-dependent edge-to-edge behavior. This keeps scrolled cards and dialogs inside the usable screen instead of relying on padding on the first header. Browser/PWA safe-area CSS remains enabled; native shells override it because their containers already apply the insets.
