# dodi - An Ultra-Private Encrypted Space for Two

## Total Privacy Promise
Dodi is built on one unbreakable promise: total privacy. Nothing ever touches a server after pairing. Your shared space is end-to-end encrypted and synchronizes directly between your two devices via Peer-to-Peer (P2P) technology. No central server, no data collection, no leaks possible.

## Overview

dodi (Hebrew for "my beloved") is an intimate, privacy-focused mobile web application designed exclusively for couples. It provides a secure, encrypted sanctuary for real-time messaging, shared memories, calendar events, daily emotional rituals, and love letters. The application emphasizes warmth, privacy, and meaningful connection with a "handwritten-love-note meets secret garden" aesthetic. Key capabilities include secure pairing, end-to-end encrypted communication, a private memory vault, a shared calendar, daily emotional check-ins, and a love letter exchange system. It also features disappearing messages and an offline-first architecture.

**CRITICAL ARCHITECTURE DECISION:** This is a **PURE CLIENT-SIDE PWA** with **ZERO BACKEND**. All data is stored locally in encrypted IndexedDB. Sync between devices happens via WebRTC peer-to-peer connections with no server relay.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Pure Client-Side Architecture

dodi is a **Progressive Web App (PWA)** that runs entirely in the browser with no backend server dependency:

- **NO server-side code** - All logic runs client-side
- **NO database server** - All data stored in encrypted IndexedDB
- **NO WebSocket relay server** - Sync via WebRTC P2P
- **NO user accounts on server** - Pairing via Signal-style tunnel handshake

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
1. **Device A (Creator)** generates ephemeral ECDH P-256 keypair
2. **Device A** creates ultra-light QR code containing:
   - WebRTC offer (SDP)
   - Ephemeral public key
   - Key fingerprint (SHA-256 based, e.g., "AB:CD:EF:12")
3. **Device B (Joiner)** scans QR → establishes WebRTC data channel
4. **Tunnel Handshake** occurs over encrypted WebRTC channel:
   - Device A sends `tunnel-init` with public key + fingerprint
   - Device B verifies fingerprint matches QR code (SECURITY CRITICAL)
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
- `client/src/pages/pairing.tsx` - Ultra-light QR + beautiful animations

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
- **Signaling:** Ultra-light QR code (WebRTC offer + ephemeral public key)
- **No signaling server** - Completely serverless pairing
- **Incremental Sync:** Only new messages since last sync are transmitted
- Implementation: `client/src/hooks/use-peer-connection.ts`

### Data Storage

All data stored in encrypted **IndexedDB** object stores:
- `messages` - Chat messages (with disappearing message support)
- `memories` - Photo memories with captions
- `calendarEvents` - Shared calendar events
- `dailyRituals` - Daily emotional check-ins
- `loveLetters` - Love letters and notes
- `futureLetters` - Time-locked future letters
- `prayers` - Gratitude and prayers log
- `reactions` - Emoji reactions
- `settings` - User preferences, pairing data, master key

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
│   │   ├── pairing.tsx            # Ultra-light QR tunnel pairing
│   │   ├── chat.tsx               # Main chat interface
│   │   ├── memories.tsx           # Photo memories
│   │   ├── calendar.tsx           # Shared calendar
│   │   ├── daily-ritual.tsx       # Daily check-ins
│   │   ├── love-letters.tsx       # Love letters
│   │   ├── future-letters.tsx     # Time-locked letters
│   │   ├── prayers.tsx            # Gratitude log
│   │   ├── reactions.tsx          # Reactions
│   │   ├── calls.tsx              # Voice/video calls
│   │   ├── settings.tsx           # App settings
│   │   └── subscription.tsx       # Trial/subscription
│   └── components/
│       └── ui/                    # shadcn components
├── public/
│   ├── manifest.json              # PWA manifest
│   └── sw.js                      # Service worker
└── index.html                     # Entry point

server/
├── index-dev.ts    # Development: spawns Vite
└── index-prod.ts   # Production: spawns Vite preview
```

## Development

### Running the App

```bash
npm run dev
```

This spawns Vite which enables external host access for the Replit environment.

### Key Development Notes

1. **No server folder logic** - The server files only spawn Vite, no actual backend
2. **Types in client/src/types.ts** - All domain types defined locally, no shared folder
3. **Encryption is mandatory** - Never store unencrypted sensitive data
4. **P2P signaling via ultra-light QR** - No server relay, single scan pairing
5. **Fingerprint verification is critical** - Always verify before accepting keys

## Pairing Flow (Signal-Style Tunnel)

1. **Creator** taps "Create Connection" → generates ephemeral ECDH keypair + WebRTC offer
2. **Creator** shows ultra-light QR code with offer + public key + fingerprint
3. **Joiner** scans QR code → extracts offer, public key, fingerprint
4. **WebRTC connection established** → data channel opens
5. **Creator** sends tunnel-init with public key + fingerprint
6. **Joiner** verifies fingerprint matches QR → derives shared secret → responds with tunnel-init
7. **Creator** generates master key + salt → encrypts with shared secret → sends tunnel-key
8. **Joiner** receives master key → stores in IndexedDB → sends tunnel-ack
9. **Both devices** now have identical master key for AES-GCM encryption
10. **Beautiful animation:** "Your Gardens Are Now Eternally Connected ♾️"

## Support the Garden
Dodi is funded entirely by its users. Support the garden — keep it private forever for couples everywhere.

- **30-day free trial** with full features
- **Monthly:** $2.99/month
- **Yearly:** $29.99/year
- **Lifetime:** $79 one-time
- No ads, no data collection, no server storage.

## External Dependencies

**P2P Communication:**
- **qrcode.react**: QR code generation
- **html5-qrcode**: QR code scanning
- Native WebRTC (RTCPeerConnection)

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
