import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser, createProTestUser } from "../helpers/db";
import { getPreferences, updatePreferences } from "@/lib/actions/preferences";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  mockedAuth.mockReset();
});

describe("preferences", () => {
  it("starts every account on the shipped defaults", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const prefs = await getPreferences();

    expect(prefs).toMatchObject({
      theme: "system",
      palette: "ledger",
      density: "compact",
      scanFrequency: "manual",
    });
  });

  it("stores a change without disturbing the others", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await updatePreferences({ palette: "ink" });
    const prefs = await getPreferences();

    expect(prefs.palette).toBe("ink");
    expect(prefs.theme).toBe("system");
    expect(prefs.density).toBe("compact");
  });

  // This replaces an earlier test asserting no scan frequency was gated. That
  // assertion described the old product, not a bug in the new one: scheduled
  // scanning is now Pro, so the correct behaviour is split in two below.
  it("accepts every scan frequency for a Pro account", async () => {
    const user = await createProTestUser();
    actAs(user.id);

    for (const frequency of ["manual", "every6h", "daily8am"]) {
      const result = await updatePreferences({ scanFrequency: frequency });
      expect(result).toMatchObject({ success: true });
      expect((await getPreferences()).scanFrequency).toBe(frequency);
    }
  });

  it("lets a free account pick manual but not the scheduled options", async () => {
    const user = await createTestUser();
    actAs(user.id);

    expect(await updatePreferences({ scanFrequency: "manual" })).toMatchObject({
      success: true,
    });

    for (const frequency of ["every6h", "daily8am"]) {
      const result = await updatePreferences({ scanFrequency: frequency });
      expect(result).toMatchObject({ proRequired: true });
      // Rejected, not silently stored — a free account must not end up with a
      // scheduled frequency sitting in its row.
      expect((await getPreferences()).scanFrequency).toBe("manual");
    }
  });

  it("reads a lapsed Pro account's stored schedule back as manual", async () => {
    // Picked "every 6 hours" while paying, then the subscription ended.
    const user = await createTestUser({
      plan: "PRO",
      proUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { scanFrequency: "every6h" },
    });
    actAs(user.id);

    // The stored choice is kept for a possible resubscribe...
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.scanFrequency).toBe("every6h");

    // ...but what the app acts on, and shows, is manual.
    expect((await getPreferences()).scanFrequency).toBe("manual");
  });

  it("rejects a value outside the vocabulary", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const result = await updatePreferences({ palette: "neon" });

    expect(result.error).toBeTruthy();
    expect((await getPreferences()).palette).toBe("ledger");
  });

  it("rejects an empty update rather than writing nothing", async () => {
    const user = await createTestUser();
    actAs(user.id);

    expect((await updatePreferences({})).error).toBeTruthy();
  });

  it("keeps one account's preferences away from another's", async () => {
    const first = await createTestUser();
    const second = await createTestUser();

    actAs(first.id);
    await updatePreferences({ density: "comfortable" });

    actAs(second.id);
    expect((await getPreferences()).density).toBe("compact");
  });

  it("refuses to read or write without a session", async () => {
    mockedAuth.mockResolvedValue(null as never);

    await expect(getPreferences()).rejects.toThrow();
    await expect(updatePreferences({ theme: "dark" })).rejects.toThrow();
  });
});
