# moa Android APK

The Android app bundles the existing web UI with Capacitor. It runs offline, stores accounts and records in its own WebView storage, and shares CSV reports through the Android share sheet. Browser/PWA records are not automatically imported. Google sign-in uses Android Credential Manager and Identity Platform. Email accounts require email verification. See [AUTHENTICATION.md](AUTHENTICATION.md) for Android OAuth registration; existing local accounts work offline.

## Build on Windows

Install Node.js, Android Studio with Java 21, Android SDK 36 and Build Tools 36.0.0. Then run:

```
npm ci
npm run android:apk
```

The signed, non-debuggable APK is written to `dist/moa-1.2.1.apk`. The script uses Android Studio's JDK and the standard SDK location, or `JAVA_HOME` / `ANDROID_HOME` overrides.

Signing credentials are generated once under `.artifacts/android-signing/` and never committed. **Back up that entire directory securely.** Future APKs must use the same signing key and application ID to update without uninstalling. Increment Android `versionCode` and `versionName` in `android/app/build.gradle` for future releases, and update the output filename in the build script.

Open the APK on Android and allow installation from the browser/file manager when prompted. This is a directly installable release, not a Play Store publication. Web deployments update the PWA; bundled Android updates require installing a new APK. Uninstalling or clearing app storage removes local records.

## Widgets and lock screen controls

In the APK, open Settings → Widgets & lock screen. “Add home screen widget” opens Android's pin-widget prompt where supported; you can also long-press the home screen and choose Widgets → moa timer. The widget shows the task, elapsed timer, and start/pause/resume/stop controls. Controls open the app (unlocking if necessary) and apply the action to the matching current block; they do not modify WebView records in a background process.

The widget declares both home-screen and keyguard support, but lock-screen placement depends on the phone's Android version and manufacturer. Enable lock screen controls to request notification permission and show an ongoing timer notification. Notification visibility on the lock screen also follows Android privacy settings. The widget and notification use the system chronometer while running, and exclude pauses. Widgets follow the system light/dark appearance.

Only the active task's title, ID, elapsed time, status and snapshot timestamp are mirrored to app-private preferences. Authentication tokens and time-history data are not copied into widget storage. Signing out clears the active snapshot. Android compilation and browser bridge tests pass; native launcher placement and physical-device notification behavior still need device testing.

Version 1.2.1 adds a compact widget layout with a 180 × 150 dp minimum, switching to the larger layout when resized. Samsung's home launcher can host standard Android widgets. Cover-screen, Always On Display and lock-screen widget placement remains controlled by Samsung and One UI; declaring keyguard support does not bypass those restrictions. The lock-screen notification remains available where phone notification/privacy settings allow it.

## Screen boundaries

The native activity applies system-bar, display-cutout and keyboard insets to the whole WebView container. It clips child rendering to those bounds and recalculates insets when Android changes the available screen. Capacitor's automatic inset handling is disabled to prevent double padding or WebView-version-dependent edge-to-edge behavior. This keeps scrolled cards and dialogs inside the usable screen instead of relying on padding on the first header. Browser/PWA safe-area CSS remains enabled; native shells override it because their containers already apply the insets.
