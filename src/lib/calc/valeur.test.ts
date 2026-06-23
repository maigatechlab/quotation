import { describe, expect, it } from "vitest";
import { CalcError } from "./error";
import { computeValeurMarchandise, MIN_PRICE, MAX_PRICE, MIN_RATE } from "./valeur";

describe("computeValeurMarchandise", () => {
  it("cas nominal : 100t * 1000 XOF/t * 1 = 100 000 FCFA", () => {
    expect(computeValeurMarchandise(100, 1000, 1)).toBe(100_000);
  });

  it("avec taux de change : 10 * 500 USD * 600 XOF/USD = 3 000 000 FCFA", () => {
    expect(computeValeurMarchandise(10, 500, 600)).toBe(3_000_000);
  });

  it("arrondit le resultat FCFA", () => {
    expect(computeValeurMarchandise(1, 10, 655.957)).toBe(6560);
  });

  it("quantite zero -> 0 FCFA", () => {
    expect(computeValeurMarchandise(0, 1000, 1)).toBe(0);
  });

  it("quantite negative -> CalcError", () => {
    expect(() => computeValeurMarchandise(-1, 1000, 1)).toThrow(CalcError);
  });

  it("prix = MIN_PRICE (0) -> 0 FCFA", () => {
    expect(computeValeurMarchandise(10, MIN_PRICE, 1)).toBe(0);
  });

  it("prix superieur a MAX_PRICE -> CalcError", () => {
    expect(() => computeValeurMarchandise(10, MAX_PRICE + 1, 1)).toThrow(CalcError);
  });

  it("prix negatif -> CalcError", () => {
    expect(() => computeValeurMarchandise(10, -1, 1)).toThrow(CalcError);
  });

  it("taux = MIN_RATE -> accepte", () => {
    expect(() => computeValeurMarchandise(10, 100, MIN_RATE)).not.toThrow();
  });

  it("taux inferieur a MIN_RATE -> CalcError", () => {
    expect(() => computeValeurMarchandise(10, 100, 0.0001)).toThrow(CalcError);
  });

  it("taux zero -> CalcError", () => {
    expect(() => computeValeurMarchandise(10, 100, 0)).toThrow(CalcError);
  });

  it("taux negatif -> CalcError", () => {
    expect(() => computeValeurMarchandise(10, 100, -1)).toThrow(CalcError);
  });

  it("NaN -> CalcError", () => {
    expect(() => computeValeurMarchandise(Number.NaN, 100, 1)).toThrow(CalcError);
  });

  it("Infinity -> CalcError", () => {
    expect(() => computeValeurMarchandise(10, 100, Number.POSITIVE_INFINITY)).toThrow(
      CalcError
    );
  });

  it("CalcError contient le champ 'exchangeRate' pour taux invalide", () => {
    expect(() => computeValeurMarchandise(10, 100, 0)).toThrow(
      expect.objectContaining({ field: "exchangeRate" })
    );
  });
});
