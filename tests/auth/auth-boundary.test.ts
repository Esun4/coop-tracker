import { describe, it, expect, beforeEach, vi } from "vitest";

// Simulate an unauthenticated request: auth() resolves to no session.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import {
  getApplications,
  getApplication,
  createApplication,
  updateApplication,
  updateApplicationStatus,
  archiveApplication,
  deleteApplication,
  importApplications,
  bulkUpdateStatus,
  bulkSetDeadline,
  getStats,
  getRecentActivity,
  getDistinctSources,
} from "@/lib/actions/applications";
import {
  getUnresolvedSuggestions,
  dismissSuggestion,
  acceptNewApplication,
  acceptAllSuggestions,
  acceptStatusUpdate,
  undoEmailSuggestion,
  generateEmailDraft,
  sendEmailReply,
} from "@/lib/actions/suggestions";
import { syncGmailEmails } from "@/lib/actions/gmail";
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

  // Every remaining protected action, exercised the same way: no session →
  // the action must throw Unauthorized before validating input or touching
  // the DB. Payloads are intentionally valid-looking so the only thing that
  // can reject the call is the auth gate itself.
  const validApplication = { company: "Stripe", roleTitle: "SWE", status: "APPLIED" };
  const protectedActions: Array<[string, () => Promise<unknown>]> = [
    ["getApplication", () => getApplication("app-1")],
    ["updateApplication", () => updateApplication("app-1", validApplication)],
    ["updateApplicationStatus", () => updateApplicationStatus("app-1", "INTERVIEW")],
    ["archiveApplication", () => archiveApplication("app-1")],
    ["deleteApplication", () => deleteApplication("app-1")],
    ["importApplications", () => importApplications([{ company: "Stripe", roleTitle: "SWE" }])],
    ["bulkUpdateStatus", () => bulkUpdateStatus(["app-1"], "INTERVIEW")],
    ["bulkSetDeadline", () => bulkSetDeadline(["app-1"], { deadlineAt: null })],
    ["getStats", () => getStats()],
    ["getRecentActivity", () => getRecentActivity()],
    ["getDistinctSources", () => getDistinctSources()],
    ["getUnresolvedSuggestions", () => getUnresolvedSuggestions()],
    ["dismissSuggestion", () => dismissSuggestion("sug-1")],
    ["acceptNewApplication", () => acceptNewApplication("sug-1", validApplication)],
    ["acceptAllSuggestions", () => acceptAllSuggestions()],
    ["acceptStatusUpdate", () => acceptStatusUpdate("sug-1", "app-1", "INTERVIEW")],
    ["undoEmailSuggestion", () => undoEmailSuggestion("log-1")],
    ["generateEmailDraft", () => generateEmailDraft("sug-1")],
    ["sendEmailReply", () => sendEmailReply("sug-1", "Thanks, I'll be there.")],
    ["syncGmailEmails", () => syncGmailEmails()],
  ];

  it.each(protectedActions)(
    "rejects unauthenticated %s with Unauthorized",
    async (_name, call) => {
      mockedAuth.mockResolvedValue(null as never);
      await expect(call()).rejects.toThrow("Unauthorized");
    }
  );

  it.each(protectedActions)(
    "treats a session without a user id as unauthenticated for %s",
    async (_name, call) => {
      mockedAuth.mockResolvedValue({ user: {} } as never);
      await expect(call()).rejects.toThrow("Unauthorized");
    }
  );

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
