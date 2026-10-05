# Google Cloud Identity Platform

The app uses project `tempo-time-tracking-app`. `auth-config.json` contains public client configuration, not OAuth client secrets. `auth-client.js` uses the modular Firebase Authentication SDK to communicate with Google Cloud Identity Platform. Rebuild `assets/auth.js` with `npm run build:auth` after changing authentication code or configuration; this checked-in bundle lets GitHub Pages and the APK run without a CDN script dependency.

## Account behavior

- Default account creation uses an email address and password. A verification email is sent through Identity Platform. An unverified account cannot select a cloud workspace; the app offers resend, check verification, and use another account.
- Google login uses a browser popup on the website and Android Credential Manager in the APK. The Android ID token is exchanged with Identity Platform before a user is accepted. No client secret is bundled in either app.
- The SDK persists and refreshes its session. A cloud workspace ID in the app's local storage alone is not treated as an authenticated session. Offline use can continue with a previously persisted SDK identity.
- Password resets send a link through Identity Platform. The confirmation message does not reveal whether an account exists.
- Local accounts and their records remain available through the local-account link. They are separate from verified online accounts, even if the display names match. No automatic record transfer occurs.
- Time records remain local. Authentication does not provide cloud backup, multi-device record sync or server-enforced protection for local data. Future cloud storage must enforce user identity and email verification in server-side access rules.

## Cloud console configuration

1. Enable Email/Password and Google in Identity Platform providers.
2. Authorize `llsy97.github.io`. For local web testing, also authorize `localhost` and `127.0.0.1`.
3. In the Google web OAuth client, register `https://tempo-time-tracking-app.firebaseapp.com/__/auth/handler` as an authorized redirect URI. Keep the web client secret only in the Identity Platform Google provider configuration.
4. Put that OAuth **web client ID** in `auth-config.json` as `googleWebClientId` for the APK.
5. In the same project, create an OAuth client of type **Android** for package `app.moa.timetracker` and the SHA-1 below. It must match the certificate used to sign the installed APK. Android Studio debug builds use a different certificate and require a separate Android OAuth client.

Release certificate SHA-1:

```
5F:DE:7B:26:39:B9:66:27:FB:6A:B4:F9:40:2F:65:F7:15:BF:A2:73
```

This certificate fingerprint is public; the private signing key stays under the ignored `.artifacts/android-signing` directory.

## Validation

Browser integration tests use an authentication SDK double so they never create real production users or send emails. They check the verification gate, resend cooldown, password reset, cancellation, workspace isolation, legacy accounts and rejecting a stale saved cloud session. A real account must still be used to verify Google consent and email delivery after console configuration. Android release compilation checks the Credential Manager bridge; physical-device Google sign-in has not yet been exercised.

References: [Identity Platform Google sign-in](https://docs.cloud.google.com/identity-platform/docs/web/google), [email verification](https://firebase.google.com/docs/auth/web/manage-users), [Android Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation).
