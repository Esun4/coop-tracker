import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser } from "../helpers/db";
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

  it("accepts every scan frequency — none of them is gated", async () => {
    const user = await createTestUser();
    actAs(user.id);

    for (const frequency of ["manual", "every6h", "daily8am"]) {
      const result = await updatePreferences({ scanFrequency: frequency });
      expect(result).toMatchObject({ success: true });
      expect((await getPreferences()).scanFrequency).toBe(frequency);
    }
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
