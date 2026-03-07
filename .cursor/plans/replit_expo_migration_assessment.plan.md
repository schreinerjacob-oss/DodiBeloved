---
name: Replit Expo/React Native migration assessment
overview: Assessment of migrating Dodi from React/Vite PWA to Replit's Mobile Apps (Expo/React Native) for guided App Store/Google Play submission, vs. keeping PWA + Capacitor.
todos: []
isProject: false
---

# Replit Expo/React Native Migration Assessment

## Context

- **Dodi:** Private P2P couples app (React/Vite, IndexedDB, WebRTC via PeerJS, on-device AES-GCM, chat, memories, Moments, Presence Glow).
- **Replit Mobile Apps (2026):** Builds native iOS/Android with Expo/React Native; guided App Store/Google Play submission.
- **Question:** Migrate to Expo/React Native for Replit native support, or keep PWA + Capacitor?

---

## 1. Key components/features that need to move to native

| Area | Current (Web) | Native equivalent |
|------|---------------|-------------------|
| **P2P signaling + data** | PeerJS (0.peerjs.com) + DataConnection | PeerJS can run in RN; or replace with `react-native-webrtc` + custom signaling |
| **Voice/video calls** | SimplePeer + `getUserMedia` | `react-native-webrtc` (RTCPeerConnection, getUserMedia) |
| **Storage** | IndexedDB via `idb` (15+ stores, Blob storage) | `@react-native-async-storage/async-storage` (key-value only) or `react-native-mmkv`; Blob storage needs `react-native-fs` or file-based approach |
| **Encryption** | Web Crypto API (`window.crypto.subtle`) | `expo-crypto` or `react-native-quick-crypto` (PBKDF2, AES-GCM) |
| **Push** | Web Push + VAPID + Service Worker | Expo Notifications / FCM / APNs (native path) |
| **Routing** | wouter | React Navigation |
| **UI** | Radix UI (20+ components), Tailwind, Framer Motion | React Native components, NativeWind or StyleSheet, Reanimated |
| **Pairing** | Code-only (8-char code) | Same; no QR. Code entry in pairing UI. |
| **Image/video capture** | `navigator.mediaDevices.getUserMedia`, `MediaRecorder` | `expo-image-picker`, `expo-av` (recording) or `react-native-webrtc` for calls |
| **Clipboard** | `navigator.clipboard` | `@react-native-clipboard/clipboard` |
| **Vibration** | `navigator.vibrate` | `expo-haptics` or `react-native-haptic-feedback` |
| **Wake lock** | `navigator.wakeLock` | `expo-keep-awake` |

---

## 2. Web-only code that won't work in React Native

| Code / API | Location | Issue |
|------------|----------|-------|
| **Service Worker** | `sw.js`, `background-sync.ts`, `push-register.ts`, `notifications.ts`, `service-worker-update.tsx` | No SW in RN; push/cache/background sync need native alternatives |
| **IndexedDB** | `storage.ts`, `storage-encrypted.ts` | No IndexedDB; full storage layer rewrite |
| **Web Crypto (`window.crypto.subtle`)** | `crypto.ts`, `tunnel-handshake.ts` | Need `expo-crypto` or `react-native-quick-crypto` |
| **localStorage** | Throughout (settings, pairing, theme) | Use AsyncStorage or SecureStore |
| **`document` / `window`** | Many files: `document.visibilityState`, `document.body`, `window.dispatchEvent`, `window.confirm`, `window.location` | No DOM in RN; use AppState, event emitters, Alert |
| **`createPortal` (react-dom)** | `calls.tsx`, `dodi-thinking-of-you-handler.tsx` | RN uses different overlay patterns (Modal, etc.) |
| **`contenteditable`** | Chat input | RN uses `TextInput`; no rich text by default |
| **`MediaRecorder`** | Chat (voice/video messages) | Use `expo-av` or native recording APIs |
| **`navigator.serviceWorker`** | Push, background sync | Not available |
| **`navigator.permissions.query`** | Background sync | Use Expo permissions APIs |
| **`beforeinstallprompt`** | `use-pwa-install.ts` | PWA-only; remove or replace with store install flow |
| **`document.cookie`** | Sidebar | Use AsyncStorage |
| **`document.createElement('canvas')`** | `utils.ts` (image resize) | Use `expo-image-manipulator` or similar |
| **Vite / `import.meta.env`** | Build config, env vars | Expo uses `expo-constants` / `app.config.js` |
| **Tailwind (PostCSS)** | `index.css`, components | NativeWind or manual StyleSheet |

---

## 3. Biggest changes for Expo/React Native compatibility

1. **Replace Vite with Expo CLI**
   - New project structure (`app/`, `expo.config.js`), Metro bundler, no `index.html`.
   - Env: `VITE_*` → `EXPO_PUBLIC_*` or `app.config.js` extra.

2. **Storage layer rewrite**
   - 15+ IndexedDB stores with Blob storage → AsyncStorage (or MMKV) for JSON + file system for media.
   - Migration path for existing encrypted data (if any) is non-trivial.

3. **Crypto layer swap**
   - `window.crypto.subtle` → `expo-crypto` or `react-native-quick-crypto`.
   - Same algorithms (PBKDF2, AES-GCM) but different API surface.

4. **P2P / WebRTC**
   - PeerJS: check if it runs in RN (some Node/browser deps may break).
   - SimplePeer: replace with `react-native-webrtc` for calls.
   - Data channel for sync: may need custom implementation over `react-native-webrtc`.

5. **UI overhaul**
   - Radix UI → React Native primitives or libraries (e.g. `react-native-paper`, custom).
   - Tailwind → NativeWind or StyleSheet.
   - `contenteditable` chat input → `TextInput` (possibly with `@react-native-rich-editor` for formatting).

6. **Push notifications**
   - Remove Web Push / Service Worker path.
   - Use Expo Notifications + FCM/APNs; backend already supports platform tokens (per app store plan).

7. **Remove or replace**
   - Service worker, PWA install banner, SW update checker.
   - Background sync → AppState + foreground reconnect (or Background Fetch if needed).
   - Pairing is code-only (no QR scanner to replace).

8. **Event system**
   - `window.dispatchEvent` / `window.addEventListener` for app events → React Context + event emitters or state.

---

## 4. Effort estimate (rough)

| Phase | Scope | Effort |
|-------|-------|--------|
| Project setup | Expo init, Metro, env, icons | 1–2 days |
| Storage + crypto | Adapter layer, AsyncStorage/MMKV, expo-crypto | 3–5 days |
| P2P / WebRTC | PeerJS or RN WebRTC, data channel, signaling | 3–5 days |
| UI migration | Screens, navigation, components | 5–10 days |
| Media (camera, recording) | Image picker, voice/video recording | 2–3 days |
| Push | Expo Notifications, FCM/APNs | 1–2 days |
| Pairing (code) | Code entry only | 0 (no QR) |
| Polish, testing | Device testing, edge cases | 3–5 days |

**Total:** ~3–5 weeks for a working native app, assuming no major PeerJS/WebRTC blockers.

---

## 5. Recommendation

**Review this assessment. Tell me if we should migrate to Expo/React Native for Replit native support, or keep as PWA + Capacitor.**

### Summary

| Option | Pros | Cons |
|--------|------|------|
| **PWA + Capacitor** | Minimal code change; reuse existing web app; Keychain for passphrase; FCM/APNs for push; app store plan already defined | WebView limitations (IndexedDB volatility, SW dead, WebRTC quirks); not “true” native |
| **Expo/React Native (Replit)** | True native; Replit’s guided submission; better keyboard/GIF support; no WebView storage issues | Full rewrite of storage, crypto, UI, P2P; 3–5 weeks; PeerJS/WebRTC in RN may need custom work |

**Suggested path:** If Replit’s guided submission and true native experience (including keyboard/GIF) are priorities, and you can invest 3–5 weeks, **Expo/React Native** is viable. If you want to ship sooner with less risk, **PWA + Capacitor** remains the lower-friction path, with the app store plan’s Keychain and FCM/APNs steps addressing the main iOS concerns.
