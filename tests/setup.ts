import { config } from "dotenv";
import { resolve } from "node:path";

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
