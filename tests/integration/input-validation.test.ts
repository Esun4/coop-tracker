import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

// Action-layer validation: the server action is the real security boundary
// (Server Actions are directly invocable), so malformed input must be
// rejected there regardless of what the client UI allows.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  resetDb,
  createTestUser,
  createTestApplication,
  createTestSuggestion,
} from "../helpers/db";
import {
  getApplications,
  updateApplication,
  importApplications,
} from "@/lib/actions/applications";
import { acceptStatusUpdate } from "@/lib/actions/suggestions";
import { signUp } from "@/lib/actions/auth";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

describe("updateApplication input validation", () => {
  it("rejects a malformed payload via Zod and leaves the record unchanged", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { company: "Original" });

    const result = await updateApplication(app.id, {
      company: "",
      roleTitle: "SWE",
      applicationDate: "not-a-date",
    });
    expect(result).toHaveProperty("error");

    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.company).toBe("Original");
  });

  it("rejects a non-object payload without crashing", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id);

    expect(await updateApplication(app.id, "garbage")).toHaveProperty("error");
    expect(await updateApplication(app.id, null)).toHaveProperty("error");
    expect(await updateApplication(app.id, [1, 2, 3])).toHaveProperty("error");
  });
});

describe("getApplications: hostile filter/sort parameters", () => {
  it("treats an injection-shaped search string as literal text (parameterized query)", async () => {
    const user = await createTestUser();
    actAs(user.id);
    await createTestApplication(user.id, { company: "Stripe" });

    const results = await getApplications({
      search: `' OR 1=1; DROP TABLE "Application";--`,
    });
    expect(results).toHaveLength(0);

    // Table still intact and queryable.
    expect(await prisma.application.count()).toBe(1);
  });

  it("ignores an invalid status filter instead of erroring", async () => {
    const user = await createTestUser();
    actAs(user.id);
    await createTestApplication(user.id);

    const results = await getApplications({ status: "'; SELECT 1;--" });
    expect(results).toHaveLength(1); // filter dropped, own rows returned
  });

  it("falls back to the default sort for a hostile sortBy value instead of throwing", async () => {
    const user = await createTestUser();
    actAs(user.id);
    await createTestApplication(user.id);

    const results = await getApplications({ sortBy: "hashedPassword" });
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1); // fell back to updatedAt, still returned own rows
  });

  it("ignores an invalid sortOrder and defaults to desc", async () => {
    const user = await createTestUser();
    actAs(user.id);
    await createTestApplication(user.id);

    const results = await getApplications({ sortBy: "company", sortOrder: "sideways" as never });
    expect(results).toHaveLength(1);
  });
});

describe("importApplications validation", () => {
  it("rejects an import above the row cap and creates nothing", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const rows = Array.from({ length: 1001 }, (_, i) => ({
      company: `Co${i}`,
      roleTitle: "SWE",
    }));
    const result = await importApplications(rows);
    expect(result).toMatchObject({ success: false });
    expect(await prisma.application.count()).toBe(0);
  });

  it("rejects rows with an empty company and creates nothing (row-level Zod)", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const result = await importApplications([{ company: "", roleTitle: "" }]);
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/Row 1/);
    expect(await prisma.application.count()).toBe(0);
  });

  it("returns a clean error for an invalid status value and rolls back the whole import", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const result = await importApplications([
      { company: "Valid", roleTitle: "SWE" },
      { company: "Stripe", roleTitle: "SWE", status: "TOTALLY_BOGUS" },
    ]);
    expect(result).toMatchObject({ success: false });
    // Validation happens before any write, so the earlier valid row is not
    // persisted either — the import is all-or-nothing.
    expect(await prisma.application.count()).toBe(0);
  });

  it("returns a clean error for an unparseable applicationDate", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const result = await importApplications([
      { company: "Stripe", roleTitle: "SWE", applicationDate: "not-a-date" },
    ]);
    expect(result).toMatchObject({ success: false });
    expect(await prisma.application.count()).toBe(0);
  });

  it("accepts a valid import with a well-formed date and status", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const result = await importApplications([
      { company: "Stripe", roleTitle: "SWE", status: "OA", applicationDate: "2026-01-15" },
    ]);
    expect(result).toMatchObject({ success: true, count: 1 });
    const app = await prisma.application.findFirstOrThrow({ where: { userId: user.id } });
    expect(app).toMatchObject({ status: "OA", company: "Stripe" });
  });
});

describe("acceptStatusUpdate status validation", () => {
  it("returns a clean error for an invalid status instead of throwing", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id);
    const sug = await createTestSuggestion(user.id);

    const result = await acceptStatusUpdate(sug.id, app.id, "NOT_A_STATUS");
    expect(result).toHaveProperty("error");

    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("APPLIED");
  });
});

describe("signUp", () => {
  function form(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("creates the user with a bcrypt hash — never the plaintext password", async () => {
    const result = await signUp(
      form({ name: "Ethan", email: "new@test.dev", password: "a-long-password-123" })
    );
    expect(result).toMatchObject({ success: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "new@test.dev" } });
    expect(user.hashedPassword).not.toBe("a-long-password-123");
    expect(user.hashedPassword).toMatch(/^\$2[aby]\$/); // bcrypt format
    expect(await bcrypt.compare("a-long-password-123", user.hashedPassword!)).toBe(true);
  });

  it("rejects a password shorter than 12 characters", async () => {
    const result = await signUp(
      form({ name: "Ethan", email: "short@test.dev", password: "short" })
    );
    expect(result).toMatchObject({ error: "Password must be at least 12 characters" });
    expect(await prisma.user.findUnique({ where: { email: "short@test.dev" } })).toBeNull();
  });

  it("rejects an invalid email", async () => {
    const result = await signUp(
      form({ name: "Ethan", email: "not-an-email", password: "a-long-password-123" })
    );
    expect(result).toMatchObject({ error: "Invalid email" });
  });

  it("refuses to overwrite an existing account", async () => {
    await createTestUser({ email: "taken@test.dev" });
    const result = await signUp(
      form({ name: "Ethan", email: "taken@test.dev", password: "a-long-password-123" })
    );
    expect(result).toHaveProperty("error");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "taken@test.dev" } });
    expect(user.hashedPassword).toBeNull(); // original row untouched
  });
});
