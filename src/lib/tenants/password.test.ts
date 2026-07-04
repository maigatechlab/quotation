import { describe, expect, it } from "vitest";
import { generatePassword } from "./password";

const AMBIGUOUS = ["O", "0", "l", "1", "I"];

describe("generatePassword", () => {
  it("respects the requested length (min 16 enforced)", () => {
    expect(generatePassword(20)).toHaveLength(20);
    expect(generatePassword(16)).toHaveLength(16);
    // length below 16 is bumped up to 16
    expect(generatePassword(4)).toHaveLength(16);
  });

  it("contains at least one of each character class", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword();
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[2-9]/);
      expect(pw).toMatch(/[-!@#$%^&*]/);
    }
  });

  it("avoids visually ambiguous characters", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword();
      for (const ch of AMBIGUOUS) {
        expect(pw.includes(ch)).toBe(false);
      }
    }
  });

  it("is non-deterministic across runs", () => {
    const values = new Set(Array.from({ length: 10 }, () => generatePassword()));
    expect(values.size).toBe(10);
  });
});
