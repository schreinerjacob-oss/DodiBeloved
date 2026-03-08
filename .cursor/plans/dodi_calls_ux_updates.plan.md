---
name: ""
overview: ""
todos: []
isProject: false
---

# Dodi calls UX updates (refinement)

This document refines the **Calls** section of the main bug-fix plan based on your clarification: calls do connect, but (1) when you hold the phone to your face the screen should dim and only call buttons should work, and (2) video calls try to connect but the video call UI never loads and then the call ends.

---

## 1. Proximity behavior: dim screen and restrict touches

**Goal:** When the phone is held to your face during a call, the app should dim the screen and ignore touches except on the call control buttons (mute, speaker, camera toggle, end call).

**Current state:** [client/src/pages/calls.tsx](client/src/pages/calls.tsx) has no proximity handling. The in-call overlay is full-screen; the only `pointer-events-none` is on the timer (line 799). The rest of the overlay (video area, center content) can receive touches, and the screen does not dim.

**Planned work:**

- **Proximity sensor (native):** Use a Capacitor-compatible proximity plugin so that when the sensor reports "near" (phone to ear/face), we enter "proximity mode." Options:
  - Cordova plugin that works with Capacitor (e.g. `cordova-plugin-proximity` or a community Capacitor wrapper) to subscribe to proximity events.
  - Or use the (deprecated) Web API `DeviceProximityEvent` / `UserProximityEvent` where available for PWA; native builds get the plugin.
- **Proximity mode state:** Add `isNearFace` (or similar) state, set to `true` when proximity is "near" and `false` when "far."
- **Screen dimming when near:** When `isNearFace` is true during an active call:
  - Apply a dark overlay (e.g. `bg-black/80` or `brightness-[0.2]`) over the video/content area so the screen effectively dims. Optionally use [@capacitor-community/screen-brightness](https://github.com/capacitor-community/screen-brightness) on native to reduce system brightness.
- **Touch blocking when near:** When `isNearFace` is true:
  - Make the main content area (timer + video/audio area) non-interactive: `pointer-events: none` on the flex-1 center div.
  - Keep only the bottom bar (call controls) interactive: ensure the bar has `pointer-events: auto` and is above the dimmed layer (z-index). So only Mute, Speaker, Camera (video), and End Call respond to touches.
- **Fallback when no proximity API:** If no proximity sensor or API is available (e.g. desktop PWA), skip proximity mode; optionally offer a manual "Dim screen" toggle in the call UI for accessibility.

**Files to touch:** [client/src/pages/calls.tsx](client/src/pages/calls.tsx) (state, overlay structure, classes), new optional hook or util for proximity (e.g. `useProximity.ts`), and `package.json` if adding a Capacitor/Cordova plugin.

---

## 2. Video call UI never loads and call "kills"

**Goal:** Video call overlay should appear and show local/remote video; the call should not end abruptly due to ref timing or missing state reset.

**Findings:**

- **Ref timing:** In `initiatePeerConnection`, the code sets `localVideoRef.current.srcObject = stream` immediately after `getUserMedia`. At that moment React may not have committed the in-call overlay yet (we set `callActive`/`callType` then await `initiatePeerConnection`), so `localVideoRef.current` can still be `null`. The local video element never gets the stream. Similarly, `peer.on('stream')` can fire before the overlay is mounted, so `remoteVideoRef.current` may be null when we assign the remote stream.
- **Missing state reset in acceptCall:** In `acceptCall()` (lines 625–646), when `initiatePeerConnection` returns `null` we send `call-end` and `return` but we **do not** call `setCallActive(false)` or `setCallType(null)`. The user stays on the active-call overlay with no media and no way to recover until the partner hangs up or the app errors.
- **Video has no fallback:** For video, reconnect failures lead to `endCall()` after 3 attempts, so a flaky connection can make the call "kill" quickly with no clear "Connecting video..." state.

**Planned work:**

- **Attach streams when refs and stream are available:**
  - For **local video:** In `calls.tsx`, add a `useEffect` that runs when `callActive && callType === 'video'` and `localStreamRef.current` is set. In the effect, if `localVideoRef.current` exists, set `localVideoRef.current.srcObject = localStreamRef.current`. This ensures the local video element gets the stream once it’s mounted.
  - For **remote video:** Store the remote stream in a ref (e.g. `remoteStreamRef`) inside `peer.on('stream')`. Add a `useEffect` that, when `callActive && callType === 'video'` and `remoteStreamRef.current` is set, assigns `remoteVideoRef.current.srcObject = remoteStreamRef.current` when `remoteVideoRef.current` is available. So whenever the overlay is mounted and the remote stream has arrived, the remote video shows.
- **Fix acceptCall state on peer failure:** In `acceptCall()`, when `!peer` after `initiatePeerConnection`, call `setCallActive(false)` and `setCallType(null)` before sending `call-end` and returning, so the UI returns to the Calls page and doesn’t get stuck.
- **Video "connecting" state:** While `callActive && callType === 'video'` and neither local nor remote stream is attached yet (or no `mediaCallRef.current?.connected`), show a "Connecting video..." or spinner in the video area instead of empty black boxes. This avoids the impression that the UI "never loads" and gives feedback before streams appear or before reconnect/endCall runs.
- **Optional:** Add a short user-facing message when the video call ends after reconnect failures (e.g. toast: "Connection lost; call ended") so "kills" are explained.

**Files to touch:** [client/src/pages/calls.tsx](client/src/pages/calls.tsx) only (refs, useEffects, acceptCall, overlay conditional copy).

---

## Summary


| Item      | Change                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proximity | Add proximity sensor (plugin or web API); when near, dim screen and set `pointer-events: none` on content, keep only call control bar touchable.                                       |
| Video UI  | Fix ref timing with useEffects that attach local/remote streams when refs mount; fix `acceptCall` to reset `callActive`/`callType` when peer is null; add "Connecting video..." state. |


These updates replace the earlier "Calls and video calls not working" bullet in the main plan with the above two subsections.

---

## Completed (implemented)

- **Proximity:** [client/src/hooks/use-proximity.ts](client/src/hooks/use-proximity.ts) uses `userproximity` when available; [client/src/pages/calls.tsx](client/src/pages/calls.tsx) has `isNearFace` (proximity or manual), dark overlay (`bg-black/80`), `pointer-events: none` on content and `pointer-events: auto` on the control bar; manual "Dim screen" (SunDim) button added for fallback/accessibility; `manualDimScreen` cleared in `endCall()`.
- **Video UI:** `remoteStreamRef` + `remoteStreamVersion`; useEffects attach local/remote streams when refs mount; `acceptCall()` calls `setCallActive(false)` and `setCallType(null)` when peer is null; "Connecting video..." spinner shown when `remoteStreamVersion === 0`; toast on video call end after max reconnect attempts ("Connection lost; call ended"); `remoteStreamRef` and `remoteStreamVersion` reset in `endCall()`.