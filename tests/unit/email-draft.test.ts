import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock factories are hoisted above the module body, so the mock fns they
// reference must be created via vi.hoisted (which runs first too).
const {
  createMock,
  findFirstSuggestion,
  findUniqueUser,
  countEventMock,
  createEventMock,
  findFirstEventMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  findFirstSuggestion: vi.fn(),
  findUniqueUser: vi.fn(),
  countEventMock: vi.fn(),
  createEventMock: vi.fn(),
  findFirstEventMock: vi.fn(),
}));

// Capture the args every OpenAI call receives, and return a canned completion.
// This asserts our prompt-construction + response-parsing without ever hitting
// the network. If a real call were attempted, there is no client to make it.
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

// generateEmailDraft reads the suggestion + user from Prisma, and the rate
// limiter reads/writes the RateLimitEvent ledger; mock those so this stays a
// pure, DB-free unit test.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailSuggestion: { findFirst: findFirstSuggestion },
    user: { findUnique: findUniqueUser },
    rateLimitEvent: {
      count: countEventMock,
      create: createEventMock,
      // Read only on the blocked path, to work out when a slot frees up.
      findFirst: findFirstEventMock,
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { generateEmailDraft } from "@/lib/actions/suggestions";

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  mockedAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
  countEventMock.mockResolvedValue(0); // under the limit by default
  createEventMock.mockResolvedValue({});
  findFirstEventMock.mockResolvedValue({ createdAt: new Date() });
  // generateEmailDraft reads the User row twice — once for the Pro gate, once
  // for the signer's name — through the same mock. One object satisfying both
  // selects keeps that an implementation detail. AI replies are Pro, so the
  // caller is entitled here; the gate is covered in tests/auth/pro-boundary.
  findUniqueUser.mockResolvedValue({
    name: "Ethan",
    email: "user-1@test.dev",
    plan: "PRO",
    proUntil: null,
  });
});

describe("generateEmailDraft", () => {
  it("builds a prompt from the suggestion and parses the model's reply into a draft", async () => {
    findFirstSuggestion.mockResolvedValue({
      id: "sug-1",
      emailSubject: "Interview Invitation - Stripe",
      emailSender: "recruiting@stripe.com",
      emailSnippet: "We would like to invite you to interview.",
      suggestedCompany: "Stripe",
      suggestedRole: "Backend Intern",
      suggestedAction: "STATUS_UPDATE",
      suggestedStatus: "INTERVIEW",
    });
    createMock.mockResolvedValue({
      choices: [{ message: { content: "Thank you for the invitation. I am excited to interview." } }],
    });

    const result = await generateEmailDraft("sug-1");

    expect(result).toMatchObject({
      success: true,
      draft: "Thank you for the invitation. I am excited to interview.",
    });

    // Exactly one model call, no network fan-out.
    expect(createMock).toHaveBeenCalledTimes(1);
    const callArg = createMock.mock.calls[0][0];

    // System prompt encodes the product rules (no em dashes, no greeting/sign-off).
    const systemMsg = callArg.messages.find((m: { role: string }) => m.role === "system").content;
    expect(systemMsg).toMatch(/em dash/i);

    // User prompt is constructed from the suggestion fields + the user's name.
    const userMsg = callArg.messages.find((m: { role: string }) => m.role === "user").content;
    expect(userMsg).toContain("Interview Invitation - Stripe");
    expect(userMsg).toContain("Stripe");
    expect(userMsg).toContain("Backend Intern");
    expect(userMsg).toContain("INTERVIEW");
    expect(userMsg).toContain("Ethan");
  });

  it("returns an error and never calls the model when the suggestion does not exist", async () => {
    findFirstSuggestion.mockResolvedValue(null);

    const result = await generateEmailDraft("missing");

    expect(result).toMatchObject({ error: "Suggestion not found" });
    expect(createMock).not.toHaveBeenCalled();
  });
});
