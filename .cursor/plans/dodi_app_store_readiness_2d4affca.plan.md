---
name: Dodi app store readiness
overview: "A phased plan to make Dodi ready for the app stores starting with a WebView (Capacitor) wrapper. Work is split: do as much as possible on this end (Cursor/local), then hand off to Replit to finish native project setup, Firebase, signing, and store submission."
todos: []
isProject: false
---

# Dodi App Store Readiness Plan

## Do here vs Replit finishes

**Do here (Cursor / local):** All code, config, and docs that don’t require Apple/Google accounts, Firebase console, or store submission. Goal: a repo that builds, runs in browser and (after `cap add`) in native shells, with native-ready logic (push, Keychain, SW guard, etc.) so Replit can open the project and complete store steps.

**Replit finishes:** Capacitor native project generation (if not committed), Firebase project + `google-services.json` / `GoogleService-Info.plist` / service account, Xcode/Android Studio signing, store assets from our source art, TestFlight/Play Console upload, privacy policy hosting if needed, and submission.

---

## Current state (from codebase)

- **Build:** Vite, root `client/`, output `dist/public`; SPA rewrites in [vercel.json](vercel.json). No Capacitor or native tooling yet.
- **PWA:** Manual [client/public/sw.js](client/public/sw.js) + [client/public/manifest.json](client/public/manifest.json); SW registered in [client/index.html](client/index.html). No Vite PWA plugin.
- **Storage:** Single IndexedDB `dodi-encrypted-storage` (v4) via [client/src/lib/storage.ts](client/src/lib/storage.ts); encrypted layer in [client/src/lib/storage-encrypted.ts](client/src/lib/storage-encrypted.ts); Web Crypto (PBKDF2 + AES-GCM) in [client/src/lib/crypto.ts](client/src/lib/crypto.ts). Media blobs in `messageMedia` / `memoryMedia`; settings mirrored in localStorage (`dodi-`*).
- **Push:** Web Push only. Client subscribes in [client/src/lib/push-register.ts](client/src/lib/push-register.ts) (VAPID); server [api/notify.ts](api/notify.ts) and [api/register.ts](api/register.ts) use Upstash Redis and `web-push`. Notify URL from `VITE_NOTIFY_SERVER_URL`; register/notify called from [client/src/App.tsx](client/src/App.tsx) and [client/src/hooks/use-peer-connection.ts](client/src/hooks/use-peer-connection.ts).
- **P2P:** PeerJS ([client/src/hooks/use-peer-connection.ts](client/src/hooks/use-peer-connection.ts)) for signaling + data channel; SimplePeer in [client/src/pages/calls.tsx](client/src/pages/calls.tsx) for voice/video. getUserMedia in chat (video/voice) and calls.
- **Image send:** [client/src/pages/chat.tsx](client/src/pages/chat.tsx) uses `processImageFile` (inline) and `sendMedia` from `usePeerConnection`; no shared "send image from File" API. Memories use similar flow in [client/src/pages/memories.tsx](client/src/pages/memories.tsx).

---

## Architecture: contracts for WebView and Flutter

```mermaid
flowchart TB
  subgraph ui [UI Layer]
    Chat[Chat / Memories / Calls]
  end
  subgraph contracts [Abstractions - same contract for Web and Flutter]
    SendImage["sendImageFromFile(File)"]
    Storage["StorageAdapter: get/set/delete"]
    Crypto["CryptoAdapter: deriveKey, encrypt, decrypt"]
    Notify["NotifyAdapter: register(token), notify(token, type)"]
  end
  subgraph webImpl [Web Implementation]
    Idb[(IndexedDB)]
    WebCrypto[Web Crypto API]
    WebPush[Web Push + VAPID]
  end
  subgraph nativeImpl [Flutter / Native Implementation]
    NativeDB[Native DB]
    NativeCrypto[Native crypto]
    FCM[FCM / APNs]
  end
  Chat --> SendImage
  Chat --> Storage
  SendImage --> Storage
  Storage --> Crypto
  Chat --> Notify
  SendImage --> Notify
  Storage -.-> Idb
  Storage -.-> NativeDB
  Crypto -.-> WebCrypto
  Crypto -.-> NativeCrypto
  Notify -.-> WebPush
  Notify -.-> FCM
```



The goal: **UI and business logic depend on adapters (storage, crypto, notify, send-image)**. Web uses current Idb/WebCrypto/Web Push; Flutter later implements the same adapters with native DB, native crypto, and FCM/APNs.

---

## Phase 1: WebView (Capacitor) readiness

**1.1 Add Capacitor and native projects**

- Add `@capacitor/core` and `@capacitor/cli`; add `@capacitor/ios` and `@capacitor/android`.
- Run `npx cap init` with app id (e.g. `com.dodi.app`), name "dodi", and **web asset directory** pointing at `dist/public` (Vite output).
- Ensure Vite build outputs to a single folder (already `dist/public`). Add `npm run build && npx cap sync` (or copy step) so native projects get the built web app.
- Create iOS and Android projects: `npx cap add ios`, `npx cap add android`. Do not commit large native binaries if repo size is a concern; document "run cap add after clone" or use git-lfs.

**1.2 Capacitor config and base URL**

- Add [capacitor.config.ts](capacitor.config.ts) (or .json) at repo root: set `webDir` to `dist/public`, `server.url` only for live reload in dev, and app id/name.
- Ensure the app loads correctly when the WebView opens `file://` or `capacitor://` (Capacitor serves from webDir). If the app uses client-side routing (wouter), base path should be `/`; no change if already root-relative.
- In [client/index.html](client/index.html), confirm manifest and assets use root-relative paths so they work inside the native WebView.

**1.3 Plugins to add and verify (WebView phase)**


| Capability                    | Plugin / approach                                | Purpose                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status bar / safe area**    | `@capacitor/status-bar`                          | Theming and notch/safe area; you already use CSS `env(safe-area-inset-*)` in index.html.                                                                                                                                                    |
| **Splash screen**             | `@capacitor/splash-screen`                       | Show splash until WebView ready; hide in `main.tsx` or after first paint.                                                                                                                                                                   |
| **Push notifications**        | `@capacitor/push-notifications` (FCM/APNs)       | In WebView, Web Push may not work when app is in background. For store builds, register FCM/APNs token and send to your existing notify API (see Phase 3).                                                                                  |
| **Biometric unlock**          | `@aparajita/capacitor-biometric-auth` or `@capacitor/biometrics` | Optional: Face ID / Touch ID on lock screen; fallback to PIN. Third-party plugin is well-maintained; official `@capacitor/biometrics` is in active development. Replit: verify chosen plugin is still maintained before shipping.                                                                     |
| **Haptics**                   | `@capacitor/haptics`                             | Replace `navigator.vibrate()` with `Haptics.impact()` when `Capacitor.isNativePlatform()`.                                                                                                                                                  |
| **Wake lock (iOS)**           | `@capacitor/keep-awake`                          | `navigator.wakeLock` doesn't work on iOS; use plugin when native + iOS.                                                                                                                                                                     |
| **Keyboard / GIF**            | Optional: custom plugin or `@capacitor/keyboard` | WebView cannot enable GBoard GIF in contenteditable; optional plugin could expose a "pick image" intent and return file to JS. Defer if not blocking launch.                                                                                |
| **Secure storage (Keychain)** | `@capacitor/preferences` (Keychain on iOS)       | **Required** before store ship. iOS: Keychain. Android: SharedPreferences (plaintext in app private dir — acceptable for v1; for Keystore parity later consider `@capacitor-community/secure-storage`). Store passphrase, PIN hash, mirrors so they survive eviction. |
| **App state**                 | Built-in (Capacitor App plugin)                  | Pause/resume, back button; useful for reconnecting P2P and clearing sensitive UI when backgrounded.                                                                                                                                         |


**1.4 Permissions and store metadata**

- **iOS:** In Xcode, add capability "Push Notifications"; in Info.plist add usage descriptions for camera (NSCameraUsageDescription), microphone (NSMicrophoneUsageDescription), and optionally photo library (NSPhotoLibraryUsageDescription) if you add explicit gallery picker for GIF.
- **Android:** In AndroidManifest.xml, declare permissions for camera, microphone, internet, and (if needed) RECORD_AUDIO, VIBRATE; no special storage permission if you only use MediaStore / SAF for picks.
- **Manifest and icons:** [client/public/manifest.json](client/public/manifest.json) already has name, icons 192/512, theme_color. Ensure `dist/public` has correct icons (e.g. [client/public/dodi-icon.png](client/public/dodi-icon.png) or similar). For stores, generate all required icon sizes (Android mipmap, iOS AppIcon) from a single 1024x1024 asset.

**1.5 Build and run**

- Script: `npm run build && npx cap sync` then open Xcode/Android Studio and run on device or simulator. Fix any path or CORS issues (Capacitor serves from file/capacitor by default; no CORS for same-origin). Ensure PeerJS, Vercel API, and notify server are reachable (HTTPS); no mixed content.

---

## Phase 2: Code and docs that help Flutter later

Phase 2 focuses on **documenting contracts** and one shared API that unblocks store and Flutter. Defer **implementing** storage/crypto/notify adapters until Flutter actually starts; the adapter pattern is the right end state but adds complexity now with benefit only when Flutter happens. Keep a single markdown contract doc and the diagram below as the source of truth.

**2.1 Single "send image from File" API**

- **Current:** [client/src/pages/chat.tsx](client/src/pages/chat.tsx) defines `processImageFile` and uses `sendMedia` from [client/src/hooks/use-peer-connection.ts](client/src/hooks/use-peer-connection.ts). Memories have similar but separate logic.
- **Change:** Extract a single, documented function (e.g. in `client/src/lib/send-image.ts` or inside a small module) that: accepts `File` (or `Blob` + filename/mime), validates type/size, creates message record, saves preview (and optional full) blob via existing storage, sends metadata via P2P, sends media via `sendMedia`. Chat and Memories (and any future GIF picker or native bridge) call this. Signature should be reusable from a Flutter bridge (e.g. "sendImageFromFile(file: File, options: { kind: 'message' | 'memory', isDisappearing?: boolean })").
- **Flutter benefit:** Native/Flutter can obtain a file from the keyboard or picker and call the same contract over a bridge (e.g. pass base64 or file path; WebView turns it into File and calls this API).

**2.2 Storage and crypto contract (document only; defer adapter code)**

- **Current:** Direct use of [client/src/lib/storage.ts](client/src/lib/storage.ts), [client/src/lib/storage-encrypted.ts](client/src/lib/storage-encrypted.ts), [client/src/lib/crypto.ts](client/src/lib/crypto.ts).
- **Change:** In `docs/app-store-readiness.md` (or a dedicated contract doc), **document** the contract: list of store names, key shapes, encryption format (PBKDF2 iterations, AES-GCM, IV length, base64). Do **not** introduce adapter code (storage-adapter.ts, crypto-adapter.ts) in this phase. When Flutter starts, implement the adapters against this doc; the diagram above remains the target architecture.

**2.3 Notify (push) contract**

- **Current:** [client/src/lib/push-register.ts](client/src/lib/push-register.ts) uses Web Push and POSTs to `getNotifyServerUrl() + '/register'` with `{ token, subscription }`. [api/register.ts](api/register.ts) stores by token; [api/notify.ts](api/notify.ts) sends via web-push.
- **Change:** Document the **register/notify API contract**: (1) Register: POST body with at least `token` (string) and either `subscription` (Web Push) or `platformToken` (FCM/APNs) and `platform: 'ios'|'android'`. (2) Notify: unchanged (token + type). Server changes: in a later phase, support storing FCM/APNs tokens and sending via Firebase Admin / APNs instead of web-push when platform is native. Client: keep current Web Push path for web; in Capacitor, add a step that gets FCM/APNs token and POSTs it with `platform` so server can choose send path. No breaking change to existing web deploy.

**2.4 Message and sync shape (document only)**

- Document the P2P message types and payloads (e.g. `message`, `message-delete`, `memory`, `memory-delete`, `calendar_event`, `partner_detail`, `beloved_survey`, call-offer, call-signal, etc.) and the media send shape (`mediaId`, `kind`, `mime`, `variant`, optional `blob`). Flutter will need to send the same JSON and same media chunks; having a single doc or type file helps.

---

## Phase 3: Plugins and functions that must work in the app stores

**3.1 Push notifications**

- **Web (current):** Web Push + VAPID; SW in [client/public/sw.js](client/public/sw.js) handles push and shows notification. Works in browser and may work in WebView when app is in foreground; often **does not** when app is backgrounded on iOS/Android.
- **Store (WebView):** Use Capacitor Push Notifications plugin to obtain FCM (Android) or APNs (iOS) token; POST that token to the same `/register` endpoint (extend body with `platform` and token). Backend: add a branch in [api/notify.ts](api/notify.ts) (or a small FCM/APNs sender) to send to FCM/APNs when the stored registration is native. Keep Web Push for web; use FCM/APNs for Capacitor builds.
- **Flutter later:** Same contract: register FCM/APNs token with your backend; backend sends via FCM/APNs. No change to notify API shape.

**3.2 Storage and encryption**

- **WebView:** IndexedDB and Web Crypto are available in the WebView. Ensure no assumptions about "browser" (e.g. avoid chrome.runtime if any). [client/src/lib/clear-app-data.ts](client/src/lib/clear-app-data.ts) must run correctly (localStorage, IndexedDB, caches, service worker unregister). On logout, [client/src/contexts/DodiContext.tsx](client/src/contexts/DodiContext.tsx) already clears stores; confirm the list matches all stores in [client/src/lib/storage.ts](client/src/lib/storage.ts) (messages, memories, calendarEvents, settings, messageMedia, memoryMedia, offlineQueue, offlineMediaQueue, partnerDetails, momentQuestionProgress, belovedSurveys, etc.).
- **Flutter:** Implement the same key derivation (PBKDF2 600k, AES-GCM) and store layout in native DB; implement adapter so app code stays unchanged.

**3.3 Media (camera, mic, playback)**

- **WebView:** `getUserMedia` and `MediaRecorder` work in Capacitor WebView. Ensure HTTPS or capacitor:// so permissions are stable. List all uses: [client/src/pages/chat.tsx](client/src/pages/chat.tsx) (video message, voice note), [client/src/pages/calls.tsx](client/src/pages/calls.tsx) (call audio/video). No change needed for Phase 1 if already working in mobile browser.
- **Flutter:** Will use native camera/audio APIs; only the **message format** and **sendMedia** contract need to match (already covered by send-image API and P2P contract).

**3.4 P2P (PeerJS and SimplePeer)**

- **WebView:** PeerJS and SimplePeer run in the WebView. Ensure WebRTC is allowed (no special config on Capacitor by default). PeerJS server (0.peerjs.com) and your notify server must be reachable; no certificate or CORS issues.
- **iOS WebView WebRTC:** Known issues — ICE candidate gathering when the app is backgrounded or screen locks can drop calls. **Test early on real device:** calls, chat media, reconnect after background. May need keepAlive or reconnect logic; document as a known limitation if unfixable.
- **Flutter:** Would replace with native WebRTC or a different signaling path; out of scope for WebView phase. Document the signaling and data message format for future parity.

**3.5 Background and lifecycle**

- **WebView:** Use Capacitor App plugin: listen for `pause` / `resume`. On pause, consider clearing sensitive UI (e.g. message draft) and ensuring P2P reconnect logic runs on resume (already in [client/src/hooks/use-peer-connection.ts](client/src/hooks/use-peer-connection.ts)). When native: use `App.addListener('appStateChange', ...)` in [client/src/lib/background-sync.ts](client/src/lib/background-sync.ts) and [client/src/hooks/use-peer-connection.ts](client/src/hooks/use-peer-connection.ts) instead of (or in addition to) `document.visibilitychange`.
- **Service worker:** In Capacitor, the service worker does **not** run meaningfully; treat it as **disabled/skipped in native builds**. In App.tsx (or wherever SW is registered), guard: `if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }`. Keep SW for **web** deploy only.
- **IndexedDB persistence:** After `initDB()`, call `navigator.storage.persist?.()` to request durable storage (best-effort; browser can deny on iOS). Keychain (Step 2) remains the real safety net for passphrase/PIN; `persist()` helps message/memory data.
- **WebRTC (iOS):** If needed, set `iceTransportPolicy: 'all'` on RTCPeerConnection options for WKWebView compatibility.

**3.6 Deep links and share (optional)**

- For "Open in Dodi" or "Share to Dodi", add Capacitor plugins (App Links / Share). Defer if not required for v1.

---

## Phase 4: Store submission checklist

- **Accounts:** Apple Developer Program; Google Play Developer.
- **App identity:** Bundle id / package name; app name; icons (all sizes); splash.
- **Privacy:** Privacy policy URL (hosted); in-app disclosure if you collect any data (Dodi is minimal; state "encrypted on device" and "not shared with third parties").
- **Store listings:** Short/long description; screenshots (phone and optionally tablet); category (e.g. Lifestyle / Social); content rating questionnaire.
- **Compliance — Apple App Privacy:** Apple's nutrition label is granular. PeerJS uses 0.peerjs.com for signaling; that third-party server sees users' IPs and peer IDs (ephemeral). Declare **"IP address"** under **"Data Not Linked to You"** (or equivalent). Google Data safety: same disclosure.
- **Build:** Archive (iOS) and bundle (Android); upload to App Store Connect and Play Console. First review can take several days.
- **Reviewer demo:** Provide a demo pairing code or "demo mode" in review notes so reviewers can complete pairing without a second device.
- **Privacy manifest (iOS 17+):** Add `PrivacyInfo.xcprivacy` declaring accessed APIs and "no data collected" where accurate.
- **Store copy (for listing):** App name "dodi - my beloved"; subtitle "A Private Space for Two"; short description (e.g. "End-to-end encrypted private messaging, memories & more for couples."); full description covering privacy, P2P pairing, features, subscription (30-day trial, $2.99/mo or $29.99/yr or $79 lifetime). Categories: iOS Social Networking / Lifestyle; Android Communication. Age: 12+ (iOS), Teen (Android). Keywords (iOS 100 chars): "couples,private,encrypted,p2p,secure,chat,messaging,memories,calendar,love,relationship".

---

## Do here: implementation order

Complete as much of the following locally as possible. Each item is code or config that does not require Apple/Google accounts or Firebase console.


| Step | Task                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1    | Add Capacitor: install core/cli/ios/android, create `capacitor.config.ts` (webDir `dist/public`, `server.androidScheme: 'https'`, SplashScreen/StatusBar in config), add scripts `build:cap`, `open:ios`, `open:android`. Run `npx cap add ios` and `npx cap add android` (track or .gitignore per team).                                                                                                                   | Do here |
| 2    | **Keychain:** Install `@capacitor/preferences`. Mirror passphrase, PIN hash, and critical keys (`dodi-userId`, `dodi-pinEnabled`, etc.) to Preferences when `Capacitor.isNativePlatform()`; fallback to current Idb/localStorage on web.                                                                                                                                                                                    | Do here |
| 3    | **SW guard:** In App.tsx (or SW registration point), register SW only when `!Capacitor.isNativePlatform() && 'serviceWorker' in navigator`.                                                                                                                                                                                                                                                                                 | Do here |
| 4    | **Push (client):** Install `@capacitor/push-notifications`. In push-register.ts, when native call plugin, get token, POST to notify server `/register-native` (or extended `/register`) with body: token, nativeToken, platform (ios or android). Keep existing Web Push path for browser.                                                                                                                                  | Do here |
| 5    | **Push (API):** In api/register.ts, add support for native registration body. In api/notify.ts, when stored registration has native token, send via Firebase Admin (FCM/APNs). Document env: `FIREBASE_SERVICE_ACCOUNT_PATH` or inline JSON.                                                                                                                                                                                | Do here |
| 6    | **Status bar, splash, haptics, app state:** Install status-bar, splash-screen, haptics, app. Set status bar style/color in App.tsx; call `SplashScreen.hide()` when app ready (e.g. when DodiContext `isLoading` false). Replace `navigator.vibrate()` with `Haptics.impact()` behind `Capacitor.isNativePlatform()`. In background-sync and use-peer-connection, use `App.addListener('appStateChange', ...)` when native. | Do here |
| 7    | **Biometric (optional):** Install `@aparajita/capacitor-biometric-auth`. On lock screen add "Use Face ID / Touch ID" when `BiometricAuth.checkBiometry().isAvailable`; on success unlock with PIN from Preferences. Store PIN in Preferences when native (see Keychain).                                                                                                                                                    | Do here |
| 8    | **Platform tweaks:** After initDB(), call `navigator.storage.persist?.()` (best-effort; Keychain is the safety net for credentials). If WebRTC issues on iOS, set `iceTransportPolicy: 'all'`. On iOS when native, use `@capacitor/keep-awake` where wake lock is needed.                                                                                                                                                      | Do here |
| 9    | **sendImageFromFile:** Extract shared `sendImageFromFile(File, options)` in e.g. `client/src/lib/send-image.ts`; wire Chat and Memories to it; document signature.                                                                                                                                                                                                                                                          | Do here |
| 10   | **Clear/logout:** Ensure clear-app-data.ts and DodiContext.tsx clear all stores (including partnerDetails, momentQuestionProgress, belovedSurveys, futureLetters, prayers, messageMedia, memoryMedia, offlineQueue, offlineMediaQueue).                                                                                                                                                                                     | Do here |
| 11   | **Docs:** Add `docs/app-store-readiness.md` (contracts, plugin list, SW disabled in native, privacy/PeerJS note, store copy snippet). Optionally add `client/public/privacy.html` with privacy policy text and link from app.                                                                                                                                                                                               | Do here |
| 12   | **Reviewer demo:** Implement so Apple/Google reviewers can complete onboarding without a second device. Either: (a) `DEMO_MODE` or `VITE_DEMO_MODE` env var that skips real pairing and shows a read-only demo state, or (b) a specific test pairing code documented in app-store-readiness.md and shared in App Review notes. Document in docs; note that Apple may still request a video walkthrough. Plan this before first submission to avoid rejection. | Do here |


*Replit can run `npx cap doctor`, `npm run build:cap`, and open ios/android to verify; any remaining native-only fixes (e.g. Info.plist strings, GoogleService files) Replit adds.*

---

## Notes (review feedback)

- **Android Preferences:** `@capacitor/preferences` on Android uses SharedPreferences (not hardware Keystore); data is in app private directory. Acceptable for v1; for Keystore parity consider `@capacitor-community/secure-storage` later.
- **persist():** `navigator.storage.persist()` is advisory on iOS; the real safety net for passphrase/PIN is Keychain (Step 2). Use `persist()` to help message/memory data; treat as best-effort.
- **Biometric plugin:** `@aparajita/capacitor-biometric-auth` is third-party; official `@capacitor/biometrics` is in active development. Either works; Replit should verify the chosen plugin is still maintained before shipping.
- **Reviewer demo (Step 12):** Apple often rejects P2P-only apps when reviewers cannot complete onboarding. Implement and document reviewer flow before first submission; Apple may request a video walkthrough.

---

## Replit finishes (handoff)

After the repo is in good shape, Replit completes:


| Item               | Notes                                                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Firebase**       | Create project; add iOS/Android apps; download `GoogleService-Info.plist` and `google-services.json`; generate service account key; set env for notify API.                                                                                                                         |
| **iOS**            | Xcode: Bundle ID, signing, Push + Background Modes capabilities; Info.plist usage strings (NSCameraUsageDescription, NSMicrophoneUsageDescription, NSPhotoLibraryUsageDescription, NSFaceIDUsageDescription); PrivacyInfo.xcprivacy; APNs key (.p8) and upload to Firebase if used. |
| **Android**        | Manifest permissions (INTERNET, CAMERA, RECORD_AUDIO, WAKE_LOCK, POST_NOTIFICATIONS, READ_MEDIA_IMAGES); add `google-services.json` and Gradle plugin; signing keystore and build.gradle signingConfigs.                                                                            |
| **Assets**         | Provide 1024×1024 icon and 2732×2732 splash source; run `npx @capacitor/assets generate` (or equivalent); update PWA manifest icons if desired.                                                                                                                                     |
| **Store listing**  | Use store copy from Phase 4 above; upload screenshots (e.g. 6.7" iPhone, Android phone, feature graphic); set category, age rating, Data Safety / App Privacy (no data collected; IP for PeerJS).                                                                                   |
| **Reviewer flow**  | Use Step 12 output (demo mode or test pairing code + doc); add to review notes. Prepare for possible Apple request for video walkthrough.                                                                                                                                          |
| **Build & submit** | Archive (iOS) and bundle (Android); upload to TestFlight and Play Console; submit for review.                                                                                                                                                                                       |


---

## Files to add or touch (summary)


| Area                | Files                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacitor           | New: `capacitor.config.ts`; new: `ios/`, `android/` (or add to .gitignore and document generation).                                                                       |
| Keychain            | Add `@capacitor/preferences`; mirror passphrase, PIN, mirrors when native (iOS Keychain; Android SharedPreferences — v1 OK). Fallback to Idb/localStorage on web. |
| SW guard            | App.tsx (or where SW is registered): register only when `!Capacitor.isNativePlatform()`.                                                                                  |
| Send image          | New: `client/src/lib/send-image.ts`; change: chat.tsx, memories.tsx, use-peer-connection.ts (keep sendMedia, call from send-image).                                       |
| Push (client)       | push-register.ts: Capacitor path for FCM/APNs token, POST to register with platform.                                                                                      |
| Push (API)          | api/register.ts (accept native body); api/notify.ts (send via Firebase Admin when native).                                                                                |
| Plugins / lifecycle | App.tsx (status bar, splash hide); background-sync.ts, use-peer-connection.ts (App.addListener when native); replace navigator.vibrate with Haptics where native.         |
| Biometric           | Lock screen: Face ID / Touch ID (e.g. `@aparajita/capacitor-biometric-auth` or `@capacitor/biometrics`); verify plugin maintenance before ship. PIN from Preferences.     |
| Platform tweaks     | storage init: `navigator.storage.persist?.()`; optional keep-awake on iOS.                                                                                                |
| Clear / logout      | clear-app-data.ts, DodiContext.tsx: clear all stores (see Step 10 list).                                                                                                  |
| Docs                | New: `docs/app-store-readiness.md` (include reviewer-demo instructions); optional: `client/public/privacy.html`.                                                          |


This plan is the single source of truth. Do the "Do here" steps first; then hand off to Replit to finish Firebase, native project config, assets, and store submission.