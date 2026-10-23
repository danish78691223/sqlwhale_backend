# SQLWhale Web Push setup

Web Push is implemented, but it is **disabled until server VAPID keys are configured**.

1. Run `npx web-push generate-vapid-keys` once on your development machine. Keep the private key secret.
2. Configure these **backend Render environment variables**:
   - `VAPID_PUBLIC_KEY`: generated public key
   - `VAPID_PRIVATE_KEY`: generated private key (never put in Next.js public variables)
   - `VAPID_SUBJECT`: `mailto:your-support-email@example.com` (replace with a real address)
   - `PUSH_CRON_SECRET`: a long random secret
3. Install backend dependencies and refresh the lockfile: `npm install`. Commit the updated `package-lock.json`. Deploy backend and frontend.
4. Users sign in and opt in from **Account → Push notifications**. Browsers require a user gesture for notification permission; no automatic permission prompt is shown.
5. Send announcements from **/admin/notifications** (admin account required). API: `POST /api/push/announcement` with `{ "title": "...", "body": "...", "url": "/run-query" }`.
6. For daily reminders, create an external scheduled POST (e.g. cron-job.org) to `https://YOUR_BACKEND_HOST/api/push/daily/send` with header `Authorization: Bearer YOUR_PUSH_CRON_SECRET`. Run it once daily at your desired time. The endpoint is idempotent per UTC date for successful deliveries; failed deliveries are retried on a subsequent invocation.

Notes:
- An installed PWA is recommended; a plain home-screen bookmark may not support background push on every platform.
- Notifications are sent only to devices with an active push subscription. Device permission can be revoked in browser/system settings.
- Daily delivery requires an external scheduler; Render's web service alone does not guarantee a daily job.
- This feature does not require Firebase.
- Existing `package-lock.json` needs regeneration after adding `web-push` and `@types/web-push`; otherwise `npm ci` may fail.
