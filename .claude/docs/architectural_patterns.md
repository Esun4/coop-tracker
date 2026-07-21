# Architectural Patterns

Patterns that appear across multiple files in this codebase.

---

## 1. Server Action Structure

All mutations follow a fixed four-step sequence. Deviating breaks auth, validation, or cache consistency.

**Files:** `src/lib/actions/applications.ts`, `src/lib/actions/auth.ts`

```
1. Auth check   → const userId = await getAuthUserId()  (throws redirect on failure)
2. Validate     → schema.safeParse(data); return { error } on failure
3. Mutate       → prisma operation, scoped to userId
4. Invalidate   → revalidatePath("/dashboard")
```

Return shape is always `{ success: true, data? }` or `{ error: string }` — never throw.

---

## 2. Activity Logging on Every Mutation

Every application create/update/archive/delete writes an `ActivityLog` row. Logging is not optional — it powers the activity feed and audit trail.

**Files:** `src/lib/actions/applications.ts` (all mutation functions)

- `action` field: `"created"` | `"updated"` | `"archived"` | `"deleted"`
- `details` field: JSON capturing before/after values for updates
- `source` field: `"manual"` | `"email_suggestion"`
- Log is created in the same request as the mutation, not deferred

---

## 3. Server Component → Client Component Data Flow

The dashboard uses a two-layer pattern: server component fetches initial data, client component owns interactive state.

**Files:** `src/app/dashboard/page.tsx`, `src/components/dashboard/dashboard-client.tsx`

```
Server component (page.tsx)
  └─ Parallel fetch via Promise.all([...Server Actions...])
  └─ Passes { applications, stats, activities, sources } as `initial` prop

Client component (dashboard-client.tsx)
  └─ useState(initial) — hydrates from SSR data
  └─ useTransition() — tracks pending state during refetches
  └─ refresh() — re-calls the same Server Actions with current filter state
  └─ useEffect([filters, sort]) → refresh()
```

This avoids full-page navigation on filter changes while retaining SSR for first load.

---

## 4. Filter State + Callback Propagation

Filters live in `dashboard-client.tsx` and are passed down as individual onChange callbacks. Sub-components do not own filter state.

**Files:** `src/components/dashboard/dashboard-client.tsx`, `filters-toolbar.tsx`, `application-table.tsx`

- Each filter is a separate `useState` (search, status, source, showArchived, sort)
- All filter state feeds into a single `refresh()` via `useEffect`
- Undefined means "no filter" — Server Actions treat undefined as "show all"

---

## 5. Zod Validation — Two Layers

Schemas are defined once in `src/lib/schemas.ts` and validated at the Server Action boundary.

**Files:** `src/lib/schemas.ts`, `src/lib/actions/applications.ts`, `src/lib/actions/auth.ts`

```typescript
const parsed = applicationSchema.safeParse(data);
if (!parsed.success) return { error: parsed.error.issues[0].message };
```

- `.issues` not `.errors` (Zod v4 API)
- Only the first issue message is returned to the client
- Client components surface errors via `toast.error(result.error)`

---

## 6. base-ui Trigger Composition

shadcn/ui v4 is built on `@base-ui/react`, not radix-ui. The composition API differs.

**Files:** `src/components/ui/select.tsx`, `src/components/ui/dropdown-menu.tsx`, `src/components/dashboard/application-table.tsx`

- Use `render` prop instead of `asChild`:
  ```tsx
  // Wrong (radix pattern)
  <DropdownMenuTrigger asChild><Button /></DropdownMenuTrigger>

  // Correct (base-ui pattern)
  <DropdownMenuTrigger render={<Button />} />
  ```
- `Select.onValueChange`: `(value: string | null, eventDetails) => void`

---

## 7. Auth Check in Layouts

Protected layouts call `auth()` and redirect synchronously — no client-side guards.

**Files:** `src/app/dashboard/layout.tsx`, `middleware.ts`

- Layout: `const session = await auth(); if (!session) redirect("/auth/signin")`
- Middleware (`middleware.ts`): handles `/dashboard/*` and `/auth/*` redirects at the edge, before layout runs
- Both layers are required — middleware is fast-path, layout is fallback

---

## 8. Prisma Query Patterns

Consistent patterns prevent N+1 queries and over-fetching.

**Files:** `src/lib/actions/applications.ts`

- Always scope to `userId`: `where: { id, userId }` — never query by id alone
- Use `include` for relations needed in one shot, `select` to limit columns
- `distinct: ["source"]` for unique-value dropdowns
- Schema indexes: `@@index([userId])`, `@@index([userId, status])`, `@@index([userId, archived])`

---

## 9. Validate Parsed File / External Inputs Before Use

Anything read from a file or `JSON.parse` is untrusted-shaped, even in dev-only scripts. Validate the **container** and each entry's **types** before iterating or reading fields — don't assume `parse` returned the shape you expect.

**Files:** `scripts/eval-classifier.mjs`

- Guard the container first: after `JSON.parse`, confirm `Array.isArray(x) && x.length > 0` before `.entries()`/`.map()` — a JSON object or empty array otherwise crashes outside the validation path or yields `NaN%` metrics.
- Validate each entry's field **types**, not just truthiness: `typeof e === "object" && !Array.isArray(e)`, required strings via a `isNonEmptyString` helper, optional fields as `x == null || typeof x === "string"`, nested objects (`e.label`) checked before dereferencing.
- Fail loudly with a per-entry index and the expected shape, then `process.exit(1)`. A numeric `body` or `null` entry must produce a clear error, never a silent `NaN`.
