# dodi - An Ultra-Private Encrypted Space for Two

## Total Privacy Promise
Dodi is built on one unbreakable promise: total privacy. **Message and media content never touches a server.** Your shared space is end-to-end encrypted and synchronizes directly between your two devices via Peer-to-Peer (P2P) technology. The only optional server component is a tiny **push notification relay** that stores push tokens (not content) to wake the other device.

## Overview

dodi (Hebrew for "my beloved") is an intimate, privacy-focused mobile web application designed exclusively for couples. It provides a secure, encrypted sanctuary for real-time messaging, shared memories, calendar events, daily emotional rituals, and love letters. The application emphasizes warmth, privacy, and meaningful connection with a "handwritten-love-note meets secret garden" aesthetic. Key capabilities include secure pairing, end-to-end encrypted communication, a private memory vault, a shared calendar, daily emotional check-ins, and a love letter exchange system. It also features disappearing messages and an offline-first architecture.

**CRITICAL ARCHITECTURE DECISION:** This is a **P2P-first** app: all user content is stored locally (encrypted IndexedDB) and syncs device-to-device over WebRTC. A minimal backend exists only for **push notifications** (`api/register.ts`, `api/notify.ts`) and never handles message content.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Pure Client-Side Architecture

dodi is a **Progressive Web App (PWA)** that runs primarily in the browser:

- **NO server for content** - All message/memory/call content stays on-device and P2P
- **NO database server for user data** - All content stored in encrypted IndexedDB
- **NO WebSocket message relay** - Real-time sync via WebRTC data channels
- **NO accounts** - Pairing is device-to-device (tunnel handshake + QR/code)
- **Optional push relay** - Only for notification tokens (no message content)

### Frontend Stack

- **React 18** + **TypeScript** with **Vite** build tool
- **Wouter** for client-side routing
- **TanStack Query** for data fetching patterns (local queries)
- **shadcn/ui** (Radix UI) + **Tailwind CSS** for UI
- **DodiContext** for global state management
- **IndexedDB** (via idb library) for persistent encrypted storage
- **Framer Motion** for animations
- Custom fonts: DM Sans, Architects Daughter

### Signal-Style Tunnel Pairing System (NEW)

The pairing system uses a Signal-inspired secure tunnel approach for key exchange:

**Flow:**
1. **Device A (Creator)** taps "Create Connection" → generates ephemeral ECDH P-256 keypair + WebRTC offer; displays an 8-character pairing code.
2. **Device B (Joiner)** taps "Join with Code" and enters the code from Device A.
3. **PeerJS** connects both devices (signaling via peerjs.com); WebRTC data channel opens.
4. **Tunnel Handshake** occurs over the encrypted WebRTC channel:
   - Device A sends `tunnel-init` with public key + fingerprint
   - Device B verifies fingerprint (SECURITY CRITICAL)
   - Device B responds with own `tunnel-init`
   - Shared secret derived via ECDH
5. **Device A** generates permanent AES-GCM 256-bit master key + 16-byte salt
6. **Master key sent encrypted** over the tunnel (tunnel-key message)
7. **Device B** receives and stores master key, sends ACK
8. Both devices now share the same encryption key for all future data

**Security Features:**
- Ephemeral keys never persist
- Fingerprint verification prevents MITM attacks
- Master key encrypted before transmission
- No passphrase entry required

**Implementation:**
- `client/src/lib/tunnel-handshake.ts` - Key generation, derivation, encryption
- `client/src/hooks/use-peer-connection.ts` - Tunnel message handling
- `client/src/pages/pairing.tsx` - Code-based pairing + beautiful animations

### Encryption System

All sensitive data is encrypted before storage using the **Web Crypto API**:

- **Algorithm:** AES-GCM 256-bit encryption
- **Key Source:** Direct master key from tunnel (no passphrase derivation needed)
- **Salt:** 16-byte cryptographically random, shared during pairing
- **Key Caching:** Master key cached in memory for performance
- **Date Handling:** Dates are properly serialized/deserialized with JSON revivers
- Implementation: `client/src/lib/crypto.ts`, `client/src/lib/storage-encrypted.ts`

### Security Considerations & Threat Model

**Security Model:**

1. **Tunnel Pairing:** Master key is transmitted over an encrypted WebRTC channel after ECDH key agreement. The fingerprint verification ensures the correct peer.

2. **Threat Model:**
   - **Protected against:** Network surveillance, server compromise (no server), unauthorized access to message content, MITM attacks (fingerprint verification)
   - **Not protected against:** Physical device compromise with direct IndexedDB access
   - **Mitigation:** Logout clears all stored data including cached encryption keys

3. **PIN/Auto-Lock Security:**
   - Optional PIN (4-6 digits) can be set after pairing
   - Auto-lock after configurable inactivity period (default 10 minutes)
   - PIN verification required to access app
   - Passphrase backup unlock option

**Logout Behavior:**
- Clears encryption key cache
- Wipes all IndexedDB stores (settings, messages, memories, etc.)
- Forces complete re-pairing on next use

### Peer-to-Peer Sync

Real-time sync between paired devices uses **WebRTC Data Channels**:

- **Library:** Native WebRTC (RTCPeerConnection, RTCDataChannel)
- **Signaling:** 8-character pairing code; PeerJS for initial connection, then WebRTC data channel
- **No custom signaling server** - PeerJS relay for setup only; data is P2P
- **Incremental Sync:** Only new messages since last sync are transmitted
- Implementation: `client/src/hooks/use-peer-connection.ts`

### Data Storage

All data stored in encrypted **IndexedDB** object stores:
- `messages` - Chat messages (with disappearing message support)
- `memories` - Photo memories with captions
- `calendarEvents` - Shared calendar events
- `dailyRituals` - Daily whispers (mood + optional gratitude, one per day)
- `loveLetters` - Love letters and notes
- `futureLetters` - Time-locked future letters
- `prayers` - Gratitude / Journey of Blessings
- `reactions` - Emoji reactions
- `settings` - User preferences, pairing data, master key

### Heart Space (Daily Rituals)

The **Heart Space** screen (`heart-space.tsx`) has three tabs that match the data above:

- **Whispers**: Quick mood picker (Feeling loved, Happy, Grateful, Peaceful, Thinking of you, Missing you) plus optional gratitude note; one whisper per day; "Recent Whispers" list.
- **Love Letter Vault**: Write and read love letters; list view with previews.
- **Journey of Blessings**: "Share Today's Gratitude" (one entry per day); "Today's Shared Blessings" when both have submitted; history list.

### PWA Features

- **Offline-first:** App works without internet connection
- **Installable:** Can be installed as standalone app
- **Service Worker:** Caches app shell for instant loading
- Manifest: `client/public/manifest.json`

## File Structure

```
client/
├── src/
│   ├── App.tsx              # Main app with routing
│   ├── types.ts             # All TypeScript type definitions
│   ├── contexts/
│   │   └── DodiContext.tsx  # Global state (user, pairing, trial, PIN)
│   ├── hooks/
│   │   ├── use-peer-connection.ts  # WebRTC P2P + tunnel handshake
│   │   ├── use-inactivity-timer.ts # Auto-lock timer
│   │   └── use-websocket.ts        # Stub for backward compat
│   ├── lib/
│   │   ├── crypto.ts              # Encryption utilities
│   │   ├── tunnel-handshake.ts    # Signal-style key exchange
│   │   ├── storage-encrypted.ts   # Encrypted IndexedDB operations
│   │   ├── pairing-codes.ts       # Tunnel session helpers
│   │   └── queryClient.ts         # TanStack Query setup
│   ├── pages/
│   │   ├── profile-setup.tsx      # Initial name entry
│   │   ├── pairing.tsx            # Code-based tunnel pairing
│   │   ├── chat.tsx               # Main chat interface
│   │   ├── memories.tsx           # Photo memories
│   │   ├── heart-space.tsx        # Whispers, Love Letter Vault, Journey of Blessings
│   │   ├── calls.tsx              # Voice/video calls
│   │   ├── settings.tsx           # App settings
│   └── components/
│       └── ui/                    # shadcn components
├── public/
│   ├── manifest.json              # PWA manifest
│   └── sw.js                      # Service worker
└── index.html                     # Entry point
```

## Development

### Running the App

```bash
npm run dev
```

Runs Vite dev server on port 5000 (Replit-friendly). `npm run build` produces static files; `npm run start` serves them with `vite preview`.

### Environment variables (optional for local dev)

Push notifications are optional in dev. If you want to test them, copy `.env.example` to `.env` and set:

- `VITE_NOTIFY_SERVER_URL`, `VITE_VAPID_PUBLIC_KEY` (client)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (server)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (native push)

### Key Development Notes

1. **Client-only PWA** - No backend; dev and production use Vite only
2. **Types in client/src/types.ts** - All domain types defined locally, no shared folder
3. **Encryption is mandatory** - Never store unencrypted sensitive data
4. **P2P pairing via shared code** - No server relay; both devices use the same 8-character code
5. **Fingerprint verification is critical** - Always verify before accepting keys

## Pairing Flow (Signal-Style Tunnel)

1. **Creator** taps "Create Connection" → generates ephemeral ECDH keypair + WebRTC offer; screen shows 8-character code
2. **Joiner** taps "Join with Code" and enters the code from the creator's device
3. **WebRTC connection established** (via PeerJS) → data channel opens
4. **Creator** sends tunnel-init with public key + fingerprint
5. **Joiner** verifies fingerprint → derives shared secret → responds with tunnel-init
6. **Creator** generates master key + salt → encrypts with shared secret → sends tunnel-key
7. **Joiner** receives master key → stores in IndexedDB → sends tunnel-ack
8. **Both devices** now have identical master key for AES-GCM encryption
9. **Beautiful animation:** "Your Gardens Are Now Eternally Connected ♾️"

## Support the Garden
Dodi is funded entirely by its users. Support the garden — keep it private forever for couples everywhere.

- **30-day free trial** with full features
- **Monthly:** $2.99/month
- **Yearly:** $29.99/year
- **Lifetime:** $79 one-time
- No ads, no data collection, no server storage.

## External Dependencies

**P2P Communication:**
- **Pairing:** 8-character code (see `client/src/lib/pairing-codes.ts`); no QR
- Native WebRTC (RTCPeerConnection) via PeerJS

**UI & Styling:**
- **Radix UI**: Accessible component primitives
- **shadcn/ui**: Pre-styled Radix components
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon library
- **Framer Motion**: Animations

**Data & Utilities:**
- **idb**: IndexedDB wrapper
- **date-fns**: Date manipulation
- **nanoid**: Secure ID generation
- **zod**: Schema validation
- **react-hook-form**: Form handling

**Fonts:**
- Google Fonts: DM Sans, Architects Daughter
