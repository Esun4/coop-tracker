import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { resetDb } from "../helpers/db";
import {
  authorizeCredentials,
  RateLimitedSigninError,
} from "@/lib/credentials-auth";
import {
  signInErrorMessage,
  SIGNIN_RATE_LIMITED,
  SIGNIN_DEFAULT_MESSAGE,
} from "@/lib/auth-codes";
import { RATE_LIMITS } from "@/lib/rate-limit";

const EMAIL = "throttle-test@example.dev";

const IP_LIMIT = RATE_LIMITS.signin.ip;

// Generated per test rather than a literal: no password-shaped string lives in
// the file, and a value the code cannot have been written around proves the
// bcrypt comparison really checks what was hashed.
let password: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  password = `pw-${randomUUID()}`;
  await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Throttle Test",
      hashedPassword: await bcrypt.hash(password, 10),
    },
  });
});

/** A request carrying a client IP, as Vercel's proxy would set it. */
function requestFrom(ip: string): Request {
  return new Request("https://example.test/api/auth/callback/credentials", {
    headers: { "x-forwarded-for": ip },
  });
}

/** Named `candidate` so it doesn't shadow the generated `password` above. */
function attempt(candidate: string, ip = "198.51.100.10") {
  return authorizeCredentials(
    { email: EMAIL, password: candidate },
    requestFrom(ip)
  );
}

describe("credentials sign-in throttling", () => {
  it("signs in with the right password", async () => {
    await expect(attempt(password)).resolves.toMatchObject({ email: EMAIL });
  });

  it("returns null — not an error — for a wrong password while under the limit", async () => {
    await expect(attempt("wrong-password")).resolves.toBeNull();
  });

  it("throws a rate-limit error once the network's budget is spent", async () => {
    for (let i = 0; i < IP_LIMIT; i++) {
      await attempt("wrong-password");
    }

    // The next attempt is refused before any password check.
    await expect(attempt("wrong-password")).rejects.toBeInstanceOf(
      RateLimitedSigninError
    );
  });

  it("throttles the correct password too, once the budget is spent", async () => {
    for (let i = 0; i < IP_LIMIT; i++) {
      await attempt("wrong-password");
    }

    // Deliberate: a valid password does not buy a way past the throttle,
    // otherwise credential stuffing succeeds the moment it guesses right.
    await expect(attempt(password)).rejects.toBeInstanceOf(
      RateLimitedSigninError
    );
  });

  it("scopes the budget per network", async () => {
    for (let i = 0; i < IP_LIMIT; i++) {
      await attempt("wrong-password", "198.51.100.10");
    }

    // A different network is unaffected — one throttled office must not lock
    // everyone else out.
    await expect(attempt(password, "203.0.113.55")).resolves.toMatchObject({
      email: EMAIL,
    });
  });

  it("counts an unknown account against the budget as well", async () => {
    // Otherwise an attacker enumerating addresses gets unlimited attempts by
    // using emails that do not exist.
    for (let i = 0; i < IP_LIMIT; i++) {
      await authorizeCredentials(
        { email: "nobody@example.dev", password: "x" },
        requestFrom("198.51.100.10")
      );
    }

    await expect(attempt(password)).rejects.toBeInstanceOf(
      RateLimitedSigninError
    );
  });

  it("does not spend budget on a request missing credentials", async () => {
    for (let i = 0; i < IP_LIMIT + 5; i++) {
      await authorizeCredentials({ email: EMAIL }, requestFrom("198.51.100.10"));
    }

    // Empty submissions never reached the limiter, so a real attempt still works.
    await expect(attempt(password)).resolves.toMatchObject({ email: EMAIL });
  });
});

describe("account enumeration resistance", () => {
  it("still runs a bcrypt comparison when the account does not exist", async () => {
    const compare = vi.spyOn(bcrypt, "compare");

    try {
      await expect(
        authorizeCredentials(
          { email: "nobody@example.dev", password: "anything" },
          requestFrom("198.51.100.77")
        )
      ).resolves.toBeNull();

      // The point isn't the null — it's that the work happened. Skipping the
      // comparison would return in microseconds and make unknown emails
      // measurably distinguishable from wrong passwords.
      expect(compare).toHaveBeenCalledTimes(1);
    } finally {
      compare.mockRestore();
    }
  });

  it("compares against a hash with the same cost factor as a real one", async () => {
    const compare = vi.spyOn(bcrypt, "compare");

    try {
      await authorizeCredentials(
        { email: "nobody@example.dev", password: "anything" },
        requestFrom("198.51.100.78")
      );

      const [, hashUsed] = compare.mock.calls[0] as [string, string];
      const realHash = await bcrypt.hash("sample", 12);

      // bcrypt.compare takes its work factor from the stored hash, so a cheaper
      // dummy would leak the difference in timing just as plainly as skipping
      // the comparison altogether.
      expect(hashUsed.slice(0, 7)).toBe(realHash.slice(0, 7));
    } finally {
      compare.mockRestore();
    }
  });

  it("gives the identical answer for an unknown email and a wrong password", async () => {
    const unknown = await authorizeCredentials(
      { email: "nobody@example.dev", password: "anything" },
      requestFrom("198.51.100.79")
    );
    const wrongPassword = await attempt("definitely-not-it", "198.51.100.79");

    expect(unknown).toBeNull();
    expect(wrongPassword).toBeNull();
  });
});

describe("sign-in error copy", () => {
  it("carries a code the client can distinguish", () => {
    expect(new RateLimitedSigninError().code).toBe(SIGNIN_RATE_LIMITED);
  });

  it("explains a throttle rather than blaming the password", () => {
    const message = signInErrorMessage(SIGNIN_RATE_LIMITED);
    expect(message).toMatch(/too many/i);
    expect(message).not.toBe(SIGNIN_DEFAULT_MESSAGE);
  });

  it("falls back to the generic message for any other code", () => {
    // The fallback must never distinguish "no such user" from "wrong password"
    // — that turns the form into an account-existence oracle.
    expect(signInErrorMessage("credentials")).toBe(SIGNIN_DEFAULT_MESSAGE);
    expect(signInErrorMessage(undefined)).toBe(SIGNIN_DEFAULT_MESSAGE);
    expect(signInErrorMessage(null)).toBe(SIGNIN_DEFAULT_MESSAGE);
  });
});
