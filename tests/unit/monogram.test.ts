import { describe, it, expect } from "vitest";
import { firstCharacter } from "@/components/ui/monogram";

/**
 * The monogram box is a fixed size, so this has to return exactly one
 * user-perceived character — which is not the same as one code unit, one code
 * point, or whatever `toUpperCase` happens to hand back.
 */
describe("firstCharacter", () => {
  it("takes the initial and uppercases it", () => {
    expect(firstCharacter("Shopify")).toBe("S");
    expect(firstCharacter("shopify")).toBe("S");
  });

  it("ignores surrounding whitespace", () => {
    expect(firstCharacter("  Stripe ")).toBe("S");
  });

  it("falls back when there is no name", () => {
    expect(firstCharacter("")).toBe("?");
    expect(firstCharacter("   ")).toBe("?");
  });

  it("keeps a non-BMP character whole", () => {
    // charAt would return half a surrogate pair here.
    expect(firstCharacter("🚀 Labs")).toBe("🚀");
  });

  it("keeps a combining mark with the letter it modifies", () => {
    // Decomposed on purpose: "A" + U+030A is two code points but one
    // character on screen, so splitting by code point would drop the ring.
    expect(firstCharacter("A\u030Angstrom")).toBe("A\u030A");
  });

  it("stays one character when uppercasing expands it", () => {
    // "ß".toUpperCase() is "SS" — two glyphs in a box sized for one.
    expect(firstCharacter("ßeta")).toBe("S");
  });
});
