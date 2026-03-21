# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AppTracker is a full-stack co-op/internship application tracker web app built for students managing many job applications. It includes Gmail integration for email-based application detection with LLM classification (confirmation-based, not automatic).

## Tech Stack

- **Framework:** Next.js 14+ (App Router) with TypeScript
- **Database:** PostgreSQL (Supabase) via Prisma v7 ORM
- **Auth:** NextAuth v5 (Google OAuth + Credentials)
- **UI:** Tailwind CSS + shadcn/ui v4 (base-ui primitives, NOT radix)
- **Email:** Gmail API via googleapis SDK
- **LLM:** OpenAI GPT-4o-mini for email classification
- **Deployment:** Vercel

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npx tsc --noEmit     # Type check
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma migrate dev --name <name>  # Create and apply migration
```

## Architecture

### Key Directories
- `src/app/` — Next.js App Router pages and API routes
- `src/components/dashboard/` — Dashboard UI components (client components)
- `src/components/ui/` — shadcn/ui primitives
- `src/lib/actions/` — Server Actions (auth, applications CRUD)
- `src/lib/` — Shared utilities (prisma client, schemas, auth config)
- `src/generated/prisma/` — Auto-generated Prisma client (do not edit)
- `prisma/schema.prisma` — Database schema

### Data Flow
- **Mutations** use Server Actions (`src/lib/actions/`), not API routes
- **Dashboard** uses server-side initial data fetch + client-side refreshes via Server Actions
- **Auth** is handled by NextAuth v5 with JWT strategy; middleware protects `/dashboard/*` routes
- **Activity logging** is automatic — all application changes create ActivityLog entries

### Database Models
- `User` — auth + Google OAuth tokens for Gmail access
- `Application` — job applications with status enum (APPLYING → OFFER/REJECTED/WITHDRAWN)
- `EmailSuggestion` — LLM-classified email suggestions pending user approval (deduped by Gmail message ID)
- `ActivityLog` — audit trail for all changes (manual and email-derived)

### Important Patterns
- Prisma v7 requires an adapter: `PrismaPg` from `@prisma/adapter-pg`
- Import Prisma types from `@/generated/prisma/client` (not `@/generated/prisma`)
- shadcn/ui v4 uses base-ui primitives — use `render` prop instead of `asChild` for trigger composition
- Zod validation errors use `.issues` not `.errors`
- Select `onValueChange` signature is `(value: string | null, eventDetails) => void`

## Environment Variables

See `.env.example` for required variables: DATABASE_URL, AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET, OPENAI_API_KEY.
