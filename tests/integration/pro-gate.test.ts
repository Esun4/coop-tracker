import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from "vitest";

/**
 * The paywall boundary.
 *
 * Server Actions are directly invocable — hiding a button in the client proves
 * nothing. These tests call every Pro-gated action as a real FREE user in the
 * test database and assert two things each time: the caller is told to upgrade,
 * and no paid work happened. The second assertion is the one that matters
 * financially: OpenAI and Gmail are mocked at the module boundary, so if a gate
 * were removed, the mock would record a call and the test would fail.
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { openaiCreateMock, sendMock } = vi.hoisted(() => ({
  openaiCreateMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreateMock } };
  },
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials = vi.fn();
        on() {}
      },
    },
    gmail: () => ({ users: { messages: { send: sendMock } } }),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import {
  resetDb,
  createTestUser,
  createProTestUser,
  createTestSuggestion,
} from "../helpers/db";
import { generateEmailDraft, sendEmailReply } from "@/lib/actions/suggestions";
import {
  generateCoverLetter,
  condenseCoverLetter,
} from "@/lib/actions/cover-letter";
import {
  analyzeJobForResume,
  tailorResume,
  refineResume,
  compareResumes,
} from "@/lib/actions/resume";
import { updatePreferences } from "@/lib/actions/preferences";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

// Long enough to clear the Zod minimums in schemas.ts. The resume actions
// validate before reaching the gate — validation is local and costs nothing —
// so short fixtures would fail on length and never prove anything about the
// paywall.
const LETTER =
  "Dear Hiring Manager, I am a software engineering student with experience building full-stack applications in React and Node. I would be glad to contribute.";
const JOB =
  "Backend intern building TypeScript APIs. Strong Node.js experience required. You will design endpoints, manage data pipelines, write tests, and collaborate with product teams on a payments platform used by thousands of merchants every day.";
const RESUME =
  "Jane Doe — Software Engineering Student. EXPERIENCE: Built a full-stack application tracker in React and Node serving real users. Implemented a Gmail integration that classifies incoming email. PROJECTS: A data pipeline in Python for course analytics. SKILLS: TypeScript, React, Node, PostgreSQL, Python.";
const ANALYSIS = {
  responsibilities: [{ responsibility: "Build APIs", whyItMatters: "Core" }],
  keywords: [{ keyword: "TypeScript", section: "Requirements", count: 2 }],
};

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

// Saved once, restored after every test: blindly deleting the variable would
// leak this file's setup into whatever the developer actually has configured.
const ORIGINAL_PRO_USER_EMAILS = process.env.PRO_USER_EMAILS;

function restoreProUserEmails() {
  if (ORIGINAL_PRO_USER_EMAILS === undefined) {
    delete process.env.PRO_USER_EMAILS;
  } else {
    process.env.PRO_USER_EMAILS = ORIGINAL_PRO_USER_EMAILS;
  }
}

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  // Start each test with nobody comped, whatever the environment says.
  delete process.env.PRO_USER_EMAILS;
});

afterEach(restoreProUserEmails);

/** Every Pro-gated action, as a thunk over a user id + a seeded suggestion. */
const GATED_ACTIONS: {
  name: string;
  run: (suggestionId: string) => Promise<unknown>;
}[] = [
  { name: "generateEmailDraft", run: (id) => generateEmailDraft(id) },
  { name: "sendEmailReply", run: (id) => sendEmailReply(id, "Happy to chat.") },
  {
    name: "generateCoverLetter",
    run: () => generateCoverLetter({ baseLetter: LETTER, jobDescription: JOB }),
  },
  {
    name: "condenseCoverLetter",
    run: () => condenseCoverLetter({ letter: LETTER, targetWords: 200 }),
  },
  {
    name: "analyzeJobForResume",
    run: () => analyzeJobForResume({ jobDescription: JOB }),
  },
  {
    name: "tailorResume",
    run: () =>
      tailorResume({
        resume: RESUME,
        jobDescription: JOB,
        format: "text",
        analysis: ANALYSIS,
      }),
  },
  {
    name: "refineResume",
    run: () =>
      refineResume({
        resume: RESUME,
        instruction: "Shorten the first bullet.",
        jobDescription: JOB,
        format: "text",
      }),
  },
  {
    name: "compareResumes",
    run: () =>
      compareResumes({
        originalResume: RESUME,
        tailoredResume: RESUME,
        format: "text",
      }),
  },
];

describe("Pro gate — a free account is refused before any paid work", () => {
  for (const { name, run } of GATED_ACTIONS) {
    it(`${name} refuses a free account and never calls OpenAI or Gmail`, async () => {
      const user = await createTestUser({
        googleAccessToken: encrypt("ya29.token"),
      });
      actAs(user.id);
      const suggestion = await createTestSuggestion(user.id);

      const result = await run(suggestion.id);

      expect(result).toMatchObject({ proRequired: true });
      expect(openaiCreateMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });
  }

  it("does not spend a rate-limit slot on a refused call", async () => {
    // The gate runs ahead of the limiter, so bouncing off the paywall must not
    // eat the quota the user would get if they upgraded a minute later.
    const user = await createTestUser();
    actAs(user.id);

    await generateCoverLetter({ baseLetter: LETTER, jobDescription: JOB });

    const spent = await prisma.rateLimitEvent.count({ where: { userId: user.id } });
    expect(spent).toBe(0);
  });

  it("does not mark a suggestion as replied when the reply is refused", async () => {
    const user = await createTestUser({
      googleAccessToken: encrypt("ya29.token"),
    });
    actAs(user.id);
    const suggestion = await createTestSuggestion(user.id);

    await sendEmailReply(suggestion.id, "Happy to chat.");

    const after = await prisma.emailSuggestion.findUniqueOrThrow({
      where: { id: suggestion.id },
    });
    expect(after.replySentAt).toBeNull();
  });
});

describe("Pro gate — an entitled account passes through", () => {
  it("lets a Pro account reach the model", async () => {
    const user = await createProTestUser();
    actAs(user.id);
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: "A tailored letter." } }],
    });

    const result = await generateCoverLetter({
      baseLetter: LETTER,
      jobDescription: JOB,
    });

    expect(result).toMatchObject({ success: true });
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
  });

  it("locks an account whose Pro period has closed", async () => {
    const user = await createTestUser({
      plan: "PRO",
      proUntil: new Date(Date.now() - 60_000),
    });
    actAs(user.id);

    const result = await generateCoverLetter({
      baseLetter: LETTER,
      jobDescription: JOB,
    });

    expect(result).toMatchObject({ proRequired: true });
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it("lets an allowlisted email through without a paid plan", async () => {
    const user = await createTestUser({ email: "comped@test.dev" });
    process.env.PRO_USER_EMAILS = "comped@test.dev";
    actAs(user.id);
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: "A tailored letter." } }],
    });

    const result = await generateCoverLetter({
      baseLetter: LETTER,
      jobDescription: JOB,
    });

    expect(result).toMatchObject({ success: true });
    // Reached the model, not just a success-shaped early return.
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
  });
});

describe("Pro gate — scheduled scanning", () => {
  it("refuses a scheduled frequency for a free account and stores nothing", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const result = await updatePreferences({ scanFrequency: "every6h" });

    expect(result).toMatchObject({ proRequired: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.scanFrequency).toBe("manual");
  });

  it("still lets a free account change ungated preferences", async () => {
    // The gate must be scoped to scanFrequency, not to the whole action.
    const user = await createTestUser();
    actAs(user.id);

    const result = await updatePreferences({ theme: "dark", palette: "ink" });

    expect(result).toMatchObject({ success: true });
    // Persisted, not merely reported — a gate that short-circuits the write
    // while still answering `success` would pass the assertion above.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.theme).toBe("dark");
    expect(after.palette).toBe("ink");
  });
});
