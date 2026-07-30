import { config } from "dotenv";
import { resolve } from "node:path";
import { vi } from "vitest";

// Load .env.test into process.env BEFORE any test module (and therefore
// src/lib/prisma.ts) is imported. Connection details come only from env —
// nothing is hardcoded in the tests themselves.
config({ path: resolve(process.cwd(), ".env.test") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Run `node scripts/setup-test-db.mjs` to provision the test database first."
  );
}

// Guard against ever pointing the suite at a non-test database. The truncation
// helper wipes tables, so refuse to run unless the DB name looks like a test DB.
if (!/test/i.test(process.env.DATABASE_URL)) {
  throw new Error(
    `Refusing to run: DATABASE_URL does not look like a test database (expected the name to contain "test"). Got host/db: ${process.env.DATABASE_URL.replace(/:[^:@/]*@/, ":***@")}`
  );
}

// The IP rate limiter HMACs addresses with AUTH_SECRET. Tests only need it to
// exist and be stable within a run — never the real one.
process.env.AUTH_SECRET ??= "test-auth-secret";

// Tests call Server Actions as plain functions, so there is no Next request
// scope for `headers()` to read and the real implementation throws. Mock the
// module boundary, as the suite already does for `openai` and `googleapis`,
// rather than teaching the production helper to shrug off a missing request
// store — that leniency would hide a genuine misconfiguration in prod.
//
// Every test therefore shares one client IP. That is deliberate: it means the
// per-IP budget is genuinely exercised rather than bypassed. Tests that run an
// action more times than its IP cap must reset the ledger between cases.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.1" }),
}));
