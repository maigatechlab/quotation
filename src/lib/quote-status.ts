/**
 * quote-status.ts — Machine à états du cycle de vie d'un devis (FR-15 / Story 3.9).
 *
 * Logique pure (sans React, sans Dexie) extraite du composant StatusChangeSheet
 * afin d'être testée unitairement de façon déterministe.
 *
 * Diagramme de la machine à états :
 *
 *   Brouillon → Validé → Envoyé → Accepté
 *                  ↓        ↓         ↓
 *               Annulé   Expiré    (terminal)
 *     ↓                  ↓
 *  Annulé              Annulé
 *
 * Les statuts Accepté / Expiré / Annulé sont terminaux : aucune transition
 * sortante n'est proposée (AC1).
 */
import type { QuoteLocal, QuoteLineLocal } from "@/lib/local-db";

export type QuoteStatusValue = QuoteLocal["status"];

/**
 * Transitions valides depuis chaque statut courant (AC1).
 * Un statut terminal (Accepté / Expiré / Annulé) renvoie un tableau vide.
 */
export const VALID_TRANSITIONS: Record<QuoteStatusValue, QuoteStatusValue[]> = {
  draft: ["validated", "cancelled"],
  validated: ["sent", "cancelled"],
  sent: ["accepted", "expired", "cancelled"],
  accepted: [],
  expired: [],
  cancelled: [],
};

/** Un statut est terminal s'il n'admet aucune transition sortante. */
export function isTerminalStatus(status: QuoteStatusValue): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}

/**
 * Vérifie qu'une transition est autorisée par la machine à états.
 * Renvoie false pour toute transition vers un statut terminal depuis un statut
 * terminal, ou pour toute transition non listée dans VALID_TRANSITIONS.
 */
export function canTransition(
  from: QuoteStatusValue,
  to: QuoteStatusValue
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/** Codes d'erreur de validation de la transition Brouillon → Validé (AC3). */
export type DraftValidationErrorCode =
  | "missingClient"
  | "missingLines"
  | "zeroTotal"
  | "missingRoute"
  | "missingSignatory";

/** Erreurs produites par validateDraftToValidated (cf. i18n devis.status.validationErrors). */
export const DRAFT_VALIDATION_ERROR_CODES: readonly DraftValidationErrorCode[] = [
  "missingClient",
  "missingLines",
  "zeroTotal",
  "missingRoute",
  "missingSignatory",
] as const;

/**
 * Validation complète de la transition Brouillon → Validé (AC3).
 *
 * Vérifie, à partir des données du devis et de ses lignes :
 *  - clientId non null
 *  - au moins une ligne de prestation
 *  - total > 0
 *  - trajet défini (originCity + destinationCity non vides)
 *  - signataire défini (signataireNom non vide)
 *
 * Renvoie la liste (possiblement vide) des codes d'erreur.
 *
 * NOTE : cette fonction pure reçoit quote + lines en paramètres plutôt que de
 * lire Dexie directement, afin de rester testable sans faux IndexedDB.
 * Le composant StatusChangeSheet se charge de la lecture Dexie puis appelle
 * cette fonction.
 */
export function validateDraftToValidated(
  quote: Pick<
    QuoteLocal,
    "clientId" | "originCity" | "destinationCity" | "signataireNom" | "totalFcfa"
  > | undefined,
  lines: Pick<QuoteLineLocal, "id">[]
): DraftValidationErrorCode[] {
  if (!quote) {
    // Devis introuvable — toutes les validations échouent (situation anormale).
    return [...DRAFT_VALIDATION_ERROR_CODES];
  }

  const errors: DraftValidationErrorCode[] = [];
  if (!quote.clientId) errors.push("missingClient");
  if (!quote.originCity?.trim() || !quote.destinationCity?.trim()) errors.push("missingRoute");
  if (!quote.signataireNom?.trim()) errors.push("missingSignatory");
  if (lines.length === 0) errors.push("missingLines");
  if (quote.totalFcfa <= 0) errors.push("zeroTotal");
  return errors;
}

/** Liste ordonnée de tous les statuts pour le rendu du bottom sheet (AC2). */
export const ALL_STATUSES: readonly QuoteStatusValue[] = [
  "draft",
  "validated",
  "sent",
  "accepted",
  "expired",
  "cancelled",
] as const;

export type QuoteStatus = QuoteLocal["status"];
