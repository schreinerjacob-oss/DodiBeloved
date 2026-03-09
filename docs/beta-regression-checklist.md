# Beta Regression Checklist

Run this before each beta build (web, iOS, Android). Prefer testing on **two real devices**.

## Required device pairs

- **iOS ↔ Android**
- **iOS ↔ Web PWA**
- **Android ↔ Web PWA**

For each pair, try at least one **Wi‑Fi ↔ Wi‑Fi** run and one **LTE ↔ Wi‑Fi** run.

## 1) First-run + onboarding

- **Profile setup**: enter display name, optional birthday → continues to Pairing.
- **Pairing page**: Create Connection, Join with Code, and Restore entry points visible and readable.
- **PIN setup**: set PIN, skip PIN, verify app proceeds correctly.
- **Tutorial**: Next/finish works; tutorial does not reappear after completion.
- **Privacy policy**: Settings → “View privacy policy” opens `/privacy` and shows `privacy.html`.

## 2) Pairing & reconnect

- **Create/Join pairing**: DeviceA creates, DeviceB joins → both end in connected state.
- **Reconnect string**: copy/paste reconnection string → restores connection as expected.
- **Demo mode (review)**: if using DEMO-MODE path, confirm banner appears and no real pairing occurs.

## 3) Chat core

- **Send text** both directions.
- **Typing indicator** appears/disappears.
- **Reactions** (long press / double-tap) sync both directions.
- **Disappearing messages**: send one; verify both sides remove it on timer.
- **Message status icon**: queued/sending/sent/delivered/read show correctly (at least queued/sent in offline/online).

## 4) Media messaging

- **Image send**: select image, preview/full mode behaves as expected, renders on receiver.
- **Voice message**: record, send, play on receiver.
- **Video message**: record, send, play on receiver.
- **Fullscreen viewer**: image zoom/pan; close works.

## 5) Calls

- **Voice call**: start, accept, hang up; no stuck “in call” UI.
- **Video call**: start, accept, switch away/back, hang up.
- **Permissions**: camera/mic permission prompts show clear OS dialogs; denial shows graceful UX.

## 6) Heart Space

- **Whispers**: create today’s entry, see in recent list, sync to partner.
- **Love letters**: create + view, sync (if applicable).
- **Prayers/gratitude**: create + reveal flow works; sync behavior matches expectation.

## 7) Memories / Our Story

- **Create memory** (image/video) with caption; sync to partner.
- **Edit caption**; verify update syncs.
- **Delete memory**; verify removal syncs.
- **Special dates**: add/edit/delete; verify UI stays consistent.

## 8) Settings & diagnostics

- **Garden Mode (beta)** toggle works; copy makes it clear it’s free beta.
- **Wake-up pings** toggle (if available) changes behavior without breaking connection.
- **Sync now** triggers reconnect/reconcile without crashing.
- **Developer diagnostics** can be enabled/disabled; does not leak message content.
- **Privacy health check** runs to completion.
- **Complete reset** clears app and returns to pairing/profile.

## 9) Offline / bad network

Use `docs/offline-sync-checklist.md` for detailed matrix; minimum for regression:

- DeviceA offline → send 3 texts + 1 image → reconnect → receiver gets all, no duplicates.
- Network flap during media transfer → app remains stable and eventually recovers.

## 10) Push notifications (optional)

If push is configured, run `docs/push-e2e-checklist.md`.

