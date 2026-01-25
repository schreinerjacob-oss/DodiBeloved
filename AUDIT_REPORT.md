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

### 5. **`getEssentials` and `getBatchForRestore` – Incorrect Love Letters Filtering**

**Location:** `client/src/lib/storage-encrypted.ts` – `getEssentials`, `getBatchForRestore`, `saveLoveLetter`, `saveFutureLetter`, `savePrayer`

**Problem:** The initial filtering logic in `getEssentials` and `getBatchForRestore` for the `loveLetters` store was too aggressive, only sending items matching "true" love letters (`!('gratitude' in dec) && !('unlockDate' in dec)`) and discarding `prayers` and `futureLetters`. Since all three types are stored in the same `loveLetters` database store, this caused `prayers` and `futureLetters` to be excluded entirely from restoration, leading to data loss.

**Fix:**
1. **`saveLoveLetter`, `saveFutureLetter`, `savePrayer`:** Modified to store relevant timestamp fields (`createdAt`, `unlockDate`, `prayerDate`) at the top level of the encrypted record.
2. **`getEssentials` and `getBatchForRestore`:** Updated to fetch and filter *all* encrypted items from the `loveLetters` store based on these new top-level timestamp fields (e.g., within 30 days for essentials, newer than `partnerLastSynced` for batch restore) without content-based filtering. Type-specific filtering now occurs only when data is *read* from the database (e.g., `getAllPrayers`, `getAllLoveLetters`, `getAllFutureLetters`). This ensures all data types from the `loveLetters` store are correctly preserved and restored.

---

### 6. **Join with Code vs Restore – Misleading Copy**

**Location:** `client/src/pages/pairing.tsx`

**Problem:** The "Join with Code" (new pairing) and "Restore from Partner" (reconnect) flows both led to UI copy ("Enter Restore Code" and "Regrow your connection from your partner’s device") that was oriented towards restoration, confusing users attempting a new pairing.

**Fix:** The UI copy in `pairing.tsx` was updated to clearly differentiate between "Join with Code" (for new pairings) and "Enter Restore Code" / "Regrow your connection" (for restoration).

---

### 7. **Pin Setup – Duplicate Inputs**

**Location:** `client/src/pages/pin-setup.tsx`

**Problem:** The PIN setup page contained two redundant input fields for the same PIN, one visible and one hidden. This was unnecessary and could potentially cause accessibility or unexpected behavior issues.

**Fix:** The redundant hidden input field was removed, consolidating the PIN entry to a single, visible native `<input>` element.

---

### 8. **`dodi-restore-payload` Global Listener Scope**

**Location:** Originally `client/src/pages/pairing.tsx` (listener)

**Problem:** The `dodi-restore-payload` event listener was confined to the `pairing.tsx` page. This meant that if a P2P restore-key message was dispatched while the user was already in the main application (e.g., Chat or Settings page), the event would not be processed, preventing successful restoration.

**Fix:** A new globally-mounted component, `DodiRestoreListener.tsx`, was created and integrated into `client/src/App.tsx` (within `DodiProvider`). This ensures that the `dodi-restore-payload` event is handled regardless of the current page, allowing P2P restore-key messages to be processed successfully even when the user is in the main app. The listener was removed from `pairing.tsx`.

---

## Remaining Issues (Not Fixed)

### 1. **`conn.open` in wake-up ping timeout**

**Location:** `client/src/hooks/use-peer-connection.ts` – `sendWakeUpPing`

**Problem:** A `setTimeout` checks `if (conn.open)` before closing the wake-up connection. PeerJS `DataConnection`’s `open` property may not always reflect the real state in all environments. Low risk, but worth verifying on target browsers.

**Recommendation:** Test wake-up pings on iOS Safari, Android Chrome, and desktop; add a try/catch around `conn.close()` if needed.

---

### 2. **`package.json` dev script – Windows**

**Location:** `package.json` – `"dev": "NODE_ENV=development tsx server/index-dev.ts"`

**Problem:** `NODE_ENV=development` is Unix-style. On Windows (PowerShell/CMD) this often doesn’t set the env var, so `NODE_ENV` may be undefined during `npm run dev`.

**Recommendation:** Use `cross-env` (e.g. `cross-env NODE_ENV=development tsx server/index-dev.ts`) so it works on Windows and Unix.

---
## Summary of Code Changes

| File | Change |
|------|--------|
| `client/src/lib/storage-encrypted.ts` | `saveLoveLetter`, `saveFutureLetter`, `savePrayer` now persist `createdAt`, `unlockDate`, `prayerDate` at top-level of encrypted records. `getEssentials` and `getBatchForRestore` filter by these top-level timestamps and send all items from `loveLetters` store. |
| `client/src/contexts/DodiContext.tsx` | `allowWakeUp` state moved above the effect that uses it. |
| `client/src/pages/pairing.tsx` | “Scan QR” shows a “coming soon” toast; `showScanner` state removed. UI copy updated for "Join with Code" vs "Restore". |
| `client/src/pages/pin-setup.tsx` | Removed redundant hidden PIN input. |
| `client/src/components/dodi-restore-listener.tsx` | New component created to globally handle `dodi-restore-payload` events. |
| `client/src/App.tsx` | Integrated `DodiRestoreListener` for global handling of restore payloads. |

---

## Suggested Next Steps

1. **Test restore and essentials** end-to-end with two devices after the storage and listener changes.
2. **Verify `conn.open` in wake-up ping timeout** on target browsers (iOS Safari, Android Chrome, and desktop) and add a try/catch around `conn.close()` if needed.
3. **Add `cross-env`** for the dev script in `package.json` to ensure compatibility across Windows and Unix environments.

---

## Version Info

- **App:** Dodi (ultra-private couples app)
- **Stack:** React, Vite, PeerJS, IndexedDB, E2E encryption
- **Audit:** Static review + tracing of pairing, storage, and P2P flows
