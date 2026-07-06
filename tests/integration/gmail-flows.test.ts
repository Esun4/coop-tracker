import { describe, it, expect, beforeEach, vi, beforeAll, afterEach } from "vitest";

// Gmail sync + email reply. googleapis and openai are mocked at the module
// boundary so no real network call is ever made; Prisma is real (test DB).
// These cover: the happy-path classification/persist flow, the reply flow,
// and — critically — that a decrypted access/refresh token never appears in
// any returned error message or console output.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  listMock,
  getMock,
  sendMock,
  openaiCreateMock,
  oauthSetCredentials,
  oauthOnHandlers,
} = vi.hoisted(() => ({
  listMock: vi.fn(),
  getMock: vi.fn(),
  sendMock: vi.fn(),
  openaiCreateMock: vi.fn(),
  oauthSetCredentials: vi.fn(),
  oauthOnHandlers: [] as Array<(t: unknown) => void>,
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
        setCredentials = oauthSetCredentials;
        on(_event: string, cb: (t: unknown) => void) {
          oauthOnHandlers.push(cb);
        }
      },
    },
    gmail: () => ({
      users: {
        messages: { list: listMock, get: getMock, send: sendMock },
      },
    }),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { resetDb, createTestUser, createTestSuggestion } from "../helpers/db";
import { syncGmailEmails } from "@/lib/actions/gmail";
import { sendEmailReply } from "@/lib/actions/suggestions";

const mockedAuth = vi.mocked(auth);
const PLAINTEXT_ACCESS = "ya29.PLAINTEXT-ACCESS-TOKEN-SUPER-SECRET";
const PLAINTEXT_REFRESH = "1//PLAINTEXT-REFRESH-TOKEN-SUPER-SECRET";

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  oauthOnHandlers.length = 0;
});

// Build a Gmail "messages.get" response with a base64url text/plain body.
function gmailMessage(id: string, subject: string, from: string, body: string) {
  return {
    data: {
      id,
      threadId: `thread-${id}`,
      snippet: body.slice(0, 50),
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: subject },
          { name: "From", value: from },
          { name: "Date", value: "Mon, 01 Jun 2026 12:00:00 +0000" },
        ],
        body: { data: Buffer.from(body).toString("base64url") },
      },
    },
  };
}

describe("syncGmailEmails — classification & persistence", () => {
  it("classifies new emails and stores only actionable, above-threshold suggestions", async () => {
    const user = await createTestUser({
      googleAccessToken: encrypt(PLAINTEXT_ACCESS),
      googleRefreshToken: encrypt(PLAINTEXT_REFRESH),
    });
    actAs(user.id);

    listMock.mockResolvedValue({ data: { messages: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] } });
    getMock.mockImplementation(({ id }: { id: string }) => {
      if (id === "m1") return gmailMessage("m1", "We received your application", "jobs@stripe.com", "Thanks for applying to Stripe.");
      if (id === "m2") return gmailMessage("m2", "Newsletter", "news@medium.com", "Top stories this week.");
      return gmailMessage("m3", "Interview invite", "recruiting@figma.com", "We'd like to interview you.");
    });
    openaiCreateMock.mockImplementation(({ messages }: { messages: { content: string }[] }) => {
      const userContent = messages[1].content;
      if (userContent.includes("received your application")) {
        return { choices: [{ message: { content: JSON.stringify({ action: "NEW_APPLICATION", status: "APPLIED", company: "Stripe", role: "SWE", confidence: 0.9, reasoning: "confirmation" }) } }] };
      }
      if (userContent.includes("interview")) {
        return { choices: [{ message: { content: JSON.stringify({ action: "STATUS_UPDATE", status: "INTERVIEW", company: "Figma", role: "PM", confidence: 0.85, reasoning: "invite" }) } }] };
      }
      return { choices: [{ message: { content: JSON.stringify({ action: "IRRELEVANT", status: null, company: null, role: null, confidence: 0.2, reasoning: "newsletter" }) } }] };
    });

    const result = await syncGmailEmails();
    expect(result).toMatchObject({ success: true, newSuggestions: 2 });

    const stored = await prisma.emailSuggestion.findMany({ where: { userId: user.id }, orderBy: { suggestedCompany: "asc" } });
    expect(stored.map((s) => s.suggestedCompany)).toEqual(["Figma", "Stripe"]);
    // IRRELEVANT email produced no suggestion.
    expect(stored.find((s) => s.suggestedCompany === "Medium")).toBeUndefined();

    // lastEmailSync stamped so the cooldown engages next time.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.lastEmailSync).not.toBeNull();
  });

  it("drops below-confidence classifications", async () => {
    const user = await createTestUser({ googleAccessToken: encrypt(PLAINTEXT_ACCESS) });
    actAs(user.id);
    listMock.mockResolvedValue({ data: { messages: [{ id: "m1" }] } });
    getMock.mockResolvedValue(gmailMessage("m1", "Maybe a job?", "x@y.com", "unclear"));
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ action: "STATUS_UPDATE", status: "OA", company: "Foo", role: null, confidence: 0.2, reasoning: "low" }) } }],
    });

    const result = await syncGmailEmails();
    expect(result).toMatchObject({ success: true, newSuggestions: 0 });
    expect(await prisma.emailSuggestion.count()).toBe(0);
  });

  it("does not re-create suggestions for already-seen message ids", async () => {
    const user = await createTestUser({ googleAccessToken: encrypt(PLAINTEXT_ACCESS) });
    actAs(user.id);
    await createTestSuggestion(user.id, { emailMessageId: "dup-1" });

    listMock.mockResolvedValue({ data: { messages: [{ id: "dup-1" }] } });

    const result = await syncGmailEmails();
    expect(result).toMatchObject({ success: true, newSuggestions: 0 });
    expect(getMock).not.toHaveBeenCalled(); // already-seen → never fetched/classified
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it("enforces the 5-minute cooldown between syncs", async () => {
    const user = await createTestUser({
      googleAccessToken: encrypt(PLAINTEXT_ACCESS),
      lastEmailSync: new Date(Date.now() - 60 * 1000), // 1 min ago
    });
    actAs(user.id);

    const result = await syncGmailEmails();
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/wait/i);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns a friendly error (no crash) when no Google token is stored", async () => {
    const user = await createTestUser(); // no token
    actAs(user.id);

    const result = await syncGmailEmails();
    expect(result).toMatchObject({ error: expect.stringMatching(/No Google account/i) });
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe("Gmail token handling — tokens must never leak", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function allLoggedText() {
    return [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a ?? "")))
      .join("\n");
  }

  it("a 401 from the Gmail list call yields a re-auth message with no token in it", async () => {
    const user = await createTestUser({
      googleAccessToken: encrypt(PLAINTEXT_ACCESS),
      googleRefreshToken: encrypt(PLAINTEXT_REFRESH),
    });
    actAs(user.id);
    listMock.mockRejectedValue(Object.assign(new Error("invalid_grant"), { status: 401 }));

    const result = await syncGmailEmails();
    expect(result).toMatchObject({ error: expect.stringMatching(/expired|sign in/i) });

    const errText = (result as { error: string }).error + "\n" + allLoggedText();
    expect(errText).not.toContain(PLAINTEXT_ACCESS);
    expect(errText).not.toContain(PLAINTEXT_REFRESH);
  });

  it("sendEmailReply 403 yields a re-auth message with no token in it", async () => {
    const user = await createTestUser({
      googleAccessToken: encrypt(PLAINTEXT_ACCESS),
      googleRefreshToken: encrypt(PLAINTEXT_REFRESH),
    });
    actAs(user.id);
    const sug = await createTestSuggestion(user.id);
    sendMock.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));

    const result = await sendEmailReply(sug.id, "Looking forward to it.");
    expect(result).toMatchObject({ error: expect.stringMatching(/expired|sign in/i) });

    const errText = (result as { error: string }).error + "\n" + allLoggedText();
    expect(errText).not.toContain(PLAINTEXT_ACCESS);
    expect(errText).not.toContain(PLAINTEXT_REFRESH);
  });

  it("the decrypted token is passed to the OAuth client but never surfaced to the caller", async () => {
    const user = await createTestUser({
      googleAccessToken: encrypt(PLAINTEXT_ACCESS),
      googleRefreshToken: encrypt(PLAINTEXT_REFRESH),
    });
    actAs(user.id);
    const sug = await createTestSuggestion(user.id);
    sendMock.mockResolvedValue({ data: { id: "sent-1" } });

    const result = await sendEmailReply(sug.id, "Thanks!");
    expect(result).toMatchObject({ success: true });

    // The OAuth client did receive the real decrypted token (proves decrypt
    // happened) ...
    expect(oauthSetCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: PLAINTEXT_ACCESS })
    );
    // ... but nothing about the send request body or result exposes it.
    expect(JSON.stringify(result)).not.toContain(PLAINTEXT_ACCESS);
    expect(allLoggedText()).not.toContain(PLAINTEXT_ACCESS);
  });
});

describe("sendEmailReply — happy path and guards", () => {
  it("sends a reply on the original thread and records replySentAt", async () => {
    const user = await createTestUser({
      name: "Ethan",
      googleAccessToken: encrypt(PLAINTEXT_ACCESS),
    });
    actAs(user.id);
    const sug = await createTestSuggestion(user.id, {
      emailThreadId: "thread-abc",
      emailSender: "recruiting@stripe.com",
      emailSubject: "Interview Invitation",
    });
    sendMock.mockResolvedValue({ data: { id: "sent-1" } });

    const result = await sendEmailReply(sug.id, "I'd be delighted to interview.");
    expect(result).toMatchObject({ success: true });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const req = sendMock.mock.calls[0][0];
    expect(req.requestBody.threadId).toBe("thread-abc");
    const decoded = Buffer.from(req.requestBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("To: recruiting@stripe.com");
    expect(decoded).toContain("Subject: Re: Interview Invitation");
    expect(decoded).toContain("I'd be delighted to interview.");

    const after = await prisma.emailSuggestion.findUniqueOrThrow({ where: { id: sug.id } });
    expect(after.replySentAt).not.toBeNull();
  });

  it("refuses to send when the suggestion has no thread id", async () => {
    const user = await createTestUser({ googleAccessToken: encrypt(PLAINTEXT_ACCESS) });
    actAs(user.id);
    const sug = await createTestSuggestion(user.id, { emailThreadId: null });

    const result = await sendEmailReply(sug.id, "hi");
    expect(result).toMatchObject({ error: expect.stringMatching(/thread ID/i) });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports a friendly error when the stored token can't be decrypted", async () => {
    // Store a non-decryptable value (simulates a legacy plaintext token).
    const user = await createTestUser({ googleAccessToken: "legacy-plaintext-token" });
    actAs(user.id);
    const sug = await createTestSuggestion(user.id);

    const result = await sendEmailReply(sug.id, "hi");
    expect(result).toMatchObject({ error: expect.stringMatching(/refreshed|sign in/i) });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
