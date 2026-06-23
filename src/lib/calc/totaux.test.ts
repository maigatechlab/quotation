import { describe, expect, it } from "vitest";
import { CalcError } from "./error";
import { computeLineTotal, computeQuoteTotal } from "./totaux";

describe("computeLineTotal", () => {
  it("prix * quantite", () => {
    expect(computeLineTotal(1000, 3)).toBe(3000);
  });

  it("quantite 1 (defaut) = prix unitaire", () => {
    expect(computeLineTotal(5000, 1)).toBe(5000);
  });

  it("prix zero = 0", () => {
    expect(computeLineTotal(0, 5)).toBe(0);
  });

  it("grandes valeurs", () => {
    expect(computeLineTotal(500_000, 10)).toBe(5_000_000);
  });

  it("arrondit le total a un entier FCFA", () => {
    expect(computeLineTotal(1500.5, 3)).toBe(4502);
  });

  it("NaN -> CalcError", () => {
    expect(() => computeLineTotal(Number.NaN, 3)).toThrow(CalcError);
  });

  it("valeur negative -> CalcError", () => {
    expect(() => computeLineTotal(1000, -1)).toThrow(CalcError);
  });
});

describe("computeQuoteTotal", () => {
  it("somme de plusieurs lignes", () => {
    const lines = [{ totalFcfa: 1000 }, { totalFcfa: 2000 }, { totalFcfa: 3000 }];
    expect(computeQuoteTotal(lines)).toBe(6000);
  });

  it("liste vide = 0", () => {
    expect(computeQuoteTotal([])).toBe(0);
  });

  it("une seule ligne", () => {
    expect(computeQuoteTotal([{ totalFcfa: 5000 }])).toBe(5000);
  });

  it("grandes valeurs", () => {
    const lines = Array.from({ length: 20 }, () => ({ totalFcfa: 500_000 }));
    expect(computeQuoteTotal(lines)).toBe(10_000_000);
  });

  it("arrondit les additions fractionnaires", () => {
    expect(computeQuoteTotal([{ totalFcfa: 1000.4 }, { totalFcfa: 1000.5 }])).toBe(2001);
  });

  it("Infinity -> CalcError", () => {
    expect(() => computeQuoteTotal([{ totalFcfa: Number.POSITIVE_INFINITY }])).toThrow(
      CalcError
    );
  });

  it("total negatif -> CalcError", () => {
    expect(() => computeQuoteTotal([{ totalFcfa: -1 }])).toThrow(CalcError);
  });
});
