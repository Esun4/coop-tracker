import { describe, it, expect, beforeEach, vi } from "vitest";

// Simulate an unauthenticated request: auth() resolves to no session.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { getApplications, createApplication } from "@/lib/actions/applications";

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
});
