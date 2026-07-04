import "fake-indexeddb/auto";

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import type { ClauseLocal, CompanyLocal, QuoteLocal } from "@/lib/local-db";
import frNE from "@/messages/fr-NE.json";
import { WizardStepConditions } from "./wizard-step-conditions";

const now = "2026-06-27T00:00:00.000Z";

const company: CompanyLocal = {
  id: "company-1",
  raisonSociale: "Maiga Transport SARL",
  rccm: "NE-NIA-2023-B-1234",
  nif: "12345678",
  phones: ["+227 90 00 00 00"],
  emails: ["contact@maiga.ne"],
  pays: "NE",
  revision: 1,
  updatedAt: now,
  createdAt: now,
  conditionsPaiementDefaut: "Défaut société 30j",
};

const baseQuote: QuoteLocal = {
  id: "quote-1",
  number: "DEV-2026-001",
  clientId: "client-1",
  companyId: "company-1",
  objet: "Transport ciment",
  dateDevis: now,
  totalFcfa: 0,
  status: "draft",
  pays: "NE",
  ownerId: "user-1",
  revision: 2,
  updatedAt: now,
  createdAt: now,
};

const clauses: ClauseLocal[] = [
  {
    id: "clause-paiement",
    titre: "Paiement",
    contenu: "Paiement à réception de facture sous 30 jours.",
    categorie: "paiement",
    companyId: "company-1",
    pays: "NE",
    revision: 0,
    updatedAt: now,
    createdAt: now,
  },
  {
    id: "clause-assurance",
    titre: "Assurance",
    contenu: "Marchandise assurée tous risques pendant le transport.",
    categorie: "responsabilité",
    companyId: "company-1",
    pays: "NE",
    revision: 0,
    updatedAt: now,
    createdAt: now,
  },
  {
    id: "clause-litige",
    titre: "Litige",
    contenu: "Tout litige relève du tribunal de commerce de Niamey.",
    categorie: "responsabilité",
    companyId: "company-1",
    pays: "NE",
    revision: 0,
    updatedAt: now,
    createdAt: now,
  },
];

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toastSuccess: vi.fn(),
  triggerSync: vi.fn(),
  setStep: vi.fn(),
  resetWizard: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/stores/wizard-store", () => ({
  useWizardStore: () => ({
    quoteId: "quote-1",
    step: 5,
    setStep: mocks.setStep,
    resetWizard: mocks.resetWizard,
  }),
}));

vi.mock("@/lib/sync/outbox", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/sync/outbox")
  >("@/lib/sync/outbox");
  return {
    ...actual,
    triggerSync: (...args: unknown[]) => mocks.triggerSync(...args),
  };
});

function withIntl(node: ReactNode) {
  return (
    <NextIntlClientProvider messages={frNE} locale="fr-NE">
      {node}
    </NextIntlClientProvider>
  );
}

describe("WizardStepConditions", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.company.put(company);
    await db.quotes.put(baseQuote);
    mocks.push.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.triggerSync.mockReset();
    mocks.setStep.mockReset();
    mocks.resetWizard.mockReset();
  });

  afterEach(() => {
    cleanup();
    db.close();
  });

  it("pré-remplit depuis QuoteLocal.conditionsPaiement en priorité sur le défaut société (AC3)", async () => {
    await db.quotes.put({ ...baseQuote, conditionsPaiement: "Conditions devis spécifiques" });

    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      const textarea = container.querySelector(
        "#conditionsPaiement",
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("Conditions devis spécifiques");
    });
  });

  it("falleback sur conditionsPaiementDefaut de la société si le devis n'a pas de conditions (AC3)", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      const textarea = container.querySelector(
        "#conditionsPaiement",
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("Défaut société 30j");
    });
  });

  it("Terminer persiste conditionsPaiement sur le devis, envoie toast, resetWizard et redirige vers /devis (AC4)", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    // Wait for preload.
    await waitFor(() => {
      const textarea = container.querySelector(
        "#conditionsPaiement",
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("Défaut société 30j");
    });

    const textarea = container.querySelector(
      "#conditionsPaiement",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Paiement à réception" } });

    // Click the "Terminer" button (primary, bg-brand-navy).
    const buttons = container.querySelectorAll("button");
    const finishBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Terminer"),
    ) as HTMLButtonElement;
    fireEvent.click(finishBtn);

    await waitFor(async () => {
      const stored = await db.quotes.get("quote-1");
      expect(stored?.conditionsPaiement).toBe("Paiement à réception");
      expect(stored?.revision).toBe(3);

      const ops = await db.syncQueue.toArray();
      expect(ops).toHaveLength(1);
      expect(ops[0]?.entity).toBe("quote");
      expect(ops[0]?.type).toBe("update");

      expect(mocks.toastSuccess).toHaveBeenCalledWith("Devis sauvegardé");
      expect(mocks.resetWizard).toHaveBeenCalled();
      expect(mocks.triggerSync).toHaveBeenCalled();
      expect(mocks.push).toHaveBeenCalledWith("/devis");
    });
  });

  it("accepte des conditions vides — le devis reste valide (AC5)", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      const textarea = container.querySelector(
        "#conditionsPaiement",
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("Défaut société 30j");
    });

    const textarea = container.querySelector(
      "#conditionsPaiement",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "" } });

    const buttons = container.querySelectorAll("button");
    const finishBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Terminer"),
    ) as HTMLButtonElement;
    fireEvent.click(finishBtn);

    await waitFor(async () => {
      const stored = await db.quotes.get("quote-1");
      // Empty string trimmed to "" persisted (optional field).
      expect(stored?.conditionsPaiement).toBe("");
      expect(mocks.push).toHaveBeenCalledWith("/devis");
    });
  });

  it("Précédent appelle setStep(4) sans persister", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      expect(
        (container.querySelector("#conditionsPaiement") as HTMLTextAreaElement)
          .value,
      ).toBe("Défaut société 30j");
    });

    const buttons = container.querySelectorAll("button");
    const prevBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Précédent"),
    ) as HTMLButtonElement;
    fireEvent.click(prevBtn);

    expect(mocks.setStep).toHaveBeenCalledWith(4);
    expect(mocks.triggerSync).not.toHaveBeenCalled();
  });
});

describe("WizardStepConditions — clauses contractuelles (Story 3.8)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.company.put(company);
    await db.quotes.put(baseQuote);
    await db.clauses.bulkPut(clauses);
    mocks.push.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.triggerSync.mockReset();
    mocks.setStep.mockReset();
    mocks.resetWizard.mockReset();
  });

  afterEach(() => {
    cleanup();
    db.close();
  });

  // Helper : récupère la checkbox-tile d'une clause par son aria-label.
  function findClauseTile(container: HTMLElement, titre: string) {
    const tiles = container.querySelectorAll('button[role="checkbox"]');
    return Array.from(tiles).find((b) =>
      b.getAttribute("aria-label") === titre,
    ) as HTMLButtonElement | undefined;
  }

  it("affiche les clauses disponibles en checkbox tiles groupées (AC1)", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    // Le heading "Clauses contractuelles" est rendu.
    await waitFor(() => {
      expect(container.textContent).toContain("Clauses contractuelles");
    });

    // Chaque clause est présente en tant que checkbox tile.
    expect(findClauseTile(container, "Paiement")).toBeDefined();
    expect(findClauseTile(container, "Assurance")).toBeDefined();
    expect(findClauseTile(container, "Litige")).toBeDefined();

    // Le titre et un extrait du contenu (≤80 chars) sont visibles.
    expect(container.textContent).toContain("Paiement à réception de facture sous 30 jours.");
  });

  it("la multi-sélection bascule aria-checked et l'ordre est conservé (AC1, AC2)", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      expect(findClauseTile(container, "Paiement")).toBeDefined();
    });

    const paiement = findClauseTile(container, "Paiement")!;
    const assurance = findClauseTile(container, "Assurance")!;

    expect(paiement.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(paiement);
    await waitFor(() => {
      expect(paiement.getAttribute("aria-checked")).toBe("true");
    });

    fireEvent.click(assurance);
    await waitFor(() => {
      expect(assurance.getAttribute("aria-checked")).toBe("true");
    });

    // Compteur "2 clauses sélectionnées" (AC1 — multi-sélection).
    await waitFor(() => {
      expect(container.textContent).toContain("2 clauses sélectionnées");
    });

    // Section ordre affiche les deux titres dans l'ordre de clic.
    const orderSection = container.querySelector('[data-testid="clause-order"]');
    expect(orderSection?.textContent).toContain("Paiement");
    expect(orderSection?.textContent).toContain("Assurance");
    // Paiement (cliqué en premier) doit apparaître avant Assurance.
    expect(
      (orderSection?.textContent ?? "").indexOf("Paiement"),
    ).toBeLessThan((orderSection?.textContent ?? "").indexOf("Assurance"));
  });

  it("décocher retire la clause de la sélection", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      expect(findClauseTile(container, "Paiement")).toBeDefined();
    });

    const paiement = findClauseTile(container, "Paiement")!;
    fireEvent.click(paiement);
    await waitFor(() =>
      expect(paiement.getAttribute("aria-checked")).toBe("true"),
    );
    fireEvent.click(paiement);
    await waitFor(() =>
      expect(paiement.getAttribute("aria-checked")).toBe("false"),
    );

    // Plus aucune clause sélectionnée.
    expect(container.textContent).toContain("0 clause sélectionnée");
  });

  it("Terminer persiste les QuoteClauses dans db.quoteClauses avec ordre (AC2)", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      expect(findClauseTile(container, "Paiement")).toBeDefined();
    });

    fireEvent.click(findClauseTile(container, "Assurance")!);
    fireEvent.click(findClauseTile(container, "Paiement")!);

    // Wait for the order list to reflect both selections.
    await waitFor(() => {
      expect(container.textContent).toContain("2 clauses sélectionnées");
    });

    const finishBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Terminer"),
    ) as HTMLButtonElement;
    fireEvent.click(finishBtn);

    await waitFor(async () => {
      const rows = await db.quoteClauses
        .where("quoteId")
        .equals("quote-1")
        .sortBy("ordre");
      expect(rows).toHaveLength(2);
      // Ordre de sélection : Assurance puis Paiement.
      expect(rows[0]?.clauseId).toBe("clause-assurance");
      expect(rows[0]?.titre).toBe("Assurance");
      expect(rows[1]?.clauseId).toBe("clause-paiement");
      expect(rows[1]?.titre).toBe("Paiement");
      expect(rows[0]?.ordre).toBe(0);
      expect(rows[1]?.ordre).toBe(1);
    });

    expect(mocks.resetWizard).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/devis");
  });

  it("clause spécifique est saisie, ajoutée après les standards et persistée (AC3)", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      expect(findClauseTile(container, "Paiement")).toBeDefined();
    });

    // Sélectionne une clause standard en premier.
    fireEvent.click(findClauseTile(container, "Paiement")!);

    // Saisit une clause spécifique.
    const specific = container.querySelector(
      "#specificClause",
    ) as HTMLTextAreaElement;
    fireEvent.change(specific, {
      target: { value: "Garantieantievol de 1% de la valeur déclarée." },
    });

    // Ajoute la clause spécifique à la sélection.
    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Ajouter",
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(container.textContent).toContain("2 clauses sélectionnées");
    });

    // Terminer.
    const finishBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Terminer"),
    ) as HTMLButtonElement;
    fireEvent.click(finishBtn);

    await waitFor(async () => {
      const rows = await db.quoteClauses
        .where("quoteId")
        .equals("quote-1")
        .sortBy("ordre");
      expect(rows).toHaveLength(2);
      // Standard d'abord.
      expect(rows[0]?.clauseId).toBe("clause-paiement");
      // Spécifique ensuite : clauseId absent, contenu figé.
      expect(rows[1]?.clauseId).toBeUndefined();
      expect(rows[1]?.contenu).toBe(
        "Garantieantievol de 1% de la valeur déclarée.",
      );
      expect(rows[1]?.ordre).toBe(1);
    });
  });

  it('"Enregistrer comme modèle" crée une clause dans db.clauses et lie la quoteClause (AC3)', async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      expect(findClauseTile(container, "Paiement")).toBeDefined();
    });

    const specific = container.querySelector(
      "#specificClause",
    ) as HTMLTextAreaElement;
    fireEvent.change(specific, {
      target: { value: "Clause personnalisée à réutiliser." },
    });

    // Coche "Enregistrer comme modèle".
    const saveCheckbox = container.querySelector(
      "#saveAsTemplate",
    ) as HTMLInputElement;
    fireEvent.click(saveCheckbox);
    expect(saveCheckbox.checked).toBe(true);

    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Ajouter",
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);

    const finishBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Terminer"),
    ) as HTMLButtonElement;
    fireEvent.click(finishBtn);

    await waitFor(async () => {
      // Une nouvelle clause a été créée dans la bibliothèque.
      const libClauses = await db.clauses.toArray();
      const newClause = libClauses.find(
        (c) => c.contenu === "Clause personnalisée à réutiliser.",
      );
      expect(newClause).toBeDefined();

      // La quoteClause est liée à cette nouvelle clause (clauseId renseigné).
      const rows = await db.quoteClauses
        .where("quoteId")
        .equals("quote-1")
        .toArray();
      const specificRow = rows.find((r) => r.contenu === "Clause personnalisée à réutiliser.");
      expect(specificRow?.clauseId).toBe(newClause?.id);
    });
  });

  it("réordonnancement ↑/↓ met à jour l'ordre avant persistance (AC4)", async () => {
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      expect(findClauseTile(container, "Paiement")).toBeDefined();
    });

    fireEvent.click(findClauseTile(container, "Assurance")!);
    fireEvent.click(findClauseTile(container, "Paiement")!);

    const orderSection = container.querySelector(
      '[data-testid="clause-order"]',
    )!;
    // La première ligne (Assurance) a un bouton "Déplacer vers le bas".
    const moveDownBtn = Array.from(
      orderSection.querySelectorAll('button[aria-label="Déplacer vers le bas"]'),
    )[0] as HTMLButtonElement;
    fireEvent.click(moveDownBtn);

    // Après déplacement, Paiement doit maintenant précéder Assurance.
    await waitFor(() => {
      const updated = container.querySelector(
        '[data-testid="clause-order"]',
      )!;
      const text = updated.textContent ?? "";
      expect(text.indexOf("Paiement")).toBeLessThan(text.indexOf("Assurance"));
    });

    // Persister et vérifier l'ordre final.
    const finishBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Terminer"),
    ) as HTMLButtonElement;
    fireEvent.click(finishBtn);

    await waitFor(async () => {
      const rows = await db.quoteClauses
        .where("quoteId")
        .equals("quote-1")
        .sortBy("ordre");
      expect(rows).toHaveLength(2);
      expect(rows[0]?.titre).toBe("Paiement");
      expect(rows[1]?.titre).toBe("Assurance");
    });
  });

  it("aucune clause disponible affiche le message empty et le devis reste valide (AC5)", async () => {
    await db.clauses.clear();

    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      expect(container.textContent).toContain("Aucune clause définie");
    });

    // Terminer sans clause : devis valide.
    const finishBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Terminer"),
    ) as HTMLButtonElement;
    fireEvent.click(finishBtn);

    await waitFor(async () => {
      const rows = await db.quoteClauses
        .where("quoteId")
        .equals("quote-1")
        .toArray();
      expect(rows).toHaveLength(0);
      expect(mocks.push).toHaveBeenCalledWith("/devis");
    });
  });

  it("les clauses sont disponibles hors-ligne depuis db.clauses (AC6)", async () => {
    // Pas de réseau — mais les clauses sont déjà en base (simule une synchro précédente).
    const { container } = render(
      withIntl(<WizardStepConditions userId="user-1" company={company} />),
    );

    await waitFor(() => {
      expect(findClauseTile(container, "Paiement")).toBeDefined();
    });
    expect(findClauseTile(container, "Assurance")).toBeDefined();
    expect(findClauseTile(container, "Litige")).toBeDefined();
  });
});
