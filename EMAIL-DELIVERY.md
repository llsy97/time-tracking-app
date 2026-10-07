# Authentication email delivery

The app uses Google Cloud Identity Platform in project `tempo-time-tracking-app` to send verification and password reset links. Inbox/spam classification belongs to the receiving mail service. Changing app JavaScript, resending repeatedly or changing an APK cannot guarantee inbox delivery.

## Immediate action

Open the received verification message in Gmail and choose **Not spam**. This trains that recipient's filter. It is not a global setting for all users. Check the full message headers using **Show original** to see SPF, DKIM and DMARC results, rather than assuming the sender is unauthenticated.

## Configure a sender domain

Use a domain you own. Configure it as the authentication email sender domain or use Identity Platform's custom SMTP settings with a mail service that verifies that domain. The sending provider supplies the actual SPF and DKIM DNS values; do not invent them or add duplicate SPF records. Configure DMARC alignment and test delivery after domain verification. Keep SMTP passwords in the Identity Platform service configuration, never in `auth-config.json`, the website or the APK.

In Google Cloud Console select `tempo-time-tracking-app`, open **Identity Platform → Settings → Email templates**. Set a recognizable application/sender name and verification subject. For example:

- Sender display name: `moa`
- Verification subject: `Verify your email for moa`
- Use the provider's verification message containing its `%LINK%` placeholder; the verification body may have customization restrictions.

The project display name also feeds the `%APP_NAME%` template placeholder. Identity Platform supports a `notification.sendEmail.method` of `CUSTOM_SMTP` with server-side SMTP configuration. If the console does not expose an option, an authenticated administrator can configure it through the project Config API. No SMTP changes have been applied by this repository update: domain ownership, provider settings and administrator access are needed first.

For a project that also has Firebase console access, Authentication → Templates → **Customize domain** provides the official domain verification flow. Complete DNS verification and apply the verified domain to each relevant template. Both consoles address the same project; using the Firebase client SDK does not require moving away from Google Cloud Identity Platform.

## Verify the result

Send one verification message to a controlled Gmail account and inspect its sender, link domain and SPF/DKIM/DMARC results. Test at least one other mail provider as well. Proper domain authentication improves delivery, but neither a custom domain nor SPF/DKIM/DMARC guarantees that every message avoids Spam.

References: [Gmail sender guidelines](https://support.google.com/mail/answer/81126), [Authentication custom email domain](https://firebase.google.com/docs/auth/email-custom-domain), [Identity Platform Config and SMTP](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config).
