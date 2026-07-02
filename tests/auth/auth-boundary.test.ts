import { describe, it, expect, beforeEach, vi } from "vitest";

// Simulate an unauthenticated request: auth() resolves to no session.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { getApplications, createApplication } from "@/lib/actions/applications";
import {
  generateCoverLetter,
  condenseCoverLetter,
} from "@/lib/actions/cover-letter";
import {
  analyzeJobForResume,
  tailorResume,
  compareResumes,
  refineResume,
} from "@/lib/actions/resume";

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
  mockedAuth.mockReset();
});

describe("auth boundary on protected server actions", () => {
  it("rejects an unauthenticated read (getApplications) with Unauthorized", async () => {
    mockedAuth.mockResolvedValue(null as never);
    await expect(getApplications()).rejects.toThrow("Unauthorized");
  });

  it("rejects an unauthenticated write (createApplication) with Unauthorized — before touching the DB", async () => {
    mockedAuth.mockResolvedValue(null as never);
    await expect(
      createApplication({ company: "Stripe", roleTitle: "SWE", status: "APPLIED" })
    ).rejects.toThrow("Unauthorized");
  });

  it("treats a session without a user id as unauthenticated", async () => {
    mockedAuth.mockResolvedValue({ user: {} } as never);
    await expect(getApplications()).rejects.toThrow("Unauthorized");
  });

  it("rejects an unauthenticated cover-letter generation with Unauthorized", async () => {
    mockedAuth.mockResolvedValue(null as never);
    await expect(
      generateCoverLetter({ baseLetter: "x", jobDescription: "y" })
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects an unauthenticated cover-letter condense with Unauthorized", async () => {
    mockedAuth.mockResolvedValue(null as never);
    await expect(
      condenseCoverLetter({ letter: "x", targetWords: 300 })
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects unauthenticated resume pipeline steps with Unauthorized", async () => {
    mockedAuth.mockResolvedValue(null as never);
    await expect(
      analyzeJobForResume({ jobDescription: "x" })
    ).rejects.toThrow("Unauthorized");
    await expect(
      tailorResume({
        resume: "x",
        jobDescription: "y",
        analysis: { responsibilities: [], keywords: [] },
      })
    ).rejects.toThrow("Unauthorized");
    await expect(
      compareResumes({ originalResume: "x", tailoredResume: "y" })
    ).rejects.toThrow("Unauthorized");
    await expect(
      refineResume({ resume: "x", instruction: "shorten it" })
    ).rejects.toThrow("Unauthorized");
  });
});
