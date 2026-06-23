import { CalcError } from "./error";

export const MIN_TONNAGE = 0.1;
export const MAX_TONNAGE = 10_000;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 100;

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new CalcError(`${field} doit etre un nombre fini`, field);
  }
}

export function computeCamions(tonnage: number, capacity: number): number {
  assertFinite(tonnage, "tonnage");
  assertFinite(capacity, "capacity");

  if (capacity <= 0) {
    throw new CalcError("La capacite doit etre superieure a 0", "capacity");
  }
  if (tonnage < MIN_TONNAGE || tonnage > MAX_TONNAGE) {
    throw new CalcError(
      `Le tonnage doit etre entre ${MIN_TONNAGE} et ${MAX_TONNAGE}`,
      "tonnage"
    );
  }
  if (capacity < MIN_CAPACITY || capacity > MAX_CAPACITY) {
    throw new CalcError(
      `La capacite doit etre entre ${MIN_CAPACITY} et ${MAX_CAPACITY}`,
      "capacity"
    );
  }
  return Math.ceil(tonnage / capacity);
}
