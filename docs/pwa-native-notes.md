# PWA vs Native Notes (Beta)

## Service worker

- **Web PWA**: `client/public/sw.js` is registered by `client/src/components/service-worker-update.tsx`.\n- **Native (Capacitor)**: service worker registration is skipped via `Capacitor.isNativePlatform()` guard.

## Wake locks / keep-awake

- **Web / Android WebView**: uses `navigator.wakeLock` via `client/src/hooks/use-wake-lock.ts`.\n- **iOS native WebView**: falls back to `@capacitor-community/keep-awake` (Capacitor 7-compatible version) when `navigator.wakeLock` isn’t supported.

## Background behavior

- Reconnect behavior is driven by:\n  - `client/src/lib/background-sync.ts` (visibility-based polling on web; AppState-based on native)\n  - `client/src/hooks/use-peer-connection.ts` (ping/pong health checks and reconnection backoff)\n\nFor battery safety, validate reconnect frequency on real devices and tune intervals if needed.

