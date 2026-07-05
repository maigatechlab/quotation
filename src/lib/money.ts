export const MAX_MONETARY_VALUE = 1e13;
export const MIN_MONETARY_VALUE = 0;

// Affichage canonique : `1 650 000 FCFA` (groupement fr-FR, entier, suffixe
// FCFA) — partout : tables, cartes, dashboard, vue document. Le style
// currency/XOF d'Intl produit « F CFA », traité comme incohérence (design brief).
const FCFA_FORMATTER = new Intl.NumberFormat("fr-FR", {
  style: "decimal",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatFcfa(n: number): string {
  return `${FCFA_FORMATTER.format(n)} FCFA`;
}

export function roundFcfa(n: number): number {
  return Math.round(n);
}

export function toFcfa(amount: number, exchangeRate: number): number {
  return roundFcfa(amount * exchangeRate);
}
