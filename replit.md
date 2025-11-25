# dodi - An Ultra-Private Encrypted Space for Two

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
- **NO user accounts on server** - Pairing via shared passphrase/QR code

### Frontend Stack

- **React 18** + **TypeScript** with **Vite** build tool
- **Wouter** for client-side routing
- **TanStack Query** for data fetching patterns (local queries)
- **shadcn/ui** (Radix UI) + **Tailwind CSS** for UI
- **DodiContext** for global state management
- **IndexedDB** (via idb library) for persistent encrypted storage
- Custom fonts: DM Sans, Architects Daughter

### Encryption System

All sensitive data is encrypted before storage using the **Web Crypto API**:

- **Algorithm:** AES-GCM 256-bit encryption
- **Key Derivation:** PBKDF2 with 600,000 iterations (security hardened)
- **Salt:** Cryptographically random, stored locally
- **Key Caching:** Derived key cached in memory for performance
- **Date Handling:** Dates are properly serialized/deserialized with JSON revivers
- Implementation: `client/src/lib/crypto.ts`, `client/src/lib/storage-encrypted.ts`

### Security Considerations & Threat Model

**Current Design Tradeoffs:**

1. **Passphrase Storage:** The pairing passphrase is stored in IndexedDB to enable seamless app usage across page refreshes. This is a UX tradeoff - without storage, users would need to re-enter the passphrase every time they open the app.

2. **Threat Model:**
   - **Protected against:** Network surveillance, server compromise (no server), unauthorized access to message content
   - **Not protected against:** Physical device compromise with direct IndexedDB access
   - **Mitigation:** Logout clears all stored data including cached encryption keys

3. **Future Enhancements (v2):**
   - Optional PIN/biometric lock for app access
   - Session-based passphrase that requires re-entry
   - Encrypted passphrase storage with device-specific unlock

**Logout Behavior:**
- Clears encryption key cache
- Wipes all IndexedDB stores (settings, messages, memories, etc.)
- Forces complete re-pairing on next use

### Peer-to-Peer Sync

Real-time sync between paired devices uses **WebRTC Data Channels**:

- **Library:** simple-peer for WebRTC abstraction
- **Signaling:** QR code exchange (manual SDP offer/answer)
- **No signaling server** - Completely serverless pairing
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
- `settings` - User preferences, pairing data

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
│   │   └── DodiContext.tsx  # Global state (user, pairing, trial)
│   ├── hooks/
│   │   ├── use-peer-connection.ts  # WebRTC P2P hook
│   │   └── use-websocket.ts        # Stub for backward compat
│   ├── lib/
│   │   ├── crypto.ts              # Encryption utilities
│   │   ├── storage-encrypted.ts   # Encrypted IndexedDB operations
│   │   └── queryClient.ts         # TanStack Query setup
│   ├── pages/
│   │   ├── profile-setup.tsx      # Initial name entry
│   │   ├── pairing.tsx            # QR/passphrase pairing
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

vite.replit.config.ts  # Replit-specific Vite config (allows external hosts)
```

## Development

### Running the App

```bash
npm run dev
```

This spawns Vite using `vite.replit.config.ts` which enables external host access for the Replit environment.

### Key Development Notes

1. **No server folder logic** - The server files only spawn Vite, no actual backend
2. **Types in client/src/types.ts** - All domain types defined locally, no shared folder
3. **Encryption is mandatory** - Never store unencrypted sensitive data
4. **P2P signaling via QR** - No server relay, users exchange signals manually

## Pairing Flow

1. **User A** creates profile → gets unique userId
2. **User A** initiates pairing → generates QR code with WebRTC offer + passphrase
3. **User B** scans QR code → receives offer, generates answer
4. **User B** shows answer QR code → User A scans to complete connection
5. Both devices now have shared passphrase for encryption key derivation
6. P2P data channel established for real-time sync

## Monetization

- **30-day free trial** with full features
- **Monthly:** $2.99/month
- **Yearly:** $29.99/year
- **Lifetime:** $79 one-time
- No ads, no data collection

## External Dependencies

**P2P Communication:**
- **simple-peer**: WebRTC data channel abstraction
- **qrcode.react**: QR code generation
- **html5-qrcode**: QR code scanning

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
