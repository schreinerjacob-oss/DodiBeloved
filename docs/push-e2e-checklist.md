# Push Notifications E2E Checklist (Beta)

This checklist validates the full loop:

- Client registers push token/subscription
- Backend stores registration (Upstash Redis)
- Backend sends notification on `/api/notify`
- Device receives notification and wake-up behavior is acceptable

## Prereqs

- Vercel deployment (preview or prod) for the **client**
- Notify backend deployed (Vercel functions `api/register.ts`, `api/notify.ts` or `server/notify.ts`)
- Env vars configured (see `.env.example` and `docs/vercel-notify-walkthrough.md`)

## Web (PWA) push

1. **Configure env**
   - Client: `VITE_NOTIFY_SERVER_URL`, `VITE_VAPID_PUBLIC_KEY`
   - Server: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
2. **Install PWA** (recommended) and open the app.
3. **Pair two devices** (or use an existing pair).
4. **Grant notifications permission** when prompted (or via browser UI).
5. **Confirm registration**
   - In app: open **Settings → Developer Diagnostics** and ensure connection looks healthy.
   - On server: verify the `token` key exists in Redis after registration.
6. **Trigger notify**
   - Call `/api/notify` with `{ token, type: 'message' }`.
7. **Expected**
   - A notification appears with minimal content (no message body).
   - Tapping the notification opens Dodi.

## Native (Capacitor iOS/Android) push

> Requires Firebase setup and APNs/FCM configuration (see `docs/app-store-readiness.md`).

1. **Add Firebase config files**
   - Android: `android/app/google-services.json`
   - iOS: `ios/App/App/GoogleService-Info.plist`
2. **Server env**
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (stringified service account JSON)
   - Upstash env vars
3. **Install beta build** on a real device (TestFlight / internal track).
4. **Grant notifications permission** when prompted.
5. **Confirm registration**
   - Ensure `/register` receives `{ token, nativeToken, platform }`.
   - Verify storage in Redis.
6. **Trigger notify**
   - Call `/api/notify` with `{ token, type: 'message' }` (or `call`).
7. **Expected**
   - Notification arrives promptly.
   - App reconnects after user opens it; if wake-up pings are enabled, the reconnect should be faster.

## Wake-up pings validation

Use the detailed guide in `WAKE_UP_PING_VERIFICATION.md`.

### Failure-mode UX (what should happen)

- If `VITE_NOTIFY_SERVER_URL` is missing: app should continue working with **no push** (no crashes).
- If permission is denied: app continues; Settings should not repeatedly nag.
- If backend env missing: backend should fail safely; app should not hang waiting.

