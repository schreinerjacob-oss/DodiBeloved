# Dodi — Project Reference for Claude

## What Is This

**Dodi** ("my beloved" in Hebrew) is an ultra-private couples-only app. Two partners connect directly device-to-device with no server ever seeing their messages. Everything is encrypted at rest and in transit. There is no account, no cloud, no tracking.

The app is a React PWA wrapped in Capacitor for native iOS/Android distribution.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18 + TypeScript + Vite |
| Routing | Wouter |
| Styling | TailwindCSS + Radix UI + Framer Motion |
| P2P messaging | PeerJS (WebRTC data channel) |
| Voice/video calls | SimplePeer (WebRTC media) |
| Storage | IndexedDB via `idb`, encrypted |
| Encryption | Web Crypto API (PBKDF2 + AES-GCM) |
| Push notifications | Web Push (VAPID) + FCM/APNs via Upstash Redis |
| Native wrapper | Capacitor 7 (iOS + Android) |
| Deployment | Vercel (web PWA) |

---

## Architecture

### Core principle — no server for messages
All chat, media, calls, and shared data go over WebRTC data channels directly between the two devices. The only server involved is a tiny Vercel function (`api/notify.ts`) that relays push notification tokens — it never sees message content.

### Key files

| File | Purpose |
|------|---------|
| `client/src/App.tsx` | App state machine: loading → profile setup → pairing → PIN setup → tutorial → locked → main app |
| `client/src/contexts/DodiContext.tsx` | Global state: userId, partnerId, passphrase, PIN lock, pairing status, premium |
| `client/src/contexts/OnboardingContext.tsx` | Tutorial/onboarding state |
| `client/src/hooks/use-peer-connection.ts` | WebRTC peer management, reconnection, offline queue flush |
| `client/src/lib/storage-encrypted.ts` | All IndexedDB read/write ops with encryption |
| `client/src/lib/storage.ts` | Raw IndexedDB (media blobs, offline queue) |
| `client/src/lib/crypto.ts` | Web Crypto: key derivation, encrypt, decrypt |
| `client/src/lib/send-image.ts` | Shared image-send API used by Chat and Memories |
| `client/src/lib/capacitor-preferences.ts` | Native Keychain/SharedPreferences mirror for critical keys |
| `client/src/lib/tunnel-handshake.ts` | QR pairing handshake protocol |
| `server/notify.ts` | Push notification relay (Express, Upstash Redis) |
| `api/notify.ts` | Vercel serverless push notify endpoint |
| `api/register.ts` | Vercel serverless push register endpoint |
| `capacitor.config.ts` | Capacitor app config (appId: `com.dodi.app`, webDir: `dist/public`) |

### App flow (state machine in App.tsx)
1. No userId → `ProfileSetupPage`
2. Not paired → `PairingPage` (QR scan)
3. `showPinSetup` → `PinSetupPage`
4. `!hasSeenTutorial` → `OnboardingPage`
5. `isLocked` → `PinLockPage`
6. Main app with 5-tab nav bar

### Storage stores (IndexedDB)
`messages`, `memories`, `calendarEvents`, `dailyRituals`, `loveLetters`, `futureLetters`, `prayers`, `reactions`, `partnerDetails`, `momentQuestionProgress`, `belovedSurveys`, `messageMedia`, `memoryMedia`, `offlineQueue`, `offlineMediaQueue`, `settings`

---

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` or `/chat` | Chat | Main messaging: text, images, voice, video. Disappearing messages, reactions, offline queue |
| `/calls` | Calls | WebRTC voice and video calls with reconnect and fallback audio |
| `/heart-space` | Heart Space | Whispers (daily mood), Love Notes vault, Prayers/gratitude |
| `/memories` | Our Story | Photo/video memories grid, special dates, "On this day" resurfacing, notes on you |
| `/settings` | Settings | PIN change, sync, theme, image send mode, redundancy backup, developer diagnostics |
| `/redundancy` | Redundancy | Backup/restore passphrase for device migration |

---

## What Has Been Built

### Core features (complete)
- QR code pairing — scan partner's code to establish shared passphrase
- End-to-end encrypted messaging over WebRTC data channel
- Offline queue — messages saved locally and flushed on reconnect
- Reconciliation — on reconnect, devices exchange timestamps and backfill missing messages
- Disappearing messages (30s timer, both sides)
- Image sending with preview + full-quality two-pass delivery
- Voice messages (MediaRecorder, WebM/Opus)
- Video messages (MediaRecorder, WebM/VP9)
- Paste-to-send images (clipboard API + Gboard HTML fallback)
- WebRTC voice calls with reconnect and data-channel fallback audio
- WebRTC video calls
- Message reactions (double-tap or long-press)
- Read receipts (single/double checkmark)
- Typing indicators
- "Thinking of you" heart ping
- PIN auto-lock with inactivity timer
- Biometric unlock (Face ID / Touch ID via `@aparajita/capacitor-biometric-auth`)
- Passphrase unlock fallback
- Heart Whispers — daily reflection prompts in chat
- Daily mood whispers (Heart Space)
- Love Notes / letters vault (Heart Space)
- Prayers & gratitude reveal (Heart Space)
- Photo/video memories with captions, edit, delete
- "On this day" memory resurfacing (1–3 years back)
- Special dates / anniversary calendar with notification reminders
- Notes on You — save chat moments as private notes, sync to partner
- HeartWhisperCard — weekly relationship prompts, save to notes
- Push notifications — Web Push (PWA) + FCM/APNs (native) via Upstash Redis
- Wake-up ping — notify partner's device to reconnect
- PWA: installable, service worker, offline-first
- Capacitor wrapper: iOS + Android native projects added
- Native Keychain/SharedPreferences mirror for passphrase/PIN (survives WKWebView eviction)
- Status bar + splash screen theming (native)
- Screen wake lock (navigator.wakeLock on web/Android, @capacitor/keep-awake on iOS)
- Haptic feedback on native
- Demo mode for App Review (no real pairing required)
- Privacy policy page (`/privacy`)
- Theme toggle (light/dark)
- Developer diagnostics panel

### Infrastructure (complete)
- Vercel deployment configured (vercel.json SPA rewrites)
- Upstash Redis for push token storage
- VAPID Web Push setup
- Firebase Admin for FCM/APNs native push
- Capacitor native projects (android/, ios/) committed

---

## What Remains / Known Issues

### Before App Store submission
- **Payment / IAP** — "Support the Garden" button in Settings instantly grants premium with no payment (`setPremiumStatus(true)`). Needs StoreKit (iOS), Google Play Billing (Android), or Stripe (web). This is the biggest remaining feature.
- **`@capacitor/keep-awake` wrong package** — `package.json` lists `@capacitor/keep-awake` which does not exist on npm. The correct community package is `@capacitor-community/keep-awake`. The package is externalized in vite.config.ts (so web build passes), but the native build will need this fixed before `cap sync`.
- **Firebase setup** — `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) need to be added to the native projects for FCM/APNs push to work. Requires a Firebase project.
- **App signing** — Xcode signing (Apple Developer account) and Android keystore not yet configured.
- **Store assets** — Screenshots, feature graphic, and App Store preview videos not yet created.
- **Privacy policy hosting** — `/privacy` page exists in the app; needs a publicly accessible URL for store submission.

### Nice to have / polish
- GIF keyboard support — Gboard GIFs paste via clipboard HTML fallback (works), but native GIF picker requires a Capacitor plugin or share intent bridge
- Message status "delivered" and "read" receipts are tracked but "read" state is not automatically marked when partner views the message (only manual via API)
- `window.confirm` still used for special date deletion in memories.tsx (`handleDeleteDate`) — should use AlertDialog like memory deletion now does
- "Gardens Synced" reconciliation toast copy is thematic but unclear — could be "Messages Synced"
- Message status indicator JSX is duplicated 4x across message types (text/image/voice/video) — candidate for a small `<MessageStatus />` component

---

## Development Commands

```bash
npm run dev          # Start Vite dev server (port 5000)
npm run build        # Vite production build → dist/public
npx cap sync         # Sync web build to native iOS/Android projects
npx cap open ios     # Open in Xcode
npx cap open android # Open in Android Studio
```

## Environment Variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `VITE_NOTIFY_SERVER_URL` | Client | Base URL for push notify/register API |
| `VAPID_PUBLIC_KEY` | Client + Server | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Server | Web Push VAPID private key |
| `UPSTASH_REDIS_REST_URL` | Server | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Server | Upstash Redis token |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Server | Firebase Admin service account (stringified JSON) |

## Code Style Notes
- No backend for user data — if something touches a server, question it
- All storage goes through `storage-encrypted.ts`, never raw IndexedDB directly
- P2P messages are dispatched as `CustomEvent('p2p-message')` on `window` — components listen and react
- Capacitor native APIs are always guarded with `Capacitor.isNativePlatform()` and dynamically imported so web builds are not affected
- Native-only Capacitor packages are listed in `vite.config.ts` `rollupOptions.external` so web builds pass without them installed
