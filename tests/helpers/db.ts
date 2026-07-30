import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Truncate every application-domain table between tests so each test starts
 * from a known-empty state. RESTART IDENTITY + CASCADE clears dependents too.
 */
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "RateLimitEvent", "ActivityLog", "EmailSuggestion", "Application", "Account", "Session", "User" RESTART IDENTITY CASCADE`
  );
}

let userSeq = 0;

/**
 * Create a real user row in the test DB and return its id.
 *
 * Defaults to the FREE plan, matching a real signup. A test that exercises a
 * Pro-only feature has to ask for `plan: "PRO"` explicitly — if the default
 * were PRO, a gate accidentally removed from an action would still pass every
 * test in the suite.
 */
export async function createTestUser(
  overrides: {
    email?: string;
    name?: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
    lastEmailSync?: Date;
    plan?: "FREE" | "PRO";
    proUntil?: Date | null;
  } = {}
) {
  userSeq += 1;
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `user${userSeq}-${Date.now()}@test.dev`,
      name: overrides.name ?? `Test User ${userSeq}`,
      googleAccessToken: overrides.googleAccessToken,
      googleRefreshToken: overrides.googleRefreshToken,
      lastEmailSync: overrides.lastEmailSync,
      plan: overrides.plan ?? "FREE",
      proUntil: overrides.proUntil ?? null,
    },
  });
  return user;
}

/** Shorthand for the common "a paying user does X" setup. */
export async function createProTestUser(
  overrides: Parameters<typeof createTestUser>[0] = {}
) {
  return createTestUser({ ...overrides, plan: "PRO" });
}

/** Insert an application directly (bypassing the server action) for a given owner. */
export async function createTestApplication(
  userId: string,
  overrides: Partial<Prisma.ApplicationUncheckedCreateInput> = {}
) {
  return prisma.application.create({
    data: {
      userId,
      company: "TestCo",
      roleTitle: "SWE Intern",
      status: "APPLIED",
      ...overrides,
    },
  });
}

let suggestionSeq = 0;

/** Insert an email suggestion directly (as Gmail sync would) for a given owner. */
export async function createTestSuggestion(
  userId: string,
  overrides: Partial<Prisma.EmailSuggestionUncheckedCreateInput> = {}
) {
  suggestionSeq += 1;
  return prisma.emailSuggestion.create({
    data: {
      userId,
      emailMessageId: `msg-${suggestionSeq}-${Date.now()}`,
      emailThreadId: `thread-${suggestionSeq}`,
      emailSubject: "Interview Invitation - TestCo",
      emailSender: "recruiting@testco.com",
      emailDate: new Date("2026-06-01T12:00:00Z"),
      emailSnippet: "We'd like to invite you to interview.",
      suggestedAction: "STATUS_UPDATE",
      suggestedStatus: "INTERVIEW",
      suggestedCompany: "TestCo",
      suggestedRole: "SWE Intern",
      confidence: 0.9,
      ...overrides,
    },
  });
}
