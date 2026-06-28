import { describe, expect, it } from "vitest";
import type { QuoteLocal, QuoteLineLocal } from "@/lib/local-db";
import {
  ALL_STATUSES,
  canTransition,
  DRAFT_VALIDATION_ERROR_CODES,
  isTerminalStatus,
  validateDraftToValidated,
  VALID_TRANSITIONS,
} from "@/lib/quote-status";

function makeQuote(
  overrides: {
    clientId?: string | undefined;
    originCity?: string | undefined;
    destinationCity?: string | undefined;
    signataireNom?: string | undefined;
    totalFcfa?: number | undefined;
  } = {}
): Pick<QuoteLocal, "clientId" | "originCity" | "destinationCity" | "signataireNom" | "totalFcfa"> {
  // Devis complet et valide par défaut — chaque test retire ce qu'il veut invalider.
  // `as unknown as` bypasses exactOptionalPropertyTypes on the spread result.
  return {
    clientId: "client-1",
    originCity: "Niamey",
    destinationCity: "Ouagadougou",
    signataireNom: "Amadou Maiga",
    totalFcfa: 1_000_000,
    ...overrides,
  } as unknown as Pick<QuoteLocal, "clientId" | "originCity" | "destinationCity" | "signataireNom" | "totalFcfa">;
}

function makeLine(): Pick<QuoteLineLocal, "id"> {
  return { id: "line-1" };
}

describe("VALID_TRANSITIONS (AC1 — machine à états)", () => {
  it("définit les transitions conformément au diagramme FR-15", () => {
    expect(VALID_TRANSITIONS.draft).toEqual(["validated", "cancelled"]);
    expect(VALID_TRANSITIONS.validated).toEqual(["sent", "cancelled"]);
    expect(VALID_TRANSITIONS.sent).toEqual(["accepted", "expired", "cancelled"]);
    expect(VALID_TRANSITIONS.accepted).toEqual([]);
    expect(VALID_TRANSITIONS.expired).toEqual([]);
    expect(VALID_TRANSITIONS.cancelled).toEqual([]);
  });

  it("expose les 6 statuts du cycle de vie", () => {
    expect(ALL_STATUSES).toEqual([
      "draft",
      "validated",
      "sent",
      "accepted",
      "expired",
      "cancelled",
    ]);
  });
});

describe("isTerminalStatus (AC1)", () => {
  it("marque Accepté / Expiré / Annulé comme terminaux", () => {
    expect(isTerminalStatus("accepted")).toBe(true);
    expect(isTerminalStatus("expired")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
  });

  it("laisse Brouillon / Validé / Envoyé non terminaux", () => {
    expect(isTerminalStatus("draft")).toBe(false);
    expect(isTerminalStatus("validated")).toBe(false);
    expect(isTerminalStatus("sent")).toBe(false);
  });
});

describe("canTransition (AC1)", () => {
  it("autorise les transitions listées dans VALID_TRANSITIONS", () => {
    expect(canTransition("draft", "validated")).toBe(true);
    expect(canTransition("draft", "cancelled")).toBe(true);
    expect(canTransition("validated", "sent")).toBe(true);
    expect(canTransition("sent", "accepted")).toBe(true);
    expect(canTransition("sent", "expired")).toBe(true);
  });

  it("refuse les transitions non listées (ex : retour en arrière)", () => {
    expect(canTransition("validated", "draft")).toBe(false);
    expect(canTransition("sent", "validated")).toBe(false);
    expect(canTransition("accepted", "draft")).toBe(false);
    // Transition vers soi-même interdite
    expect(canTransition("draft", "draft")).toBe(false);
  });

  it("refuse toute transition depuis un statut terminal (AC1)", () => {
    expect(canTransition("accepted", "draft")).toBe(false);
    expect(canTransition("expired", "draft")).toBe(false);
    expect(canTransition("cancelled", "draft")).toBe(false);
    expect(canTransition("accepted", "cancelled")).toBe(false);
  });

  it("refuse la transition directe Brouillon → Envoyé (saut d'étape)", () => {
    expect(canTransition("draft", "sent")).toBe(false);
  });
});

describe("validateDraftToValidated (AC3 — validation complète)", () => {
  it("renvoie [] pour un devis complet", () => {
    expect(validateDraftToValidated(makeQuote(), [makeLine()])).toEqual([]);
  });

  it("détecte un client manquant (missingClient)", () => {
    const errors = validateDraftToValidated(makeQuote({ clientId: undefined }), [makeLine()]);
    expect(errors).toContain("missingClient");
    expect(errors).toHaveLength(1);
  });

  it("détecte l'absence de lignes de prestation (missingLines)", () => {
    const errors = validateDraftToValidated(makeQuote(), []);
    expect(errors).toContain("missingLines");
    expect(errors).toHaveLength(1);
  });

  it("détecte un total nul (zeroTotal)", () => {
    const errors = validateDraftToValidated(makeQuote({ totalFcfa: 0 }), [makeLine()]);
    expect(errors).toContain("zeroTotal");
    expect(errors).toHaveLength(1);
  });

  it("détecte un total négatif comme invalide (zeroTotal)", () => {
    const errors = validateDraftToValidated(makeQuote({ totalFcfa: -500 }), [makeLine()]);
    expect(errors).toContain("zeroTotal");
  });

  it("détecte un trajet incomplet (missingRoute) — ville d'origine manquante", () => {
    const errors = validateDraftToValidated(
      makeQuote({ originCity: "" }),
      [makeLine()]
    );
    expect(errors).toContain("missingRoute");
    expect(errors).toHaveLength(1);
  });

  it("detects route whitespace-only values (missingRoute)", () => {
    const errors = validateDraftToValidated(
      makeQuote({ originCity: "   ", destinationCity: "	" }),
      [makeLine()]
    );
    expect(errors).toContain("missingRoute");
    expect(errors).toHaveLength(1);
  });

  it("détecte un trajet incomplet (missingRoute) — destination manquante", () => {
    const errors = validateDraftToValidated(
      makeQuote({ destinationCity: undefined }),
      [makeLine()]
    );
    expect(errors).toContain("missingRoute");
    expect(errors).toHaveLength(1);
  });

  it("detects signatory whitespace-only values (missingSignatory)", () => {
    const errors = validateDraftToValidated(
      makeQuote({ signataireNom: "   " }),
      [makeLine()]
    );
    expect(errors).toContain("missingSignatory");
    expect(errors).toHaveLength(1);
  });

  it("détecte un signataire manquant (missingSignatory)", () => {
    const errors = validateDraftToValidated(
      makeQuote({ signataireNom: undefined }),
      [makeLine()]
    );
    expect(errors).toContain("missingSignatory");
    expect(errors).toHaveLength(1);
  });

  it("accumule plusieurs erreurs simultanées", () => {
    const errors = validateDraftToValidated(
      makeQuote({
        clientId: undefined,
        signataireNom: "",
        totalFcfa: 0,
        originCity: undefined,
      }),
      []
    );
    // 5 erreurs : client, route, signataire, lignes, total
    expect(errors).toHaveLength(5);
    expect(errors).toEqual(expect.arrayContaining([...DRAFT_VALIDATION_ERROR_CODES]));
  });

  it("renvoie toutes les erreurs si le devis est introuvable (undefined)", () => {
    const errors = validateDraftToValidated(undefined, [makeLine()]);
    expect(errors).toEqual(expect.arrayContaining([...DRAFT_VALIDATION_ERROR_CODES]));
    expect(errors).toHaveLength(DRAFT_VALIDATION_ERROR_CODES.length);
  });

  it("DRAFT_VALIDATION_ERROR_CODES est l'ensemble canonique des codes", () => {
    expect(DRAFT_VALIDATION_ERROR_CODES).toEqual([
      "missingClient",
      "missingLines",
      "zeroTotal",
      "missingRoute",
      "missingSignatory",
    ]);
  });
});
