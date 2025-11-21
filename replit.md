# dodi - An Ultra-Private Encrypted Space for Two

## Overview

**dodi** (Hebrew for "my beloved") is an intimate, privacy-focused mobile web application designed exclusively for couples to connect, share, and grow together. The application provides a secure, encrypted sanctuary featuring real-time messaging, shared memories, calendar events, daily emotional rituals, and love letters. Every feature emphasizes warmth, privacy, and meaningful connection with a "handwritten-love-note meets secret garden" aesthetic.

**Core Features:**
- Secure pairing system using QR codes or passphrases
- End-to-end encrypted real-time messaging with WebSocket support
- Private memory vault for photos/videos (never stored in device gallery)
- Shared calendar for anniversaries and special dates
- Daily emotional check-in rituals
- Love letter composition and exchange
- Offline-first architecture with local encryption

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework Stack:**
- **React 18** with TypeScript for type-safe component development
- **Vite** as the build tool and development server
- **Wouter** for client-side routing (lightweight React Router alternative)
- **TanStack Query (React Query)** for server state management and caching

**UI Framework:**
- **shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS** for styling with custom warm color palette (sage green, cream, blush, gold)
- Custom design system defined in `design_guidelines.md` emphasizing intimate, warm aesthetics
- "New York" style variant from shadcn/ui

**State Management:**
- **DodiContext** React context for global app state (user ID, partner ID, pairing status, online status)
- Local component state with React hooks
- IndexedDB for offline-first data persistence via `idb` library

**Routing Structure:**
- `/` - Pairing page (initial landing for unpaired users)
- `/chat` - Real-time messaging interface
- `/memories` - Private media vault
- `/calendar` - Shared calendar and anniversaries
- `/ritual` - Daily emotional check-in
- `/letters` - Love letter composition and viewing
- `/settings` - App configuration and logout

**Client-Side Encryption:**
- **Web Crypto API** for AES-GCM 256-bit encryption
- **PBKDF2** key derivation (600,000 iterations) from shared passphrase
- All sensitive data encrypted before storage in IndexedDB
- Encryption/decryption handled in `client/src/lib/crypto.ts`

**Progressive Web App (PWA):**
- Manifest file configured for standalone mobile app experience
- Offline-first architecture with service worker capabilities
- Custom fonts (DM Sans, Architects Daughter) for warm typography

### Backend Architecture

**Server Framework:**
- **Express.js** on Node.js for HTTP server
- **WebSocket** (ws library) for real-time bidirectional communication
- Dual server modes: development (with Vite HMR) and production (static file serving)

**Server Structure:**
- `server/app.ts` - Express application setup and middleware configuration
- `server/routes.ts` - WebSocket server and route registration
- `server/storage.ts` - Storage abstraction layer (currently in-memory implementation)
- `server/index-dev.ts` - Development server with Vite integration
- `server/index-prod.ts` - Production server with static file serving

**WebSocket Protocol:**
- Client registration with user ID on connection
- Message types: `register`, `message`, `memory`, `calendar`, `ritual`, `letter`, `reaction`
- Real-time broadcasting to connected partner
- Automatic reconnection on disconnect (3-second interval)
- Connection management via `Map<userId, WebSocket>`

**Data Layer:**
- **Storage Interface Pattern:** `IStorage` interface defines CRUD operations
- **Current Implementation:** `MemStorage` - in-memory Map-based storage (development/prototype)
- **Prepared for Migration:** Schema defined for Drizzle ORM with PostgreSQL
- All data models defined in `shared/schema.ts` with Zod validation

**Session Management:**
- Uses `connect-pg-simple` for PostgreSQL session storage (configured but not yet active)
- Express session middleware ready for authentication flow

### Data Storage Solutions

**Client-Side Storage (IndexedDB):**
- Database name: `dodi-encrypted-storage`
- Object stores: `messages`, `memories`, `calendarEvents`, `dailyRituals`, `loveLetters`, `reactions`, `settings`
- All user data encrypted at rest using derived encryption keys
- Indexes on timestamp fields for efficient querying
- Storage helper functions in `client/src/lib/storage.ts`

**Server-Side Storage (Prepared):**
- **Drizzle ORM** configured with PostgreSQL dialect
- **Neon Database** serverless PostgreSQL integration via `@neondatabase/serverless`
- Schema migrations managed in `./migrations` directory
- Tables mirror client-side object stores with UUID primary keys

**Database Schema (Shared):**
- `messages` - Chat messages with sender/recipient, content, media URLs, disappearing flag
- `memories` - Photo/video memories with captions and timestamps
- `calendarEvents` - Shared calendar events with anniversary flag
- `dailyRituals` - Daily emotional check-ins (emotion, loved moment, gratitude, tomorrow's needs)
- `loveLetters` - Long-form letters with title and content
- `reactions` - Quick "thinking of you" reactions between partners

### Authentication and Authorization

**Pairing System:**
- **Initialization:** User generates unique ID (nanoid) and cryptographic passphrase
- **QR Code Sharing:** Partner scans QR code containing `userId:passphrase`
- **Manual Pairing:** Partner can manually enter userId and passphrase
- **Key Derivation:** Both partners derive identical encryption keys from shared passphrase
- **No Server Authentication:** Pairs identify each other via userId, no traditional login/password

**Security Model:**
- End-to-end encryption ensures server cannot read message content
- Passphrase never stored in plain text (only used for key derivation)
- Salt stored per-user for PBKDF2 key derivation
- No password recovery mechanism (by design - privacy-first approach)
- Local device storage only (settings stored in IndexedDB)

**Privacy Features:**
- Disappearing messages flag for auto-deletion
- Memory vault separate from device photo gallery
- All data encrypted before leaving device
- Logout clears all local pairing data

### External Dependencies

**Database & Backend Services:**
- **Neon Database** - Serverless PostgreSQL (via `@neondatabase/serverless`)
- **Drizzle ORM** - Type-safe SQL query builder and migration tool
- Environment variable `DATABASE_URL` required for production

**Real-Time Communication:**
- **WebSocket** (ws library) for bidirectional messaging
- Protocol: `ws://` in development, `wss://` in production
- Automatic reconnection logic in `client/src/hooks/use-websocket.ts`

**UI Component Libraries:**
- **Radix UI** - Unstyled, accessible component primitives (20+ components)
- **shadcn/ui** - Pre-styled Radix components with Tailwind
- **Lucide React** - Icon library
- **qrcode.react** - QR code generation for pairing

**Development Tools:**
- **Vite** - Build tool with HMR and optimized production builds
- **TypeScript** - Type safety across client, server, and shared code
- **ESBuild** - Fast JavaScript bundler for server code
- **Replit plugins** - Runtime error overlay, dev banner, cartographer (Replit-specific development tools)

**Date & Utility Libraries:**
- **date-fns** - Date manipulation and formatting
- **nanoid** - Cryptographically secure unique ID generation
- **clsx** & **tailwind-merge** - Conditional CSS class management

**Form Handling:**
- **React Hook Form** - Form state management
- **Zod** - Schema validation
- **@hookform/resolvers** - Zod resolver for React Hook Form

**Fonts:**
- **Google Fonts** - DM Sans (primary), Architects Daughter (handwritten accent)
- Preconnected in `client/index.html` for performance

**Asset Management:**
- Static assets stored in `attached_assets/` directory
- Logo concepts generated and stored as images
- Vite alias `@assets` for easy import