# CLAUDE.md

## Project Overview

AppTracker is a full-stack co-op/internship application tracker for students. It tracks job applications with status workflows and includes Gmail integration for email-based application detection via LLM classification (user-confirmed, not automatic).

## Tech Stack

- **Framework:** Next.js 14+ (App Router) with TypeScript
- **Database:** PostgreSQL (Supabase) via Prisma v7 ORM + `PrismaPg` adapter
- **Auth:** NextAuth v5 — Google OAuth + Credentials, JWT strategy
- **UI:** Tailwind CSS + shadcn/ui v4 built on `@base-ui/react` (NOT radix-ui)
- **Email:** Gmail API via `googleapis` SDK
- **LLM:** OpenAI GPT-4o-mini for email classification
- **Deployment:** Vercel

## Key Directories

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js App Router — pages, layouts, `api/auth/` route |
| `src/app/dashboard/` | Dashboard page (server component) + protected layout |
| `src/app/auth/` | Sign-in / sign-up pages |
| `src/components/dashboard/` | Client components for dashboard UI |
| `src/components/ui/` | shadcn/ui primitives (base-ui backed) |
| `src/lib/actions/` | Server Actions — all mutations live here |
| `src/lib/` | Prisma client, NextAuth config, Zod schemas, utilities |
| `src/generated/prisma/` | Auto-generated Prisma client — do not edit |
| `prisma/` | `schema.prisma` + migrations |

## Essential Commands

```bash
npm run dev                              # Dev server (Turbopack)
npm run build                            # Production build
npx tsc --noEmit                         # Type check
npx prisma generate                      # Regenerate client after schema changes
npx prisma migrate dev --name <name>     # Create and apply migration
```

## Database Migrations (REQUIRED workflow)

**Use ONE workflow for all schema changes — never mix them, or the migration history drifts from the live DB.**

1. Edit `prisma/schema.prisma`.
2. `npx prisma migrate dev --name <change>` — generates a migration file *and* applies it.
3. Commit the new `prisma/migrations/<...>` folder **together with** the schema change.

- **Never** use `prisma db push` or hand-written SQL against the real (Supabase) DB — that changes the DB without a migration file and causes drift.
- **Some DDL can only live in a migration.** `schema.prisma` can't express CHECK constraints, partial indexes, or triggers, so those are hand-written SQL inside a migration file (see `20260730010000_rate_limit_one_subject`). That's the sanctioned path — it still produces a migration file, so there's no drift. When you add one, document it in a comment on the model it constrains, since the schema alone won't reveal it.
- `scripts/setup-test-db.mjs` provisions the test DB by **replaying migrations** (`migrate deploy` onto a freshly dropped schema), not `db push`. `db push` derives DDL from `schema.prisma` and would silently omit any raw-SQL constraint, leaving tests running against a laxer database than production.
- **Shadow database (required):** `migrate dev` needs a throwaway DB to validate migrations, and the Supabase pooler blocks auto-creating one. It's wired via `SHADOW_DATABASE_URL` in `.env` → `datasource.shadowDatabaseUrl` in `prisma.config.ts`. It **must be a separate, empty, local DB — never one with real data** (Prisma wipes it on every run). Start it with:
  ```bash
  docker run -d --name apptracker-shadow-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=shadow -e POSTGRES_DB=prisma_shadow -p 127.0.0.1:5434:5432 postgres:16-alpine
  ```
- If `migrate dev` ever proposes a **reset/wipe** of the real DB, **stop** — that means drift; reconcile by baselining (squash to a fresh `migrations/0_init` from the current schema and `prisma migrate resolve --applied 0_init`), do not let it reset.
- Production/CI applies migrations with `prisma migrate deploy` (replays files, never resets).

## Critical Non-Obvious Facts

- Prisma v7 requires `PrismaPg` adapter — see `src/lib/prisma.ts`
- Import Prisma types from `@/generated/prisma/client` (not `@/generated/prisma`)
- shadcn/ui v4 uses `render` prop for trigger composition, not `asChild`
- Zod v4 validation errors are at `.issues`, not `.errors`
- `Select.onValueChange` signature: `(value: string | null, eventDetails) => void`
- No API routes for data — everything goes through Server Actions

## Database Models

`User` · `Application` · `EmailSuggestion` · `ActivityLog` · NextAuth tables (`Account`, `Session`, `VerificationToken`)

See `prisma/schema.prisma` for full schema. Application statuses: `APPLIED → OA → INTERVIEW → FINAL_ROUND → OFFER/REJECTED/WITHDRAWN`.

## Environment Variables

See `.env.example` — required: `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`.

Optional: `PRO_USER_EMAILS` — comma-separated emails granted Pro regardless of
their `plan` column (comped accounts, and how you unlock your own account while
Stripe checkout doesn't exist yet). Matched case-insensitively.

## Pro entitlements (paywall)

Pro status lives on `User`: `plan` (`FREE`/`PRO`), `proUntil` (null = perpetual,
a date = access ends then), plus `stripeCustomerId` / `stripeSubscriptionId` for
the billing integration that isn't built yet.

- `src/lib/entitlements.ts` — **server only** (imports Prisma). `isPro(user)` is
  the pure rule; `requirePro(userId)` is the gate every Pro action calls.
- `src/lib/pro.ts` — client-safe feature names and copy. Import this from client
  components, never `entitlements.ts`.
- Entitlement is read from the **database**, never the JWT — a token snapshot
  would keep a new subscriber locked out until their next refresh.

**Rules when adding a Pro feature:**

1. Gate the Server Action with `requirePro` *before* any OpenAI/Gmail call and
   before the rate limiter, and return the failure object rather than throwing —
   the client keys off `proRequired` to open the upgrade dialog.
2. Client-side locks are cosmetic. A Server Action is directly invocable, so the
   server gate is the only real boundary.
3. Add the free-tier case to `tests/integration/pro-gate.test.ts`, asserting both
   the refusal and that the mocked provider was never called.

Currently gated: AI email replies, scheduled scan frequencies, resume + cover
letter tailoring.

## Rate limiting

Two budgets per feature, both backed by the `RateLimitEvent` ledger: **per user**
(the cost control — survives IP changes) and **per IP** (the abuse backstop, and
the only option on signed-out endpoints). A ledger row carries exactly one
subject: `userId` *or* `ipHash`, never both.

- `src/lib/rate-limit.ts` — **server only**. `RATE_LIMITS` holds every budget in
  the app; retune caps there, never at a call site. `enforceRateLimit(feature,
  userId?)` is the single entry point — returns `null` to proceed, or a
  `{ error, retryAt }` object to return straight to the client.
- `src/lib/client-ip.ts` — **server only**. Header trust order, IPv6 → /64
  bucketing, and HMAC-with-`AUTH_SECRET`. Raw IPs are never stored.
- `src/lib/rate-limit-message.ts` — client-safe. `rateLimitMessage(error,
  retryAt)` appends "You can try again at 3:42 PM" in the *viewer's* timezone.

**Rules when adding a rate-limited feature:**

1. Add the budget to `RATE_LIMITS` and call `enforceRateLimit` *after* auth and
   the Pro gate but *before* any OpenAI/Gmail call — and after any cheap early
   return (a cooldown message, a missing token), so the app's own guard rails
   never spend a user's quota.
2. Server Actions return `retryAt` as an ISO string; format it in the browser.
   Never format a time server-side — Vercel runs in UTC.
3. The per-user check runs first by design. Both checks record, so checking IP
   first would let an over-quota user drain their whole network's budget.

Currently limited: cover letter, resume tailoring, email drafts, email sends,
Gmail sync, sign-up, sign-in.

## Adding New Features or Fixing Bugs
**IMPORTANT**: When you work on a new feature or bug, ask me to create a git branch fo you first. Then I will shift to that branch and then you work on changes on that branch for the remainder of the session.


## Testing (regression safety net)

This repo has a focused Vitest suite under `tests/`. It is a regression safety net, not exhaustive coverage.

```bash
npm run test:db:setup   # one-time per machine/session: starts a disposable Postgres container + applies schema
npm test                # run the full suite (vitest run)
npm run test:watch      # watch mode
```

**Layout:**
- `tests/integration/` — core Application data operations run against a real throwaway Postgres (auth + `next/cache` mocked, Prisma real).
- `tests/unit/` — pure logic with no DB/network (Zod schema, email-sender parsing, crypto, email-draft prompt construction with OpenAI mocked).
- `tests/auth/` — protected server actions reject unauthenticated requests.

**Test database:** connection details are read only from `.env.test` (gitignored), generated by `scripts/setup-test-db.mjs`, which auto-selects a free port. Never point the suite at the real database — `tests/setup.ts` refuses to run unless `DATABASE_URL` names a test DB. Never hardcode credentials in test files.

**Rules for future agents (REQUIRED):**
1. After implementing any feature or bug fix, run `npm test` and **fix all failures before considering the work complete.** If the test DB isn't up, run `npm run test:db:setup` first.
2. **Do NOT weaken, skip, or delete existing test assertions to make a suite pass**, unless the test itself is provably wrong (the asserted behavior is genuinely incorrect). In that case, fix the assertion to match the correct behavior and explain why in the change — do not just loosen it to go green.
3. Mocking rule: tests must **never** make real calls to OpenAI or the Gmail API. Mock these at the module boundary (`openai`, `googleapis`). Keep tests fast and deterministic with no external network.
4. When you add a feature with new deterministic logic or a new mutation, add a matching high-value test in the appropriate tier.

## Multi-agent worktree protocol

This applies when I tell you I built changes using multiple agents or multiple git worktrees and want them combined. The normal case is several agents each building a different feature on the same project in parallel, in separate worktrees. Do not treat this as ordinary single-branch work.

Worktree facts to keep in mind: each worktree is a separate folder with exactly one branch permanently checked out, and the same branch cannot be checked out in two worktrees at once. All worktrees share one history, so committed work is visible across them without pushing or pulling. Gitignored files such as .env, .env.test, and node_modules do not exist in a freshly created worktree and must be installed or copied before tests can run there.

Merge sequence:

1. Discover state. Run git worktree list and report every worktree, its path, and its branch. Identify the integration branch (normally main) and every feature branch to be merged. Run git status in each and report which have uncommitted work. Show me this summary and your planned merge order before changing anything.
2. Commit everything. Any uncommitted change exists only in its folder and will merge nowhere. For each worktree with uncommitted work, show me the diff summary and the intended commit message, commit it, and confirm. Never stash or discard silently.
3. Merge feature branches one at a time, not all at once. Switch to the integration branch and merge the first feature branch in. After each individual merge, run npm test. Merging one at a time and testing after each is deliberate: it makes any regression or conflict attributable to a specific feature rather than to a tangled combined merge.
4. Handle conflicts deliberately. Because parallel features may touch shared files (the Prisma schema, shared components, shared route or config files, package.json, lockfiles), conflicts are more likely here than in a feature-plus-tests merge. For conflicts limited to package.json or lockfiles, keep both sides' dependencies and scripts. For a conflict in the Prisma schema or any application code, stop and show it to me rather than guessing, since the correct resolution depends on intent I may need to supply. After resolving, re-run npm test before moving to the next feature branch.
5. Validate the combined result. After all feature branches are merged, ensure the integration branch has node_modules installed and any required .env / .env.test present, then run the full suite once more as the final confirmation. A green suite against the fully merged code is the signal the combination is correct.
6. Clean up, but ask first. Propose removing the now-merged worktrees and deleting the merged branches (git worktree remove, git branch -d) and wait for my confirmation before running them.

Core rule: do not report a merge as successful until the test suite has been run green against the final combined code. Combining branches without running the suite against the result confirms nothing.

## Additional Documentation

Check these when working in the relevant area:

| File | When to read |
|------|-------------|
| `.claude/docs/architectural_patterns.md` | Before adding mutations, new components, or modifying data flow |


## Learning-first coding workflow

When helping me build features, optimize for learning software engineering fundamentals, architecture, and design decisions — not just generating code quickly.

Default workflow:
- Start by clarifying the feature requirements, user flow, data flow, and frontend/backend boundaries.
- Propose a clean file/folder structure before writing implementation code.
- In TypeScript projects, define types/interfaces early so the data model and contracts are clear.
- Implement one file or small section at a time instead of generating the whole feature at once.
- Before writing each file, briefly explain:
  - the file's responsibility
  - what it should not handle
  - its inputs, outputs, and dependencies
- After writing each file, explain the key design choices, tradeoffs, and edge cases.
- Prefer clear, beginner-readable code over clever abstractions.
- Point out where validation, error handling, security, or production concerns matter.
- Ask me to reason through the next step when useful, especially for architecture decisions.

Preferred feature order:
1. Requirements and user flow
2. Data model and types/interfaces
3. File/folder structure
4. Utilities/helpers
5. Hooks or business logic
6. UI components
7. Integration into the app
8. Validation, error handling, and testing

Goal: help me understand how the system is designed, how files depend on each other, and why each decision is made.