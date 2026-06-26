import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock factories are hoisted; the fns they reference must come from vi.hoisted.
const { createMock, countMock, createEventMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  countMock: vi.fn(),
  createEventMock: vi.fn(),
}));

// Capture OpenAI call args and return a canned completion — never hits the net.
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

// The rate-limit helper reads/writes RateLimitEvent via Prisma; mock those so
// this stays a pure, DB-free unit test.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitEvent: { count: countMock, create: createEventMock },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { generateCoverLetter } from "@/lib/actions/cover-letter";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/cover-letter-prompt";

const mockedAuth = vi.mocked(auth);

const BASE_LETTER =
  "Dear Hiring Manager, I am a second-year software engineering student with experience building full-stack web apps in React and Node. I am excited to apply.";
const JOB_DESCRIPTION =
  "We are hiring a backend intern to build APIs in TypeScript. Strong Node.js experience required.";

beforeEach(() => {
  vi.clearAllMocks();
  mockedAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
  countMock.mockResolvedValue(0); // under the limit by default
  createEventMock.mockResolvedValue({});
});

describe("buildUserPrompt", () => {
  it("embeds both the base letter and the job description", () => {
    const prompt = buildUserPrompt(BASE_LETTER, JOB_DESCRIPTION);
    expect(prompt).toContain(BASE_LETTER);
    expect(prompt).toContain(JOB_DESCRIPTION);
  });
});

describe("SYSTEM_PROMPT", () => {
  it("encodes the no-fabrication contract", () => {
    // The single most important guardrail must be present in the prompt.
    expect(SYSTEM_PROMPT).toMatch(/never invent|do not fabricate|not fabricate/i);
  });
});

describe("generateCoverLetter", () => {
  it("builds the prompt and returns the model's tailored letter", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "Dear Hiring Team, tailored letter body." } }],
    });

    const result = await generateCoverLetter({
      baseLetter: BASE_LETTER,
      jobDescription: JOB_DESCRIPTION,
    });

    expect(result).toMatchObject({
      success: true,
      letter: "Dear Hiring Team, tailored letter body.",
    });

    // Exactly one model call, with both inputs in the user message.
    expect(createMock).toHaveBeenCalledTimes(1);
    const callArg = createMock.mock.calls[0][0];
    const systemMsg = callArg.messages.find((m: { role: string }) => m.role === "system").content;
    const userMsg = callArg.messages.find((m: { role: string }) => m.role === "user").content;
    expect(systemMsg).toMatch(/never invent|do not fabricate|not fabricate/i);
    expect(userMsg).toContain(BASE_LETTER);
    expect(userMsg).toContain(JOB_DESCRIPTION);

    // A generation under the limit records exactly one rate-limit event.
    expect(createEventMock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input and never calls the model", async () => {
    const result = await generateCoverLetter({
      baseLetter: "too short",
      jobDescription: JOB_DESCRIPTION,
    });

    expect(result).toHaveProperty("error");
    expect(createMock).not.toHaveBeenCalled();
    expect(createEventMock).not.toHaveBeenCalled();
  });

  it("returns a rate-limit error and never calls the model when over the limit", async () => {
    countMock.mockResolvedValue(10); // already at the cap

    const result = await generateCoverLetter({
      baseLetter: BASE_LETTER,
      jobDescription: JOB_DESCRIPTION,
    });

    expect(result).toMatchObject({ error: expect.stringMatching(/limit of 10/i) });
    expect(createMock).not.toHaveBeenCalled();
    expect(createEventMock).not.toHaveBeenCalled();
  });

  it("surfaces a clean error when the model call fails", async () => {
    createMock.mockRejectedValue(new Error("network blip"));

    const result = await generateCoverLetter({
      baseLetter: BASE_LETTER,
      jobDescription: JOB_DESCRIPTION,
    });

    expect(result).toMatchObject({ error: expect.stringMatching(/couldn't generate/i) });
  });
});
