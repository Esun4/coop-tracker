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
import {
  analyzeJobForResume,
  tailorResume,
  compareResumes,
} from "@/lib/actions/resume";
import {
  buildAnalyzePrompt,
  buildTailorPrompt,
  buildComparePrompt,
  ANALYZE_SYSTEM_PROMPT,
  TAILOR_SYSTEM_PROMPT,
  type JobAnalysis,
} from "@/lib/resume-prompt";

const mockedAuth = vi.mocked(auth);

const RESUME =
  "Jane Doe — Software Engineering Student. EXPERIENCE: Built a full-stack application tracker in React and Node serving real users. Implemented Gmail API integration for email classification. PROJECTS: Data pipeline in Python for course analytics. SKILLS: TypeScript, React, Node, PostgreSQL, Python.";
const JOB_DESCRIPTION =
  "We are hiring a backend intern to build APIs in TypeScript. Strong Node.js experience required. You will manage data pipelines and collaborate with product teams.";

const ANALYSIS: JobAnalysis = {
  responsibilities: [
    { responsibility: "Build TypeScript APIs", whyItMatters: "Core of the role" },
    { responsibility: "Manage data pipelines", whyItMatters: "Stated deliverable" },
  ],
  keywords: [
    { keyword: "TypeScript", section: "Requirements", count: 2 },
    { keyword: "manage", section: "Responsibilities", count: 3 },
  ],
};

function mockModelJson(payload: unknown) {
  createMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
  countMock.mockResolvedValue(0); // under the limit by default
  createEventMock.mockResolvedValue({});
});

describe("prompt builders", () => {
  it("analyze prompt embeds the job description", () => {
    expect(buildAnalyzePrompt(JOB_DESCRIPTION)).toContain(JOB_DESCRIPTION);
  });

  it("tailor prompt embeds resume, job description, and the step-1 analysis", () => {
    const prompt = buildTailorPrompt(RESUME, JOB_DESCRIPTION, ANALYSIS);
    expect(prompt).toContain(RESUME);
    expect(prompt).toContain(JOB_DESCRIPTION);
    expect(prompt).toContain("Build TypeScript APIs");
    expect(prompt).toContain("manage");
  });

  it("compare prompt embeds both resume versions", () => {
    const prompt = buildComparePrompt("original text", "tailored text");
    expect(prompt).toContain("original text");
    expect(prompt).toContain("tailored text");
  });
});

describe("system prompts", () => {
  it("analyze prompt forbids inventing information beyond the posting", () => {
    expect(ANALYZE_SYSTEM_PROMPT).toMatch(/do not assume or make up/i);
  });

  it("tailor prompt encodes the no-fabrication contract and the flag-don't-guess rule", () => {
    expect(TAILOR_SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(TAILOR_SYSTEM_PROMPT).toMatch(/do not guess numbers/i);
  });
});

describe("analyzeJobForResume", () => {
  it("returns the parsed analysis and spends one rate-limit event", async () => {
    mockModelJson(ANALYSIS);

    const result = await analyzeJobForResume({ jobDescription: JOB_DESCRIPTION });

    expect(result).toMatchObject({ success: true, data: ANALYSIS });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createEventMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a too-short job description and never calls the model", async () => {
    const result = await analyzeJobForResume({ jobDescription: "short" });

    expect(result).toHaveProperty("error");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a rate-limit error and never calls the model when over the limit", async () => {
    countMock.mockResolvedValue(15); // already at the cap

    const result = await analyzeJobForResume({ jobDescription: JOB_DESCRIPTION });

    expect(result).toMatchObject({ error: expect.stringMatching(/limit of 15/i) });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("turns a malformed model reply into a clean error, not a crash", async () => {
    // Valid JSON, wrong shape — the Zod gate must catch it.
    mockModelJson({ nonsense: true });

    const result = await analyzeJobForResume({ jobDescription: JOB_DESCRIPTION });

    expect(result).toMatchObject({ error: expect.stringMatching(/couldn't analyze/i) });
  });
});

describe("tailorResume", () => {
  const TAILORED = {
    tailoredResume:
      "Jane Doe — Software Engineering Student\nEXPERIENCE\n- Built TypeScript APIs in Node for a full-stack application tracker serving real users.",
    quantificationFlags: [
      {
        bullet: "Built a full-stack application tracker",
        suggestions: ["Number of users", "Requests per day"],
      },
    ],
  };

  it("returns the tailored resume with quantification flags", async () => {
    mockModelJson(TAILORED);

    const result = await tailorResume({
      resume: RESUME,
      jobDescription: JOB_DESCRIPTION,
      analysis: ANALYSIS,
    });

    expect(result).toMatchObject({ success: true, data: TAILORED });

    // The user message carries all three inputs from the pipeline.
    const userMsg = createMock.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === "user"
    ).content;
    expect(userMsg).toContain(RESUME);
    expect(userMsg).toContain(JOB_DESCRIPTION);
    expect(userMsg).toContain("Build TypeScript APIs");
  });

  it("refuses to run without a valid step-1 analysis", async () => {
    const result = await tailorResume({
      resume: RESUME,
      jobDescription: JOB_DESCRIPTION,
      analysis: { responsibilities: [], keywords: [] } as unknown as JobAnalysis,
    });

    expect(result).toMatchObject({ error: expect.stringMatching(/analysis step first/i) });
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("compareResumes", () => {
  it("returns the parsed change table", async () => {
    const COMPARISON = {
      changes: [
        {
          section: "Experience",
          original: "Built a tracker",
          tailored: "Built TypeScript APIs for a tracker",
          reason: "Foregrounds the TypeScript keyword",
        },
      ],
    };
    mockModelJson(COMPARISON);

    const result = await compareResumes({
      originalResume: RESUME,
      tailoredResume: RESUME + " Tailored variant with enough length.",
    });

    expect(result).toMatchObject({ success: true, data: COMPARISON });
  });
});