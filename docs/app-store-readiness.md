# Dodi App Store Readiness

This doc summarizes what was done locally (Capacitor, plugins, contracts) and what Replit completes (Firebase, signing, store submission). It also documents contracts for Flutter/native parity and store listing copy.

---

## Plugin list

| Capability | Plugin | Notes |
| ---------- |--------|------|
| Core | `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` | webDir: `dist/public` |
| Preferences / Keychain | `@capacitor/preferences` | iOS Keychain; Android SharedPreferences (v1 OK) |
| Push | `@capacitor/push-notifications` | FCM/APNs token; POST to `/register` with `platform` |
| Status bar | `@capacitor/status-bar` | Style set in App when native |
| Splash | `@capacitor/splash-screen` | Hidden when DodiContext `isLoading` is false |
| Haptics | `@capacitor/haptics` | Replaces `navigator.vibrate()` when native |
| App lifecycle | `@capacitor/app` | `appStateChange` for background/reconnect |
| Keep-awake (iOS) | `@capacitor/keep-awake` | Used when native + iOS (navigator.wakeLock not supported) |
| Biometric | `@aparajita/capacitor-biometric-auth` | Face ID / Touch ID on lock screen; optional |

---

## Service worker (native)

The service worker is **not** registered in native builds. Registration is guarded with `!Capacitor.isNativePlatform()` (in `client/src/components/service-worker-update.tsx`). SW remains enabled for **web** deploy only.

---

## Push: register / notify contract

- **Register (POST `/register`)**  
  - Web: body `{ token: string, subscription: PushSubscriptionJSON }`.  
  - Native: body `{ token: string, nativeToken: string, platform: 'ios' | 'android' }`.  
  Same endpoint; server stores by `token` and uses either Web Push or FCM/APNs depending on stored data.

- **Notify (POST `/api/notify`)**  
  Body `{ token: string, type?: 'call' | 'message' }`.  
  If the stored registration has a native token, the server sends via Firebase Admin (FCM/APNs). Env: `FIREBASE_SERVICE_ACCOUNT_JSON` (stringified JSON) or `FIREBASE_SERVICE_ACCOUNT_PATH`.

---

## Send image contract

Shared API: `sendImageFromFile(file: File, options: SendImageFromFileOptions, context: SendImageFromFileContext)` in `client/src/lib/send-image.ts`.

- **Options:** `{ kind: 'message' | 'memory', isDisappearing?: boolean, caption?: string }`.
- **Context:** userId, partnerId, connected, sendP2P, sendMedia, saveMediaBlob, getSetting, toast, saveMessage/saveMemory, and optional callbacks (onMessageCreated, onMemoryCreated, onDisappearingTimer, deleteMessage).
- Chat and Memories call this; a Flutter/native bridge can obtain a file and call the same contract (e.g. pass base64 or path; bridge converts to File and calls this).

---

## Storage and crypto (contract reference)

Storage and encryption are **not** abstracted behind adapters in this phase. For Flutter parity, implement the same contract:

- **Stores:** messages, memories, calendarEvents, settings, messageMedia, memoryMedia, offlineQueue, offlineMediaQueue, partnerDetails, etc. (see `client/src/lib/storage.ts` and DodiDB type).
- **Encryption:** PBKDF2 (e.g. 600k iterations), AES-GCM, IV length and base64 format as in `client/src/lib/crypto.ts` and `storage-encrypted.ts`.
- **Critical keys** mirrored to native Preferences when native: passphrase, salt, userId, pinEnabled, displayName, encryptedPassphrase, pin, partnerId, pairingStatus.

---

## Privacy and PeerJS

- **PeerJS:** Signaling uses `0.peerjs.com`. That third-party server can see users’ **IP addresses** and ephemeral **peer IDs**.
- **App store compliance:** Declare **IP address** under **Data Not Linked to You** (Apple App Privacy). Google Data safety: same disclosure. No account or identity is shared with PeerJS.
- **Dodi:** Data is encrypted on device and not shared with third parties beyond the above.

---

## Store copy (snippet)

- **App name:** dodi - my beloved  
- **Subtitle:** A Private Space for Two  
- **Short description:** End-to-end encrypted private messaging, memories & more for couples.  
- **Full description:** Cover privacy, P2P pairing, features, subscription (e.g. 30-day trial, $2.99/mo or $29.99/yr or $79 lifetime).  
- **Categories:** iOS Social Networking / Lifestyle; Android Communication.  
- **Age:** 12+ (iOS), Teen (Android).  
- **Keywords (iOS, 100 chars):** couples,private,encrypted,p2p,secure,chat,messaging,memories,calendar,love,relationship  

---

## Reviewer demo

Apple/Google reviewers must be able to complete onboarding without a second device. Options implemented and documented:

1. **Demo mode:** Set `VITE_DEMO_MODE=true` (or `DEMO_MODE`) so the app skips real pairing and shows a read-only demo state.
2. **Test pairing code:** A specific pairing code can be documented here and shared in App Review notes so reviewers can complete pairing (e.g. with a test second device or internal tool).

Document the chosen option in the App Review notes. Apple may still request a **video walkthrough** of the app.

### How to enable demo mode

1. **Build with demo mode:** Set the env var when building, e.g.  
   `VITE_DEMO_MODE=true npm run build`  
   or in `.env`: `VITE_DEMO_MODE=true`
2. **Behavior:** On first open (no existing pairing), the app shows the main UI (Chat, Memories, etc.) with a demo user and “connected” state, and a banner: “Demo mode — for app review. No real pairing or data.”
3. **Review notes:** In App Store Connect / Play Console review notes, state that reviewers can use a build with `VITE_DEMO_MODE=true` to explore the app without a second device, or provide a test pairing code if you prefer. Apple may still request a **video walkthrough** of the full pairing flow.

---

## Replit handoff

After this repo is in good shape, Replit completes:

- **Firebase:** Project, iOS/Android apps, `GoogleService-Info.plist` / `google-services.json`, service account key, env for notify API.
- **iOS:** Xcode signing, Push + Background Modes, Info.plist usage strings (camera, mic, photo library, Face ID), PrivacyInfo.xcprivacy, APNs.
- **Android:** Manifest permissions, `google-services.json`, signing keystore.
- **Assets:** 1024×1024 icon, splash; generate with `npx @capacitor/assets generate` (or equivalent).
- **Store listing:** Use store copy above; screenshots; Data Safety / App Privacy (IP for PeerJS).
- **Build & submit:** Archive (iOS), bundle (Android), TestFlight / Play Console, submit for review.

Run `npx cap doctor`, `npm run build:cap`, and open ios/android to verify before handoff.
