# Test Audit Findings

Security/functional test audit of the server-action layer (2026-07-06, branch
`test-security-audit`). Scope was **tests only** — no application source,
schema, or migrations were modified. Where a test exposed a real bug, the app
code was left untouched and the bug is recorded here.

**Status (2026-07-06 follow-up):** BUGs 2–6 have since been **fixed** in app
code and their tests converted from `it.fails` to normal passing tests. BUG-1
(missing max-length bounds) remains open and is still pinned by an `it.fails`
test. See the per-bug "FIXED"/"OPEN" tags below.

---

## Coverage map (server actions & data-layer functions touching user data)

Legend — Tested?: ✅ already covered before this audit · 🆕 added in this audit · ➖ n/a

| Function | File | Security risk | Cross-user test | Unauth test | Validation/other |
|---|---|---|---|---|---|
| `getApplications` | applications.ts | reads user rows; search/sort injection surface | ✅/🆕 | ✅ | 🆕 (search + sortBy) |
| `getApplication` | applications.ts | reads one row incl. notes/activity | 🆕 | 🆕 | ➖ |
| `createApplication` | applications.ts | writes row + audit log | ✅ (scoping) | ✅ | ✅ Zod |
| `updateApplication` | applications.ts | IDOR update | 🆕 | 🆕 | 🆕 Zod + non-object |
| `updateApplicationStatus` | applications.ts | IDOR status change | ✅ | 🆕 | ✅ enum |
| `archiveApplication` | applications.ts | IDOR archive | 🆕 | 🆕 | ➖ |
| `deleteApplication` | applications.ts | IDOR delete | 🆕 | 🆕 | ✅ (delete) |
| `importApplications` | applications.ts | bulk write, row-cap, **Zod bypass** | 🆕 (scoping) | 🆕 | 🆕 (cap ✅ / **BUG-2,3,4**) |
| `getStats` | applications.ts | raw SQL aggregate over user rows | 🆕 | 🆕 | ➖ |
| `getRecentActivity` | applications.ts | reads audit log | 🆕 | 🆕 | ➖ |
| `getDistinctSources` | applications.ts | reads user rows | 🆕 | 🆕 | ➖ |
| `getUnresolvedSuggestions` | suggestions.ts | reads suggestions | 🆕 | 🆕 | ➖ |
| `dismissSuggestion` | suggestions.ts | IDOR resolve | 🆕 | 🆕 | ✅ flow |
| `acceptNewApplication` | suggestions.ts | IDOR + write + audit | 🆕 | 🆕 | 🆕 Zod |
| `acceptAllSuggestions` | suggestions.ts | bulk write; **auto-match scoping** | 🆕 | 🆕 | 🆕 flow |
| `acceptStatusUpdate` | suggestions.ts | double IDOR (sug + app); **status not validated** | 🆕 (both) | 🆕 | 🆕 (**BUG-5**) |
| `undoEmailSuggestion` | suggestions.ts | IDOR revert/delete | 🆕 | 🆕 | 🆕 flow |
| `generateEmailDraft` | suggestions.ts | IDOR + OpenAI call | 🆕 | ✅ (existing) | ✅ |
| `sendEmailReply` | suggestions.ts | IDOR + Gmail send + **token leak** | 🆕 | 🆕 | 🆕 token-safety + flow |
| `syncGmailEmails` | gmail.ts | Gmail read + OpenAI + **token leak** | ➖ (self-scoped) | 🆕 | 🆕 sync + token-safety + cooldown |
| `signUp` | auth.ts | account creation; password hashing | ➖ | ➖ (public) | 🆕 (hash/validation/dup) |
| `generateCoverLetter` / `condenseCoverLetter` | cover-letter.ts | OpenAI cost; input bounds | ➖ | ✅ | ✅ + 🆕 schema bounds |
| resume pipeline (`analyze/tailor/refine/compare`) | resume.ts | OpenAI cost; input bounds | ➖ | ✅ | ✅ + 🆕 schema bounds |
| `checkRateLimit` | rate-limit.ts | per-user quota | ✅ | ➖ | ✅ |
| `encrypt/decrypt/tryDecrypt` | crypto.ts | token at rest | ➖ | ➖ | ✅ |

Cross-user isolation and unauthenticated-access coverage now exists for every
mutating and user-scoped read action. `syncGmailEmails` has no separate
cross-user test because it only ever operates on `getAuthUserId()`'s own
mailbox — there is no id parameter an attacker could substitute.

---

## Bugs found (app code NOT modified)

### BUG-1 — `applicationSchema` has no maximum-length bounds — **Low/Medium** — 🔴 OPEN
`src/lib/schemas.ts` — `company`, `roleTitle`, `location`, `notes`,
`contactInfo` are unbounded strings (only `company`/`roleTitle` have `.min(1)`).
Every LLM schema (cover letter, resume) caps input length to bound cost/DoS,
but the core application object does not. A single `createApplication` /
`updateApplication` / `acceptNewApplication` call can persist multi-megabyte
fields, bloating rows and every downstream read/render.

- **Repro:** `tests/unit/schemas.test.ts` → "rejects an absurdly oversized field" (`it.fails`). `applicationSchema.safeParse({ company:"Stripe", roleTitle:"SWE", notes:"x".repeat(1_000_000) })` returns `success: true`.
- **Fix direction:** add `.max(...)` to the string fields (e.g. 200 for company/role/location, a few KB for notes/contactInfo), mirroring the LLM schemas.

### BUG-2 — `importApplications` bypasses `applicationSchema` entirely — **Medium** — ✅ FIXED
`src/lib/actions/applications.ts:252`. CSV import rows are written straight to
Prisma with no Zod validation. Every other create path validates; import does
not. An empty `company`/`roleTitle` (rejected everywhere else) is persisted.

- **Repro:** `tests/integration/input-validation.test.ts` → "rejects rows with an empty company" (`it.fails`). `importApplications([{ company:"", roleTitle:"" }])` returns `{ success: true, count: 1 }` and creates the row.
- **Fix applied:** every row is now validated with `applicationSchema` before the `$transaction`; the first invalid row fails the whole import with a `Row N: <message>` error and nothing is written.

### BUG-3 — `importApplications` throws an unhandled Prisma error on an invalid status — **Medium** — ✅ FIXED
`src/lib/actions/applications.ts:279`. `row.status` is cast
`as ApplicationStatus` with no validation. A bogus status makes the whole
`$transaction` throw `PrismaClientValidationError` — an unhandled 500 rather
than a clean `{ error }`, and the entire import is lost.

- **Repro:** `tests/integration/input-validation.test.ts` → "returns a clean error for an invalid status value" (`it.fails`). Confirmed thrown: `PrismaClientValidationError`.
- **Fix applied:** covered by the same per-row `applicationSchema` validation (its `status` field is a Zod enum defaulting to `APPLIED`), so an invalid status is now a clean `{ success: false, error }`.

### BUG-4 — `importApplications` throws on an unparseable `applicationDate` — **Medium** — ✅ FIXED
`src/lib/actions/applications.ts:281`. `new Date(row.applicationDate)` on an
unparseable string yields `Invalid Date`, which Prisma rejects and throws —
same unhandled-500 / whole-import-lost failure mode as BUG-3.

- **Repro:** `tests/integration/input-validation.test.ts` → "returns a clean error for an unparseable applicationDate" (`it.fails`). Confirmed thrown: `PrismaClientValidationError`.
- **Fix applied:** covered by the per-row `applicationSchema` validation (its `applicationDate` field enforces the `YYYY-MM-DD` regex), so an unparseable date is rejected before any write.

### BUG-5 — `acceptStatusUpdate` does not validate the incoming status — **Medium** — ✅ FIXED
`src/lib/actions/suggestions.ts:231`. `newStatus` is cast
`as ApplicationStatus` and written directly. `updateApplicationStatus` runs the
same value through a Zod enum first; this sibling action does not. An invalid
status throws `PrismaClientValidationError` instead of returning `{ error }`.
This is attacker-reachable: Server Actions are directly invocable, and
`newStatus` is a caller-supplied string.

- **Repro:** `tests/integration/input-validation.test.ts` → "returns a clean error for an invalid status" (`it.fails`). Confirmed thrown: `PrismaClientValidationError`.
- **Fix applied:** `acceptStatusUpdate` now runs `newStatus` through a `z.enum(applicationStatuses)` guard first and returns `{ error: "Invalid status" }` on failure, matching `updateApplicationStatus`.

### BUG-6 — `getApplications` passes `sortBy` straight into Prisma `orderBy` — **Medium** — ✅ FIXED
`src/lib/actions/applications.ts:55-58`. `params.sortBy` (caller-controlled) is
used as an unvalidated object key in `orderBy`. Any value that is not a real
`Application` column throws `PrismaClientValidationError` — an unhandled error
from attacker-controllable input (a denial-of-service / info-shaping surface;
also note `status`/`source`/`search` are all validated or bounded, but `sortBy`
and `sortOrder` are not).

- **Repro:** `tests/integration/input-validation.test.ts` → "survives a hostile sortBy value" (`it.fails`). `getApplications({ sortBy: "hashedPassword" })` throws `PrismaClientValidationError`.
- **Fix applied:** `sortBy` is now checked against an allowlist of sortable columns (`updatedAt`, `createdAt`, `company`, `roleTitle`, `status`, `applicationDate`) and `sortOrder` is coerced to `asc`/`desc`, falling back to `updatedAt desc` for anything else.

---

## Things checked that were **correct** (no bug)

- **Cross-user isolation** holds for every id-taking action — each does a
  `findFirst({ where: { id, userId } })` ownership check and returns
  `"... not found"` rather than acting. `acceptAllSuggestions` auto-match only
  searches the caller's own applications. Proven in
  `tests/integration/cross-user-isolation.test.ts`.
- **Gmail tokens never leak.** Decrypted access/refresh tokens are passed to the
  OAuth client but never appear in any returned error string or in
  `console.log`/`console.error` output, including on 401/403 re-auth paths.
  Proven in `tests/integration/gmail-flows.test.ts`.
- **SQL/NoSQL injection.** Injection-shaped `search` strings and the raw-SQL
  `getStats` are parameterized by Prisma and treated as literal data.
- **Audit log** rows are written (scoped to the acting user) on every mutation,
  with the correct `source` (`manual` / `csv_import` / `email_suggestion`), and
  correctly *not* written when `updateApplication` changes nothing.
- **Passwords** are stored as bcrypt hashes, never plaintext; `signUp` enforces
  the 12-char minimum and refuses to overwrite an existing account.
