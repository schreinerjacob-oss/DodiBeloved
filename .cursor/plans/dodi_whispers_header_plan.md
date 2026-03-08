# Whispers: header placement and overhaul

**Context:** Whispers are currently weekly prompt cards (Heart Whispers) shown at the top of the chat message feed. You want them in the **header** next to the "sending a heart" button, with two possible directions: remove for now, or overhaul to a **mood** feature that’s changeable at any time.

---

## Placement (both options)

- **Location:** Chat header bar in [client/src/pages/chat.tsx](client/src/pages/chat.tsx) (the `h-14` row with Dodi logo and heart button, lines 1147–1173).
- **UI:** Add a control **next to** the existing Heart (thinking-of-you) button in the right-side `flex items-center gap-2` block. So the header order becomes: logo (left) | pending badge (if any) | **whisper/mood control** | heart button.

---

## Option A: Remove whispers for now

- Remove the HeartWhisperCard from the chat message area (lines 1229–1235) and the related state/effects (`heartWhisper`, `getNextWhisper`, lastWhisperShownAt, dismissedWhisperIds, etc.).
- Do **not** add any new header control for whispers; leave only the heart button.
- Optionally keep [client/src/lib/heart-whispers.ts](client/src/lib/heart-whispers.ts) and [client/src/components/heart-whisper-card.tsx](client/src/components/heart-whisper-card.tsx) in the codebase but unused, or delete them for a cleaner slate. Same for settings keys: `lastWhisperShownAt`, `lastWhisperId`, `dismissedWhisperIds`, `dismissedWhisperIdsWeekStart` can be left or cleaned up later.

**Result:** Chat header unchanged except no whisper card in the feed; whispers feature is effectively off.

---

## Option B: Overhaul to mood-in-header (recommended direction)

Turn whispers into a **mood** that lives in the header and is **changeable at any time** via a popup menu.

**Behavior:**

1. **Header control:** In the chat header, next to the heart button, add a button (e.g. whisper/mood icon: `MessageCircle`, `Smile`, or a small heart+sparkle). Tap opens a **popover/dropdown menu** (Radix `DropdownMenu` or `Popover`), not a card in the feed.
2. **Menu content:** A list of **moods** the user can select (e.g. "Happy", "Calm", "Thinking of you", "Tired", "Grateful", "Missing you", "Excited", "Peaceful", or a similar small set). One option can be "No mood" / "Clear" to remove the mood. Selection is **changeable at any time** (no weekly slot or dismiss logic).
3. **Persistence and sync:** Store the current mood in settings (e.g. `currentMood` or in a small "user status" object). Optionally sync to partner via P2P so they see "Beloved is feeling X" in chat (e.g. a compact status line at the top of the message list or in the header when viewing partner’s mood).
4. **Remove old whisper UX:** Remove the HeartWhisperCard from the message feed, the `getNextWhisper` scheduling, and the "Save to Notes" / "Later" flow from the card. The weekly prompt list in `heart-whispers.ts` can be repurposed as a **mood list** (labels only) or replaced by a new `moods.ts` (or similar) list of mood options. HeartWhisperCard component can be retired or refactored into a small "mood chip" for display only.

**Implementation outline:**

- **Chat header ([client/src/pages/chat.tsx](client/src/pages/chat.tsx)):**  
  - Add a mood/whisper button next to the heart button.  
  - On click, open a `DropdownMenu` (or `Popover`) with a list of mood options.  
  - On select: save mood to settings, optionally send a P2P "mood-update" so partner’s client can show it, close the menu.  
  - No card in the scroll area.
- **Mood list:** Define a small set of moods (id + label, e.g. `{ id: 'happy', label: 'Happy' }`) in a shared constant (e.g. [client/src/lib/moods.ts](client/src/lib/moods.ts) or repurpose part of `heart-whispers.ts`).
- **Display for partner:** If synced, show partner’s current mood in chat (e.g. a single line above the messages or in the header: "Beloved is feeling Calm"). Only show when mood is set and optionally when it was updated recently (e.g. last 24h) so it feels current.
- **Settings:** Store `currentMood` (and maybe `moodUpdatedAt`) via existing `saveSetting` / `getSetting`. No need for `lastWhisperShownAt`, `dismissedWhisperIds`, or weekly logic.

**Files to touch:**  
[client/src/pages/chat.tsx](client/src/pages/chat.tsx) (header button, popover, remove card from feed, optional partner mood display), new or repurposed mood list module, optional P2P message type `mood-update` and handler. Remove or repurpose [client/src/components/heart-whisper-card.tsx](client/src/components/heart-whisper-card.tsx) and simplify [client/src/lib/heart-whispers.ts](client/src/lib/heart-whispers.ts) if keeping mood labels there.

---

## Recommendation

- **Option A** if you want to ship quickly and revisit later.
- **Option B** if you want whispers to become a first-class, chat-integrated "mood" that stays in the header and is changeable anytime, with optional visibility to partner.

Both options put nothing at the "bottom of chat"; the only header change in Option A is removal of the card from the feed. Option B adds the header button and popover next to the heart button as described.

---

## Completed (Option B implemented)

- **Mood list:** [client/src/lib/moods.ts](client/src/lib/moods.ts) defines 10 moods (Happy, Calm, Thinking of you, Tired, Grateful, Missing you, Excited, Peaceful, Loved, Hopeful) and `getMoodLabel()`.
- **Chat header:** Mood button (MessageCircle icon) next to heart opens a `DropdownMenu` with all moods and "Clear mood"; selection persisted via `currentMood` setting and synced via P2P `mood-update`.
- **Partner mood:** Incoming `mood-update` updates `partnerMood`; header shows partner's mood label (truncated) with tooltip "Beloved is feeling X".
- **Removed:** HeartWhisperCard from message feed; `heartWhisper` state and `getNextWhisper` effect; imports for HeartWhisperCard and heart-whispers. Heart-whispers lib and HeartWhisperCard component remain in codebase but are unused.
