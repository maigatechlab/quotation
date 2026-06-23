import { describe, expect, it } from "vitest";
import {
  formatFcfa,
  roundFcfa,
  toFcfa,
  MAX_MONETARY_VALUE,
  MIN_MONETARY_VALUE,
} from "@/lib/money";

describe("formatFcfa", () => {
  it("formate zéro", () => {
    expect(formatFcfa(0)).toContain("0");
  });

  it("inclut le symbole monétaire CFA dans le formatage", () => {
    // Intl produit "F CFA" (fr-FR/Node) ou "XOF" selon l'ICU — les deux sont valides
    const result = formatFcfa(1500);
    expect(result).toMatch(/XOF|CFA/);
  });

  it("formate 1 500 000 avec séparateur milliers fr-FR", () => {
    const result = formatFcfa(1_500_000);
    // Le résultat doit contenir 1 500 000 (espace insécable fr-FR)
    expect(result).toMatch(/1[\s ]500[\s ]000/);
  });

  it("formate MAX_MONETARY_VALUE sans crash", () => {
    expect(() => formatFcfa(MAX_MONETARY_VALUE)).not.toThrow();
  });

  it("pas de décimales sur un entier FCFA", () => {
    const result = formatFcfa(1000);
    // XOF n'a pas de sous-unité — pas de virgule décimale
    expect(result).not.toMatch(/[,\.]\d{2}/);
  });
});

describe("roundFcfa", () => {
  it("entier → pas de changement", () => {
    expect(roundFcfa(1500)).toBe(1500);
  });

  it("arrondi half-up : .5 → entier supérieur", () => {
    expect(roundFcfa(1500.5)).toBe(1501);
  });

  it("arrondi .4 → entier inférieur", () => {
    expect(roundFcfa(1500.4)).toBe(1500);
  });

  it("zéro reste zéro", () => {
    expect(roundFcfa(0)).toBe(0);
  });

  it("grands nombres", () => {
    expect(roundFcfa(9_999_999.7)).toBe(10_000_000);
  });
});

describe("toFcfa", () => {
  it("taux 1 (FCFA → FCFA) = roundFcfa(amount)", () => {
    expect(toFcfa(1500.5, 1)).toBe(1501);
  });

  it("conversion avec taux de change USD→XOF", () => {
    // 100 USD * 600 XOF/USD = 60 000 XOF
    expect(toFcfa(100, 600)).toBe(60_000);
  });

  it("arrondit le résultat de la conversion", () => {
    // 10 * 655.957 = 6559.57 → 6560
    expect(toFcfa(10, 655.957)).toBe(6560);
  });

  it("zéro amount → zéro", () => {
    expect(toFcfa(0, 600)).toBe(0);
  });

  it("MIN_MONETARY_VALUE est 0", () => {
    expect(MIN_MONETARY_VALUE).toBe(0);
  });

  it("MAX_MONETARY_VALUE est défini", () => {
    expect(MAX_MONETARY_VALUE).toBe(1e13);
  });
});
