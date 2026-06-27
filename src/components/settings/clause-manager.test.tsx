import "fake-indexeddb/auto";

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import type { ClauseLocal } from "@/lib/local-db";
import frNE from "@/messages/fr-NE.json";
import { ClauseManager } from "./clause-manager";

const now = "2026-06-27T00:00:00.000Z";

/**
 * Minimal ClauseLocal seed. `categorie` is intentionally omitted by default
 * to exercise the uncategorized bucket; tests that need a category spread it
 * in explicitly (exactOptionalPropertyTypes forbids `categorie: undefined`).
 */
function makeClause(overrides: Partial<ClauseLocal> = {}): ClauseLocal {
  return {
    id: "clause-1",
    titre: "Force majeure",
    contenu: "Le transporteur n'est pas responsable des retards dus à force majeure.",
    pays: "NE",
    revision: 0,
    updatedAt: now,
    createdAt: now,
    ...overrides,
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

/** Clicks the "Ajouter une clause" / "Modifier" / "Enregistrer" buttons by label. */
function button(container: HTMLElement, label: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!btn) throw new Error(`Button "${label}" not found`);
  return btn as HTMLButtonElement;
}

describe("ClauseManager", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    mocks.toastSuccess.mockReset();
    mocks.triggerSync.mockReset();
  });

  afterEach(() => {
    cleanup();
    db.close();
  });

  it("affiche l'état vide lorsqu'aucune clause n'existe (AC1)", async () => {
    const { container } = render(withIntl(<ClauseManager userId="user-1" />));

    await waitFor(() => {
      expect(container.textContent).toContain("Aucune clause définie.");
    });
    // "Ajouter une clause" button is visible.
    expect(button(container, "Ajouter une clause")).toBeTruthy();
  });

  it("affiche et groupe les clauses existantes par catégorie (AC1)", async () => {
    await db.clauses.bulkPut([
      makeClause({ id: "c-paiement", titre: "Délai de paiement", categorie: "Paiement" }),
      makeClause({ id: "c-resp", titre: "Responsabilité", categorie: "Responsabilité" }),
      makeClause({ id: "c-none", titre: "Sans cat", contenu: "Contenu court." }),
    ]);

    const { container } = render(withIntl(<ClauseManager userId="user-1" />));

    await waitFor(() => {
      // Three clause cards rendered.
      const cards = container.querySelectorAll(".rounded-xl.border.border-border.bg-surface");
      expect(cards.length).toBe(3);
    });

    // Categories appear as group headers in predefined order, uncategorized last.
    expect(container.textContent).toContain("Paiement");
    expect(container.textContent).toContain("Responsabilité");
    expect(container.textContent).toContain("Sans catégorie");
  });

  it("tronque l'extrait du contenu à 80 caractères dans la liste (AC1)", async () => {
    const longContenu = "A".repeat(120);
    await db.clauses.put(makeClause({ id: "c-long", contenu: longContenu }));

    const { container } = render(withIntl(<ClauseManager userId="user-1" />));

    await waitFor(() => {
      const extrait = container.querySelector(".line-clamp-2");
      expect(extrait?.textContent).toBe(`${"A".repeat(80)}…`);
    });
  });

  it("crée une clause : persiste db.clauses.put, SyncOp create, toast, triggerSync (AC2)", async () => {
    const { container } = render(withIntl(<ClauseManager userId="user-1" />));

    fireEvent.click(button(container, "Ajouter une clause"));

    const titreInput = container.querySelector("#clause-titre") as HTMLInputElement;
    const contenuTextarea = container.querySelector(
      "#clause-contenu",
    ) as HTMLTextAreaElement;
    const categorieInput = container.querySelector(
      "#clause-categorie",
    ) as HTMLInputElement;

    fireEvent.change(titreInput, { target: { value: "Assurance marchandise" } });
    fireEvent.change(contenuTextarea, {
      target: { value: "La marchandise est assurée à 100% de sa valeur." },
    });
    fireEvent.change(categorieInput, { target: { value: "Paiement" } });

    fireEvent.click(button(container, "Enregistrer"));

    await waitFor(async () => {
      // Clause persisted in Dexie.
      const all = await db.clauses.toArray();
      expect(all).toHaveLength(1);
      const stored = all[0];
      expect(stored?.titre).toBe("Assurance marchandise");
      expect(stored?.contenu).toBe("La marchandise est assurée à 100% de sa valeur.");
      expect(stored?.categorie).toBe("Paiement");
      expect(stored?.pays).toBe("NE");
      expect(stored?.revision).toBe(0);

      // SyncOp enqueued for "clause" create.
      const ops = await db.syncQueue.toArray();
      expect(ops).toHaveLength(1);
      expect(ops[0]?.entity).toBe("clause");
      expect(ops[0]?.entityId).toBe(stored?.id);
      expect(ops[0]?.type).toBe("create");

      // Toast confirmation + background sync registered.
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Clause « Assurance marchandise » créée',
        expect.anything(),
      );
      expect(mocks.triggerSync).toHaveBeenCalled();
    });
  });

  it("n'inclut pas categorie dans le SyncOp ni dans Dexie quand elle est vide (exactOptionalPropertyTypes, AC2)", async () => {
    const { container } = render(withIntl(<ClauseManager userId="user-1" />));

    fireEvent.click(button(container, "Ajouter une clause"));

    fireEvent.change(container.querySelector("#clause-titre")!, {
      target: { value: "Clause sans cat" },
    });
    fireEvent.change(container.querySelector("#clause-contenu")!, {
      target: { value: "Contenu de la clause." },
    });
    // categorie left empty on purpose.

    fireEvent.click(button(container, "Enregistrer"));

    await waitFor(async () => {
      const stored = await db.clauses.toArray();
      expect(stored[0]?.categorie).toBeUndefined();

      const ops = await db.syncQueue.toArray();
      expect(ops[0]?.payload).not.toHaveProperty("categorie");
    });
  });

  it("modifie une clause existante : update + revision lue avant, triggerSync, toast (AC3)", async () => {
    await db.clauses.put(makeClause({ id: "c-edit", revision: 2 }));

    const { container } = render(withIntl(<ClauseManager userId="user-1" />));

    await waitFor(() => {
      expect(button(container, "Modifier")).toBeTruthy();
    });
    fireEvent.click(button(container, "Modifier"));

    const titreInput = container.querySelector("#clause-titre") as HTMLInputElement;
    await waitFor(() => {
      // Form prefilled with existing values.
      expect(titreInput.value).toBe("Force majeure");
    });

    fireEvent.change(titreInput, { target: { value: "Force majeure étendue" } });
    fireEvent.click(button(container, "Enregistrer"));

    await waitFor(async () => {
      const stored = await db.clauses.get("c-edit");
      expect(stored?.titre).toBe("Force majeure étendue");

      const ops = await db.syncQueue.toArray();
      expect(ops).toHaveLength(1);
      expect(ops[0]?.type).toBe("update");
      expect(ops[0]?.entity).toBe("clause");
      // baseRevision must reflect the revision read BEFORE the mutation.
      expect(ops[0]?.baseRevision).toBe(2);

      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Clause mise à jour",
        expect.anything(),
      );
      expect(mocks.triggerSync).toHaveBeenCalled();
    });
  });

  it("supprime une clause : db.clauses.delete + SyncOp delete, disparait de la liste (AC4)", async () => {
    await db.clauses.put(makeClause({ id: "c-del", revision: 1 }));

    const { container } = render(withIntl(<ClauseManager userId="user-1" />));

    await waitFor(() => {
      expect(button(container, "Supprimer")).toBeTruthy();
    });
    fireEvent.click(button(container, "Supprimer"));

    await waitFor(async () => {
      // Hard-deleted from Dexie.
      const remaining = await db.clauses.toArray();
      expect(remaining).toHaveLength(0);

      // SyncOp delete enqueued with the revision read before deletion.
      const ops = await db.syncQueue.toArray();
      expect(ops).toHaveLength(1);
      expect(ops[0]?.type).toBe("delete");
      expect(ops[0]?.entity).toBe("clause");
      expect(ops[0]?.entityId).toBe("c-del");
      expect(ops[0]?.baseRevision).toBe(1);
      expect(ops[0]?.payload).toEqual({});

      expect(mocks.triggerSync).toHaveBeenCalled();
    });

    // Clause disappears from the list.
    await waitFor(() => {
      expect(container.textContent).toContain("Aucune clause définie.");
    });
  });

  it("valide les champs obligatoires : titre et contenu requis (AC2)", async () => {
    const { container } = render(withIntl(<ClauseManager userId="user-1" />));

    fireEvent.click(button(container, "Ajouter une clause"));
    fireEvent.click(button(container, "Enregistrer"));

    await waitFor(() => {
      expect(container.textContent).toContain("Le titre est requis");
      expect(container.textContent).toContain("Le contenu est requis");
    });

    // Nothing persisted, no sync op.
    const all = await db.clauses.toArray();
    expect(all).toHaveLength(0);
    const ops = await db.syncQueue.toArray();
    expect(ops).toHaveLength(0);
  });

  it("bloque la saisie au-delà de 2000 caractères et affiche un compteur (AC2)", async () => {
    const { container } = render(withIntl(<ClauseManager userId="user-1" />));

    fireEvent.click(button(container, "Ajouter une clause"));

    const textarea = container.querySelector(
      "#clause-contenu",
    ) as HTMLTextAreaElement;

    // 2000 chars accepted.
    fireEvent.change(textarea, { target: { value: "X".repeat(2000) } });
    expect(textarea.value.length).toBe(2000);
    expect(container.textContent).toContain("2000/2000");

    // Attempting to exceed 2000 is rejected by the controlled-input guard:
    // the value stays capped at the previous length.
    fireEvent.change(textarea, { target: { value: "X".repeat(2001) } });
    expect(textarea.value.length).toBe(2000);
  });
});
