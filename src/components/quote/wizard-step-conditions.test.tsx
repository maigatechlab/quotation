import "fake-indexeddb/auto";

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WizardStepConditions } from "./wizard-step-conditions";
import { db } from "@/lib/local-db";
import type { CompanyLocal, QuoteLocal } from "@/lib/local-db";

import frNE from "@/messages/fr-NE.json";

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
