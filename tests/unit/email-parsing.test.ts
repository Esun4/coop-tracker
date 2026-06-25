import { describe, it, expect } from "vitest";
import { extractCompanyFromSender } from "@/lib/email-parsing";

describe("extractCompanyFromSender", () => {
  it("uses a human display name as the company", () => {
    expect(extractCompanyFromSender('"Stripe Recruiting Team" <jobs@stripe.com>')).toBe(
      "Stripe Recruiting Team"
    );
  });

  it("falls back to the email domain when the display name is generic (no-reply)", () => {
    expect(extractCompanyFromSender('"no-reply" <no-reply@acmerobotics.com>')).toBe("Acmerobotics");
  });

  it("derives the company from the domain when there is no display name", () => {
    expect(extractCompanyFromSender("careers@databricks.com")).toBe("Databricks");
  });

  it("returns null for job boards / personal providers (never uses them as the company)", () => {
    expect(extractCompanyFromSender("jobalerts@linkedin.com")).toBeNull();
    expect(extractCompanyFromSender("noreply@indeed.com")).toBeNull();
    expect(extractCompanyFromSender("someone@gmail.com")).toBeNull();
  });

  it("returns null when no company can be determined", () => {
    expect(extractCompanyFromSender("")).toBeNull();
  });
});
