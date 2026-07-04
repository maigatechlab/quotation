import { describe, expect, it } from "vitest";
import { eurToCents, XOF_TO_EUR_RATE, xofToEur } from "./pricing";

describe("xofToEur", () => {
  it("converts pro monthly (25 000 XOF) to 38 EUR", () => {
    expect(xofToEur(25000)).toBe(38);
  });

  it("converts enterprise monthly (75 000 XOF) to 114 EUR", () => {
    expect(xofToEur(75000)).toBe(114);
  });

  it("converts pro annual (250 000 XOF) to 381 EUR", () => {
    expect(xofToEur(250000)).toBe(381);
  });

  it("converts enterprise annual (750 000 XOF) to 1143 EUR", () => {
    expect(xofToEur(750000)).toBe(1143);
  });

  it("converts 0 XOF to 0 EUR", () => {
    expect(xofToEur(0)).toBe(0);
  });

  it("rate reflects the fixed CFA franc peg", () => {
    expect(XOF_TO_EUR_RATE).toBeCloseTo(1 / 655.957, 10);
  });
});

describe("eurToCents", () => {
  it("converts 38 EUR to 3800 cents", () => {
    expect(eurToCents(38)).toBe(3800);
  });

  it("converts 1143 EUR to 114300 cents", () => {
    expect(eurToCents(1143)).toBe(114300);
  });

  it("converts 0 EUR to 0 cents", () => {
    expect(eurToCents(0)).toBe(0);
  });
});
