# dodi - An Ultra-Private Encrypted Space for Two

## Overview

dodi (Hebrew for "my beloved") is an intimate, privacy-focused mobile web application designed exclusively for couples. It provides a secure, encrypted sanctuary for real-time messaging, shared memories, calendar events, daily emotional rituals, and love letters. The application emphasizes warmth, privacy, and meaningful connection with a "handwritten-love-note meets secret garden" aesthetic. Key capabilities include secure pairing, end-to-end encrypted communication, a private memory vault, a shared calendar, daily emotional check-ins, and a love letter exchange system. It also features disappearing messages and an offline-first architecture. The business vision is to offer a premium, ad-free, and data-collection-free platform for couples to deepen their connection.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with **React 18** and **TypeScript**, using **Vite** as the build tool. **Wouter** handles client-side routing, and **TanStack Query** manages server state. The UI uses **shadcn/ui** (built on Radix UI) and **Tailwind CSS** with a custom warm color palette. Global state is managed via **DodiContext**, while local state uses React hooks. Data persistence is achieved with **IndexedDB** for an offline-first experience. Client-side encryption leverages the **Web Crypto API** (AES-GCM 256-bit) and **PBKDF2** for key derivation. The application is a **Progressive Web App (PWA)**, with a manifest file configured for a standalone mobile experience and custom fonts (DM Sans, Architects Daughter).

### Backend Architecture

The backend utilizes **Express.js** with **Node.js** and **WebSocket** (ws library) for real-time bidirectional communication. The server acts purely as a relay, not storing any sensitive user data. It supports dual modes for development and production. Data models are defined in `shared/schema.ts` with **Zod** validation.

### Data Storage Solutions

**Client-Side:** All user data is encrypted and stored locally in **IndexedDB** in object stores like `messages`, `memories`, `calendarEvents`, `dailyRituals`, `loveLetters`, `reactions`, and `settings`.
**Server-Side:** The architecture is prepared for server-side persistence using **Drizzle ORM** with **PostgreSQL** (specifically **Neon Database** for serverless integration). A `subscriptions` table tracks trial status and Stripe integration.

### Authentication and Authorization

A unique **pairing system** allows couples to connect via QR codes or manual passphrase entry. This passphrase is used for **PBKDF2** key derivation, enabling end-to-end encryption. The system is designed with a strong emphasis on privacy, meaning no server-side authentication, no plain-text passphrase storage, and no password recovery.

### Monetization

dodi offers a **30-day free trial** with full features. Following the trial, users can subscribe to one of three plans: Monthly ($2.99), Yearly ($29.99), or Lifetime ($79 one-time). All plans unlock the complete feature set, and there are no ads or data collection.

## External Dependencies

**Database & Backend Services:**
- **Neon Database**: Serverless PostgreSQL.
- **Drizzle ORM**: Type-safe SQL query builder.
- **Stripe**: Payment processing and subscription management.

**Real-Time Communication:**
- **WebSocket (ws library)**: For bidirectional communication.

**UI Component Libraries:**
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Pre-styled Radix components.
- **Lucide React**: Icon library.
- **qrcode.react**: QR code generation.

**Date & Utility Libraries:**
- **date-fns**: Date manipulation.
- **nanoid**: Secure unique ID generation.
- **clsx** & **tailwind-merge**: Conditional CSS class management.

**Form Handling:**
- **React Hook Form**: Form state management.
- **Zod**: Schema validation.

**Fonts:**
- **Google Fonts**: DM Sans, Architects Daughter.