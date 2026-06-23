import { describe, expect, it } from "vitest";
import {
  computeCamions,
  MIN_TONNAGE,
  MAX_TONNAGE,
  MIN_CAPACITY,
  MAX_CAPACITY,
} from "./camions";
import { CalcError } from "./error";

describe("computeCamions", () => {
  it("cas nominal : 10t / 5t = 2 camions", () => {
    expect(computeCamions(10, 5)).toBe(2);
  });

  it("arrondi superieur : 11t / 5t = 3 camions", () => {
    expect(computeCamions(11, 5)).toBe(3);
  });

  it("tonnage = capacite -> 1 camion", () => {
    expect(computeCamions(5, 5)).toBe(1);
  });

  it("capacite zero -> CalcError", () => {
    expect(() => computeCamions(10, 0)).toThrow(CalcError);
  });

  it("capacite negative -> CalcError", () => {
    expect(() => computeCamions(10, -1)).toThrow(CalcError);
  });

  it("tonnage = MIN_TONNAGE -> accepte", () => {
    expect(computeCamions(MIN_TONNAGE, MIN_CAPACITY)).toBe(1);
  });

  it("tonnage = MAX_TONNAGE -> accepte", () => {
    expect(computeCamions(MAX_TONNAGE, MAX_CAPACITY)).toBe(
      Math.ceil(MAX_TONNAGE / MAX_CAPACITY)
    );
  });

  it("tonnage inferieur a MIN_TONNAGE -> CalcError", () => {
    expect(() => computeCamions(0.05, 5)).toThrow(CalcError);
  });

  it("tonnage superieur a MAX_TONNAGE -> CalcError", () => {
    expect(() => computeCamions(10_001, 5)).toThrow(CalcError);
  });

  it("capacite inferieure a MIN_CAPACITY -> CalcError", () => {
    expect(() => computeCamions(10, 0.5)).toThrow(CalcError);
  });

  it("capacite superieure a MAX_CAPACITY -> CalcError", () => {
    expect(() => computeCamions(10, 101)).toThrow(CalcError);
  });

  it("NaN -> CalcError", () => {
    expect(() => computeCamions(Number.NaN, 10)).toThrow(CalcError);
  });

  it("Infinity -> CalcError", () => {
    expect(() => computeCamions(10, Number.POSITIVE_INFINITY)).toThrow(CalcError);
  });

  it("CalcError contient le champ 'capacity' pour capacite zero", () => {
    expect(() => computeCamions(10, 0)).toThrow(expect.objectContaining({ field: "capacity" }));
  });
});
