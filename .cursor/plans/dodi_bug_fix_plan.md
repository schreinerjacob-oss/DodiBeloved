# Dodi bug fix plan — progress

Master list of bugs/improvements from user feedback, with completion status. Refinement details live in [dodi_calls_ux_updates.plan.md](dodi_calls_ux_updates.plan.md) and [dodi_whispers_header_plan.md](dodi_whispers_header_plan.md).

---

## Done

| # | Item | Notes |
|---|------|--------|
| 1 | **Calls / video calls UX** | Proximity (dim + touch block + manual Dim button), video ref timing, acceptCall state reset, "Connecting video..." state, toast on video end after reconnect failures. See [dodi_calls_ux_updates.plan.md](dodi_calls_ux_updates.plan.md). |
| 2 | **Love notes open correctly** | loadAllData try/catch + toast on failure; guard note click (note && note.id); View Note dialog uses fallbacks (title ?? 'Untitled', content ?? 'Content unavailable.'). |
| 7 | **Whispers → mood in header** | Option B: mood button next to heart, dropdown with moods (changeable anytime), P2P sync, partner mood in header; old HeartWhisperCard removed from feed. See [dodi_whispers_header_plan.md](dodi_whispers_header_plan.md). |
| 10 | **PIN lock activates after setting later** | Settings: after savePIN when !hasPIN, call enablePIN() and lockApp(); context exposes enablePIN(). |
| 11 | **Tunnel reconnect UX** | Chat offline banner: "Try again" button that calls reconnect(true). |
| 12 | **Error page reload** | ErrorBoundary in main.tsx shows a Reload button that calls window.location.reload(). |

---

## Not done (remaining)

| # | Item |
|---|------|
| 3 | No way to add birthday after initial setup |
| 4 | Settings page missing solid background on several blocks |
| 5 | Gratitude confessions / prayers flow; show both answers |
| 6 | "Did not show both answers. Only the last one" (prayer/gratitude display) |
| 8 | UI doesn't adjust well for keyboard |
| 9 | Video recording from chat formats wide / sends portrait |
| 14 | Picture needs zoom ability |
| 15 | Pics and videos add to memories from chat |
| 16 | Profile section / birthday as category in special dates |
| 17 | Reactions not rendering correctly |

---

## Implementation order (suggested for remaining)

- **High:** (all done)
- **Medium:** Gratitude/prayers show both (5, 6), Reactions (17), Birthday + special dates (3, 16), Settings backgrounds (4).
- **Lower:** Video portrait (9), Image zoom (14), Add to memories (15), Keyboard UI (8).
