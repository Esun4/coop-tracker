import { describe, it, expect } from "vitest";
import {
  applicationSchema,
  coverLetterSchema,
  condenseLetterSchema,
  resumeTailorSchema,
  resumeRefineSchema,
} from "@/lib/schemas";

describe("applicationSchema", () => {
  it("requires company and roleTitle", () => {
    const missingCompany = applicationSchema.safeParse({ company: "", roleTitle: "SWE" });
    expect(missingCompany.success).toBe(false);
    expect(missingCompany.error?.issues[0].message).toBe("Company is required");

    const missingRole = applicationSchema.safeParse({ company: "Stripe", roleTitle: "" });
    expect(missingRole.success).toBe(false);
    expect(missingRole.error?.issues[0].message).toBe("Role title is required");
  });

  it("defaults status to APPLIED when omitted", () => {
    const parsed = applicationSchema.parse({ company: "Stripe", roleTitle: "SWE" });
    expect(parsed.status).toBe("APPLIED");
  });

  it("accepts a well-formed YYYY-MM-DD application date", () => {
    const parsed = applicationSchema.parse({
      company: "Stripe",
      roleTitle: "SWE",
      applicationDate: "2026-01-15",
    });
    expect(parsed.applicationDate).toBe("2026-01-15");
  });

  it("rejects a date that is not in YYYY-MM-DD format", () => {
    const result = applicationSchema.safeParse({
      company: "Stripe",
      roleTitle: "SWE",
      applicationDate: "01/15/2026",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Date must be in YYYY-MM-DD format");
  });

  it("rejects an out-of-range status value", () => {
    const result = applicationSchema.safeParse({
      company: "Stripe",
      roleTitle: "SWE",
      status: "PENDING",
    });
    expect(result.success).toBe(false);
  });

  it("treats injection-shaped strings as plain data, not as errors", () => {
    // These must parse — they are legitimate (if hostile-looking) text. The
    // integration suite separately proves they are stored literally and never
    // interpreted (Prisma parameterizes all queries).
    const parsed = applicationSchema.parse({
      company: `Stripe'); DROP TABLE "Application";--`,
      roleTitle: `<script>alert(1)</script>`,
      notes: `{"$where": "1==1"}`,
    });
    expect(parsed.company).toBe(`Stripe'); DROP TABLE "Application";--`);
  });

  // KNOWN GAP (see FINDINGS.md): applicationSchema has no max-length bounds,
  // so a multi-megabyte notes/company field sails through validation. This
  // test asserts the desired behavior and is expected to fail until caps are
  // added.
  it.fails("rejects an absurdly oversized field (documents missing max bounds)", () => {
    const result = applicationSchema.safeParse({
      company: "Stripe",
      roleTitle: "SWE",
      notes: "x".repeat(1_000_000),
    });
    expect(result.success).toBe(false);
  });
});

describe("LLM input schemas: oversized and junk input is rejected before any paid call", () => {
  it("coverLetterSchema rejects an oversized base letter and job description", () => {
    expect(
      coverLetterSchema.safeParse({
        baseLetter: "x".repeat(8_001),
        jobDescription: "y".repeat(100),
      }).success
    ).toBe(false);
    expect(
      coverLetterSchema.safeParse({
        baseLetter: "x".repeat(200),
        jobDescription: "y".repeat(12_001),
      }).success
    ).toBe(false);
  });

  it("coverLetterSchema rejects junk that is too short to be real input", () => {
    expect(
      coverLetterSchema.safeParse({ baseLetter: "hi", jobDescription: "job" }).success
    ).toBe(false);
  });

  it("condenseLetterSchema clamps targetWords to a plausible one-page range", () => {
    const base = { letter: "x".repeat(500) };
    expect(condenseLetterSchema.safeParse({ ...base, targetWords: 100 }).success).toBe(false);
    expect(condenseLetterSchema.safeParse({ ...base, targetWords: 500 }).success).toBe(false);
    expect(condenseLetterSchema.safeParse({ ...base, targetWords: 300.5 }).success).toBe(false);
    expect(condenseLetterSchema.safeParse({ ...base, targetWords: 300 }).success).toBe(true);
  });

  it("resumeTailorSchema rejects an oversized resume", () => {
    expect(
      resumeTailorSchema.safeParse({
        resume: "x".repeat(20_001),
        jobDescription: "y".repeat(100),
      }).success
    ).toBe(false);
  });

  it("resumeRefineSchema rejects an oversized instruction", () => {
    expect(
      resumeRefineSchema.safeParse({
        resume: "x".repeat(500),
        instruction: "i".repeat(1_001),
      }).success
    ).toBe(false);
  });
});
