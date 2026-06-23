export const MAX_MONETARY_VALUE = 1e13;
export const MIN_MONETARY_VALUE = 0;

const FCFA_FORMATTER = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XOF",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatFcfa(n: number): string {
  return FCFA_FORMATTER.format(n);
}

export function roundFcfa(n: number): number {
  return Math.round(n);
}

export function toFcfa(amount: number, exchangeRate: number): number {
  return roundFcfa(amount * exchangeRate);
}
