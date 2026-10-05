# moa Android APK

The Android app bundles the existing web UI with Capacitor. It runs offline, stores accounts and records in its own WebView storage, and shares CSV reports through the Android share sheet. Browser/PWA records are not automatically imported. Google sign-in requires a separate native authentication integration; local accounts work offline.

## Build on Windows

Install Node.js, Android Studio with Java 21, Android SDK 36 and Build Tools 36.0.0. Then run:

```
npm ci
npm run android:apk
```

The signed, non-debuggable APK is written to `dist/moa-1.0.0.apk`. The script uses Android Studio's JDK and the standard SDK location, or `JAVA_HOME` / `ANDROID_HOME` overrides.

Signing credentials are generated once under `.artifacts/android-signing/` and never committed. **Back up that entire directory securely.** Future APKs must use the same signing key and application ID to update without uninstalling. Increment Android `versionCode` and `versionName` in `android/app/build.gradle` for future releases, and update the output filename in the build script.

Open the APK on Android and allow installation from the browser/file manager when prompted. This is a directly installable release, not a Play Store publication. Web deployments update the PWA; bundled Android updates require installing a new APK. Uninstalling or clearing app storage removes local records.
