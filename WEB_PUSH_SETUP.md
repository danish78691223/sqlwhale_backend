# SQLWhale Web Push setup

SQLWhale supports install-independent Web Push for visitors who explicitly grant browser notification permission. A PWA installation is not required on supported desktop and Android browsers.

## Backend configuration

1. Generate a VAPID key pair once: `npx web-push generate-vapid-keys`. Keep the private key secret.
2. Configure these **backend Render environment variables**:
   - `VAPID_PUBLIC_KEY`: generated public key
   - `VAPID_PRIVATE_KEY`: generated private key (never put in Next.js public variables)
   - `VAPID_SUBJECT`: a real support mailto address, e.g. `mailto:hello@webxwhale.com`
   - `PUSH_CRON_SECRET`: a long random secret
3. Keep the public key and private key paired. Rotating VAPID keys invalidates browser subscriptions created with the previous public key.
4. Deploy backend and frontend after the changes are merged.

## Visitor opt-in

1. A visitor opens SQLWhale in a supported browser.
2. SQLWhale registers `/sw.js` and displays its optional notification explainer.
3. The visitor presses the enable control; only then does the browser permission prompt appear.
4. On approval, the browser PushSubscription is stored in MongoDB. Login and PWA installation are not required on supported platforms.
5. If the visitor later signs in on that same browser, the endpoint is linked to their SQLWhale account. Existing account-level preferences remain available in Account → Push notifications.

The prompt is suppressed after the visitor chooses either option, using browser-local storage. Clearing site data can make it appear again.

## Sending notifications

- Send announcements from `/admin/notifications` (admin account required). API: `POST /api/push/announcement` with `{ "title": "...", "body": "...", "url": "/run-query" }`.
- This broadcast targets all active subscriptions that have announcements enabled, including anonymous visitor subscriptions.
- For daily reminders, configure an external scheduled POST (e.g. cron-job.org) to `https://YOUR_BACKEND_HOST/api/push/daily/send` with header `Authorization: Bearer YOUR_PUSH_CRON_SECRET`. Run it at the desired time. The endpoint is idempotent per UTC date for successful deliveries; failed deliveries can be retried.
- Expired endpoints (HTTP 404/410) are automatically removed.

## Platform limitations and privacy

- Chrome/Edge on Android and desktop can receive Web Push without installing SQLWhale as a PWA.
- iPhone/iPad requires iOS/iPadOS 16.4 or later and the user must add SQLWhale to the Home Screen before enabling Web Push.
- Browser and operating-system notification permissions must remain enabled. Users can revoke permission at any time.
- Only visitors who explicitly opt in are subscribed. Merely visiting the page does not grant notification permission or create a subscription.
- Push payloads contain the notification content and destination only; anonymous subscriptions are stored without a SQLWhale account ID.
- Daily delivery requires an external scheduler; a Render web service alone does not guarantee a daily job.
- This feature uses the Web Push API and VAPID; Firebase is not required.
