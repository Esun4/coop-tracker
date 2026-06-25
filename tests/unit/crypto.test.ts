import { describe, it, expect } from "vitest";
import { encrypt, decrypt, tryDecrypt } from "@/lib/crypto";

// ENCRYPTION_KEY is provided by .env.test (loaded in tests/setup.ts).

describe("crypto (Google token encryption)", () => {
  it("round-trips a value through encrypt → decrypt", () => {
    const secret = "ya29.a0AfH-some-google-access-token";
    const ciphertext = encrypt(secret);

    expect(ciphertext).not.toBe(secret);
    // iv:authTag:ciphertext format
    expect(ciphertext.split(":")).toHaveLength(3);
    expect(decrypt(ciphertext)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV) for the same input", () => {
    expect(encrypt("same-input")).not.toBe(encrypt("same-input"));
  });

  it("tryDecrypt returns null for malformed / legacy plaintext instead of throwing", () => {
    expect(tryDecrypt("not-encrypted-plaintext")).toBeNull();
    expect(tryDecrypt(null)).toBeNull();
    expect(tryDecrypt(undefined)).toBeNull();
  });

  it("tryDecrypt still decrypts a valid ciphertext", () => {
    expect(tryDecrypt(encrypt("hello"))).toBe("hello");
  });
});
