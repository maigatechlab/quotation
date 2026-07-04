import "fake-indexeddb/auto";

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import type { CompanyLocal } from "@/lib/local-db";
import frNE from "@/messages/fr-NE.json";
import { PaymentTermsForm } from "./payment-terms-form";

const now = "2026-06-27T00:00:00.000Z";

// Minimal but complete CompanyLocal seed (matches local-db.ts shape).
// `conditionsPaiementDefaut` is intentionally omitted to exercise the
// "no default terms yet" path (AC5). exactOptionalPropertyTypes forbids
// assigning `undefined`, so we build two distinct fixtures instead.
function makeCompany(): CompanyLocal {
  return {
    id: "company-1",
    raisonSociale: "Maiga Transport SARL",
    rccm: "NE-NIA-2023-B-1234",
    nif: "12345678",
    phones: ["+227 90 00 00 00"],
    emails: ["contact@maiga.ne"],
    pays: "NE",
    revision: 3,
    updatedAt: now,
    createdAt: now,
  };
}

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  triggerSync: vi.fn(),
}));

// sonner is mocked so tests don't depend on the real toast runtime.
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

// useLiveCompany returns the live Dexie record — in tests we want the SSR prop
// to win (component falls back to it when the hook returns null). Returning
// null exercises the props.company fallback path.
vi.mock("@/hooks/use-live-company", () => ({
  useLiveCompany: () => null,
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

describe("PaymentTermsForm", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.company.put(makeCompany());
    mocks.toastSuccess.mockReset();
    mocks.triggerSync.mockReset();
  });

  afterEach(() => {
    cleanup();
    db.close();
  });

  it("pré-remplit le champ avec conditionsPaiementDefaut de la société (AC1)", async () => {
    const company = { ...makeCompany(), conditionsPaiementDefaut: "30 jours fin de mois" };
    const { container } = render(
      withIntl(<PaymentTermsForm company={company} userId="user-1" />),
    );

    await waitFor(() => {
      const textarea = container.querySelector(
        "#conditionsPaiementDefaut",
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("30 jours fin de mois");
    });
  });

  it("soumet, persiste conditionsPaiementDefaut via db.company.put + SyncOp, toast, et triggerSync (AC2)", async () => {
    const company = makeCompany();

    const { container } = render(
      withIntl(<PaymentTermsForm company={company} userId="user-1" />),
    );

    const textarea = container.querySelector(
      "#conditionsPaiementDefaut",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Paiement comptant" } });

    const form = container.querySelector("form") as HTMLFormElement;
    await waitFor(() => fireEvent.submit(form));

    await waitFor(async () => {
      // Persisted in Dexie with the new value and incremented revision.
      const stored = await db.company.get("company-1");
      expect(stored?.conditionsPaiementDefaut).toBe("Paiement comptant");
      expect(stored?.revision).toBe(4);

      // SyncOp enqueued for "company" update.
      const ops = await db.syncQueue.toArray();
      expect(ops).toHaveLength(1);
      expect(ops[0]?.entity).toBe("company");
      expect(ops[0]?.entityId).toBe("company-1");
      expect(ops[0]?.type).toBe("update");

      // Toast confirmation + background sync registered.
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Conditions de paiement mises à jour",
        expect.anything(),
      );
      expect(mocks.triggerSync).toHaveBeenCalled();
    });
  });

  it("trim la saisie et autorise un champ vide (conditions supprimées)", async () => {
    const company = { ...makeCompany(), conditionsPaiementDefaut: "Anciennes conditions" };

    const { container } = render(
      withIntl(<PaymentTermsForm company={company} userId="user-1" />),
    );

    const textarea = container.querySelector(
      "#conditionsPaiementDefaut",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });

    const form = container.querySelector("form") as HTMLFormElement;
    await waitFor(() => fireEvent.submit(form));

    await waitFor(async () => {
      const stored = await db.company.get("company-1");
      // Empty (whitespace-only) input → conditions cleared (undefined), not stored as whitespace.
      expect(stored?.conditionsPaiementDefaut).toBeUndefined();
    });
  });
});
