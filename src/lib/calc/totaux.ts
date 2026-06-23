import { roundFcfa } from "@/lib/money";
import { CalcError } from "./error";

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new CalcError(`${field} doit etre un nombre fini`, field);
  }
}

function assertNonNegative(value: number, field: string): void {
  if (value < 0) {
    throw new CalcError(`${field} doit etre positif ou nul`, field);
  }
}

export function computeLineTotal(unitPrice: number, qty: number): number {
  assertFinite(unitPrice, "unitPrice");
  assertFinite(qty, "qty");
  assertNonNegative(unitPrice, "unitPrice");
  assertNonNegative(qty, "qty");

  return roundFcfa(unitPrice * qty);
}

export function computeQuoteTotal(lines: { totalFcfa: number }[]): number {
  return lines.reduce((sum, line) => {
    assertFinite(line.totalFcfa, "totalFcfa");
    assertNonNegative(line.totalFcfa, "totalFcfa");
    return roundFcfa(sum + line.totalFcfa);
  }, 0);
}
