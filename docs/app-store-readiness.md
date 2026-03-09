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
| Keep-awake (iOS) | `@capacitor-community/keep-awake` | Used when native + iOS (navigator.wakeLock not supported) |
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
- **Full description:** Cover privacy, P2P pairing, and features. **Beta note:** “All features are free during beta; no charges.” (Do not mention subscriptions/IAP until billing is implemented.)  
- **Categories:** iOS Social Networking / Lifestyle; Android Communication.  
- **Age:** 12+ (iOS), Teen (Android).  
- **Keywords (iOS, 100 chars):** couples,private,encrypted,p2p,secure,chat,messaging,memories,calendar,love,relationship  

---

## Reviewer demo

Apple/Google reviewers must be able to complete onboarding without a second device. **Demo mode is not advertised in the app**; it is documented here for App Review notes only.

### Option A: In-app pairing code (no special build)

1. **Flow:** After profile setup, on the pairing screen tap **Join with Code**. Enter the code **DEMO-MODE** (or **DEMOMODE**) and tap Join.
2. **Behavior:** The app enters demo mode: main UI unlocks (Chat, Calls, Heart Space, Our Story, Settings) with a demo user and “connected” state. A banner appears: “Demo mode — for app review. No real pairing or data.” No second device or real P2P connection is used.
3. **Review notes:** In App Store Connect / Play Console review notes, state: *“Reviewers can explore the app without a second device by entering the pairing code **DEMO-MODE** on the pairing screen (Join with Code). This is for review only and is not shown in the app UI.”*

### Option B: Build with demo mode env

1. **Build:** Set the env var when building, e.g.  
   `VITE_DEMO_MODE=true npm run build`  
   or in `.env`: `VITE_DEMO_MODE=true`
2. **Behavior:** On first open (no existing pairing), the app automatically shows the main UI in demo state with the same banner. No pairing step needed.
3. **Review notes:** State that reviewers received a build with demo mode enabled so they can explore without a second device.

### General

- Document the chosen option (A or B) in the App Review notes. Apple may still request a **video walkthrough** of the app or pairing flow.
- Demo mode is for review only; it is not advertised or surfaced to end users in the app.

---

## Replit handoff

After this repo is in good shape, Replit completes:

- **Firebase:** Project, iOS/Android apps, `GoogleService-Info.plist` / `google-services.json`, service account key, env for notify API.
- **iOS:** No Mac required. Configure in browser (developer.apple.com, appstoreconnect.apple.com); build/upload via cloud service (Codemagic, Bitrise, or GitHub Actions). See [apple-ios-no-mac.md](apple-ios-no-mac.md). Push + Background Modes, Info.plist usage strings (camera, mic, photo library, Face ID), PrivacyInfo.xcprivacy, APNs.
- **Android:** Manifest permissions, `google-services.json`, signing keystore.
- **Assets:** 1024×1024 icon, splash; generate with `npx @capacitor/assets generate` (or equivalent).
- **Store listing:** Use store copy above; screenshots; Data Safety / App Privacy (IP for PeerJS).
- **Build & submit:** Archive (iOS) via cloud build, bundle (Android), TestFlight / Play Console, submit for review.

Run `npx cap doctor`, `npm run build:cap`, and open ios/android to verify before handoff.
