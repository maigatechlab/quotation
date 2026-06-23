import { roundFcfa } from "@/lib/money";
import { CalcError } from "./error";

export const MIN_PRICE = 0;
export const MAX_PRICE = 1e10;
export const MIN_RATE = 0.001;
export const MIN_QUANTITY = 0;

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new CalcError(`${field} doit etre un nombre fini`, field);
  }
}

export function computeValeurMarchandise(
  quantity: number,
  unitPrice: number,
  exchangeRate: number
): number {
  assertFinite(quantity, "quantity");
  assertFinite(unitPrice, "unitPrice");
  assertFinite(exchangeRate, "exchangeRate");

  if (quantity < MIN_QUANTITY) {
    throw new CalcError(`La quantite doit etre >= ${MIN_QUANTITY}`, "quantity");
  }
  if (unitPrice < MIN_PRICE || unitPrice > MAX_PRICE) {
    throw new CalcError(
      `Le prix unitaire doit etre entre ${MIN_PRICE} et ${MAX_PRICE}`,
      "unitPrice"
    );
  }
  if (exchangeRate < MIN_RATE) {
    throw new CalcError(`Le taux de change doit etre >= ${MIN_RATE}`, "exchangeRate");
  }
  return roundFcfa(quantity * unitPrice * exchangeRate);
}
