import { describe, it, expect } from "vitest";
import { applicationSchema } from "@/lib/schemas";

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
});
