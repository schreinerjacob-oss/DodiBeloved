# Dodi App – Audit Report

**Date:** January 24, 2026  
**Scope:** Full app audit – pairing, P2P, storage, encryption, UX.

---

## Executive Summary

Several bugs and inconsistencies were found that affect **restore sync**, **essentials filtering**, **pairing UX**, and **state initialization**. The most critical have been fixed in code; the rest are documented below for follow-up.

---

## Critical Issues (Fixed)

### 1. **`getBatchForRestore` ignored `partnerTimestamps`**

**Location:** `client/src/lib/storage-encrypted.ts` – `getBatchForRestore`

**Problem:** The function received `partnerTimestamps` but never used them. It sent the first `batchSize` items from each store instead of only items **newer than** the partner’s last synced timestamp. Restore batches could send old data the partner already had, or skip newer data.

**Fix:** Filter items with `itemTime > partnerLastSynced` before slicing, and only include those in the batch.

---

### 2. **Memories and rituals lost timestamps in encrypted storage**

**Location:** `client/src/lib/storage-encrypted.ts` – `saveMemory`, `saveDailyRitual`

**Problem:** Encrypted records were stored as `{ id, ...encrypted }` only. `timestamp` (memories) and `updatedAt`/`ritualDate` (rituals) were not persisted. As a result:

- `getEssentials` filters (`m.timestamp > thirtyDaysAgo`, etc.) always saw `undefined` → **all memories/rituals were excluded** from essentials.
- `getItemsSince` / `getBatchForRestore` couldn’t reliably filter by time.

**Fix:** `saveMemory` now also stores `timestamp`. `saveDailyRitual` now stores `ritualDate`, `updatedAt`, and `timestamp` on the encrypted record.

---

### 3. **`allowWakeUp` state used before declaration**

**Location:** `client/src/contexts/DodiContext.tsx`

**Problem:** `setAllowWakeUpState` was used in the `loadPairingData` effect (around line 119) but the `useState` for `allowWakeUp` was declared much later (around line 301). This “used before declaration” pattern is fragile and can cause issues depending on execution order.

**Fix:** `allowWakeUp` / `setAllowWakeUpState` state was moved up with the other state declarations, before the effect.

---

### 4. **“Scan QR” in Restore flow did nothing**

**Location:** `client/src/pages/pairing.tsx` – Restore from Partner → “Scan QR”

**Problem:** The “Scan QR” button only called `setShowScanner(true)`. There was no UI that rendered when `showScanner` was true (no QR scanner component, no `#qr-reader`, no `html5-qrcode` usage). The button appeared to work but had no effect.  
`QR_SCANNING_DEBUG_GUIDE.md` describes a “Join with QR Code” flow that doesn’t exist in the current pairing UI.

**Fix:** The button now shows a toast: *“Scan QR coming soon – Please enter the 8-character code from your partner’s device for now.”* The unused `showScanner` state was removed.

---

## Remaining Issues (Not Fixed)

### 5. **`getEssentials` – loveLetters vs future letters**

**Location:** `client/src/lib/storage-encrypted.ts` – `getEssentials`

**Problem:** The `loveLetters` store holds love letters, prayers, and future letters. `getEssentials` treats all as “future letters” and sends them under `loveLetters`. The comment says “filter on receiving end,” but the sender still over-sends and mixes types. Decryption would be needed to filter correctly before send.

**Recommendation:** Either decrypt and filter before adding to essentials, or clearly document that “loveLetters” in essentials means “all loveLetters store contents” and ensure the receiver handles that.

---

### 6. **Join with Code vs Restore – misleading copy**

**Location:** `client/src/pages/pairing.tsx`

**Problem:** “Join with Code” (new pairing) and “Restore from Partner” (reconnect) both lead to a code-entry flow. When joining via “Join with Code,” the pairing UI still shows “Enter Restore Code” and “Regrow your connection from your partner’s device,” which is restore-oriented. Users doing a **new** pairing may think they’re in a restore flow.

**Recommendation:** Use separate copy for “Join with Code” (e.g. “Enter your partner’s code”) vs “Restore” (e.g. “Enter restore code from partner’s device”), or use distinct modes/screens.

---

### 7. **`conn.open` in wake-up ping timeout**

**Location:** `client/src/hooks/use-peer-connection.ts` – `sendWakeUpPing`

**Problem:** A `setTimeout` checks `if (conn.open)` before closing the wake-up connection. PeerJS `DataConnection`’s `open` property may not always reflect the real state in all environments. Low risk, but worth verifying on target browsers.

**Recommendation:** Test wake-up pings on iOS Safari, Android Chrome, and desktop; add a try/catch around `conn.close()` if needed.

---

### 8. **`package.json` dev script – Windows**

**Location:** `package.json` – `"dev": "NODE_ENV=development tsx server/index-dev.ts"`

**Problem:** `NODE_ENV=development` is Unix-style. On Windows (PowerShell/CMD) this often doesn’t set the env var, so `NODE_ENV` may be undefined during `npm run dev`.

**Recommendation:** Use `cross-env` (e.g. `cross-env NODE_ENV=development tsx server/index-dev.ts`) so it works on Windows and Unix.

---

### 9. **Pin setup – duplicate inputs**

**Location:** `client/src/pages/pin-setup.tsx`

**Problem:** There are two inputs for the same PIN: one with `opacity-0 absolute pointer-events-none` and one visible. Both bind to the same state. The hidden one appears to be unused or legacy.

**Recommendation:** Remove the hidden input if it’s not required for accessibility or form behavior; otherwise document why both exist.

---

### 10. **`dodi-restore-payload` only when Pairing page is mounted**

**Location:** `client/src/pages/pairing.tsx` (listener) vs `client/src/hooks/use-peer-connection.ts` (dispatches `dodi-restore-payload`)

**Problem:** Restore payloads over the **pairing tunnel** are handled in `runJoinerTunnel` / `handleMasterKeyReceived`. The **P2P** `restore-key` message dispatches `dodi-restore-payload`, which the Pairing page listens for. When the app is **paired and connected** (e.g. Chat, Settings), the Pairing page is not mounted, so no one handles `dodi-restore-payload`. A restore-key over P2P while already in the main app would fire the event but not be processed.

**Recommendation:** If P2P restore-key is meant to work when already paired, add a global listener (e.g. in `App` or a top-level provider) that handles `dodi-restore-payload` and updates context/storage. Otherwise, document that P2P restore-key is only used during initial pairing/restore.

---

## Summary of Code Changes

| File | Change |
|------|--------|
| `client/src/lib/storage-encrypted.ts` | `getBatchForRestore` filters by `partnerTimestamps`; `saveMemory` persists `timestamp`; `saveDailyRitual` persists `ritualDate`, `updatedAt`, `timestamp`. |
| `client/src/contexts/DodiContext.tsx` | `allowWakeUp` state moved above the effect that uses it. |
| `client/src/pages/pairing.tsx` | “Scan QR” shows a “coming soon” toast; `showScanner` state removed. |

---

## Suggested Next Steps

1. **Implement QR scanning** for Restore (and optionally Join) using `html5-qrcode`, and align with `QR_SCANNING_DEBUG_GUIDE.md`.
2. **Differentiate “Join with Code” vs “Restore”** in UX and copy.
3. **Add `cross-env`** for the dev script.
4. **Clarify P2P restore-key** handling when already paired, and add a global listener if needed.
5. **Test restore and essentials** end-to-end with two devices after the storage changes.

---

## Version Info

- **App:** Dodi (ultra-private couples app)
- **Stack:** React, Vite, PeerJS, IndexedDB, E2E encryption
- **Audit:** Static review + tracing of pairing, storage, and P2P flows
