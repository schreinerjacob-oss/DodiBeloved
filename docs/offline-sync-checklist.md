# Offline & Sync Test Matrix (Beta)

This checklist is meant for **real device pairs** (not simulators) and should be rerun before each beta release.

## Device pairs to cover

- **iOS ↔ Android** (native ↔ native)
- **iOS ↔ Web PWA** (native ↔ browser/PWA)
- **Android ↔ Web PWA** (native ↔ browser/PWA)

For each pair, run each scenario under:

- **Wi‑Fi ↔ Wi‑Fi**
- **LTE ↔ Wi‑Fi**
- **LTE ↔ LTE**

## Definitions

- **Offline**: airplane mode or no network, `navigator.onLine === false` (web), or device network disabled (native).
- **Queued**: message/media saved locally and will send on reconnect (see `offlineQueue`, `offlineMediaQueue`).
- **Reconcile**: reconnect protocol exchanging timestamps and backfilling missing items.
- **Restore**: a fresh device mirrors history from the partner device using reconnection details.

## Scenario matrix

### A. Basic queued messaging (text)

- **A1**: DeviceA offline → send 5 text messages → DeviceA online again.
  - **Expected**: messages show as queued/sending then transition to sent; DeviceB receives all in order; no duplicates.
- **A2**: DeviceA offline, DeviceB online → DeviceB sends 5 texts.
  - **Expected**: DeviceB queues until DeviceA returns; DeviceA receives all after reconnect; DeviceB status updates.

### B. Queued media (image, voice, video)

- **B1**: DeviceA offline → send 1 image + 1 voice + 1 video → reconnect.
  - **Expected**: media blobs persist locally, transfer on reconnect, render on DeviceB; no “stuck loading” tiles.
- **B2**: Network flap mid‑media transfer (toggle airplane mode quickly).
  - **Expected**: transfer retries or re-queues without app crash; eventual success on stable network.

### C. Reconciliation / backfill

- **C1**: Both devices online → confirm connected → DeviceA kills app → DeviceB sends messages → DeviceA relaunches.
  - **Expected**: DeviceA reconciles and receives missing items automatically; no manual reset needed.
- **C2**: Both devices send messages while briefly disconnected (Wi‑Fi off/on).
  - **Expected**: reconciliation converges to same history on both devices; no duplicates; timestamps sane.

### D. Restore flow integrity

- **D1**: Fresh install on DeviceA → “Reconnect & Restore” using reconnection details.
  - **Expected**: essentials load first (core data visible quickly), then background batches fill in history; UI shows progress; no orphaned state.
- **D2**: Interrupt restore mid‑process (force close app) → relaunch.
  - **Expected**: app resumes gracefully (either continues restore or can restart restore) without corrupted DB.

### E. Clock skew

- **E1**: DeviceA time +5 minutes, DeviceB correct time → send messages both ways.
  - **Expected**: app remains stable; ordering is reasonable; “On this day” resurfacing does not crash (minor ordering differences acceptable).

### F. Lock/unlock interactions

- **F1**: With PIN enabled, let DeviceA auto-lock during reconnect, then unlock.
  - **Expected**: no crashes; passphrase not kept in memory while locked; reconnection continues after unlock.

### G. Wake-up pings + push (optional, if configured)

- **G1**: DeviceA backgrounded, wake-up pings enabled → DeviceB sends message.
  - **Expected**: DeviceA receives a push/wake signal and reconnects promptly; no rapid battery drain; no repeated spam.

## What to capture when something fails

- Device pair + network mix
- Exact steps and timing (especially around network flaps)
- Screenshot of **Settings → Developer Diagnostics** status block
- Console logs (web) or Xcode/Logcat logs (native)

