import { prisma } from "@/lib/prisma";

/**
 * Truncate every application-domain table between tests so each test starts
 * from a known-empty state. RESTART IDENTITY + CASCADE clears dependents too.
 */
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "ActivityLog", "EmailSuggestion", "Application", "Account", "Session", "User" RESTART IDENTITY CASCADE`
  );
}

let userSeq = 0;

/** Create a real user row in the test DB and return its id. */
export async function createTestUser(overrides: { email?: string; name?: string } = {}) {
  userSeq += 1;
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `user${userSeq}-${Date.now()}@test.dev`,
      name: overrides.name ?? `Test User ${userSeq}`,
    },
  });
  return user;
}
