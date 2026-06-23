import { describe, expect, it } from "vitest";
import { can, requirePermission, PermissionError } from "@/lib/permissions";
import type { Role, Action } from "@/lib/permissions";

// ─── can() ────────────────────────────────────────────────────────────────────

describe("can() — Admin", () => {
  it("peut créer un devis", () => expect(can("admin", "quote.create")).toBe(true));
  it("peut modifier tout devis", () => expect(can("admin", "quote.update")).toBe(true));
  it("peut supprimer tout devis", () => expect(can("admin", "quote.delete")).toBe(true));
  it("peut gérer les utilisateurs", () => expect(can("admin", "user.manage")).toBe(true));
  it("peut modifier la société", () => expect(can("admin", "company.update")).toBe(true));
  it("peut gérer les clauses", () => expect(can("admin", "clause.create")).toBe(true));
});

describe("can() — Commercial", () => {
  it("peut créer un devis", () => expect(can("commercial", "quote.create")).toBe(true));
  it("peut lire tous les devis", () => expect(can("commercial", "quote.read")).toBe(true));
  it("peut modifier (own = true pour UI)", () => expect(can("commercial", "quote.update")).toBe(true));
  it("ne peut PAS supprimer un client", () => expect(can("commercial", "client.delete")).toBe(false));
  it("ne peut PAS modifier la société", () => expect(can("commercial", "company.update")).toBe(false));
  it("ne peut PAS gérer les utilisateurs", () => expect(can("commercial", "user.manage")).toBe(false));
  it("peut lire les clauses", () => expect(can("commercial", "clause.read")).toBe(true));
  it("ne peut PAS créer des clauses", () => expect(can("commercial", "clause.create")).toBe(false));
});

describe("can() — Opérateur", () => {
  it("peut lire les devis", () => expect(can("operateur", "quote.read")).toBe(true));
  it("ne peut PAS créer un devis", () => expect(can("operateur", "quote.create")).toBe(false));
  it("ne peut PAS modifier un devis", () => expect(can("operateur", "quote.update")).toBe(false));
  it("ne peut PAS modifier la société", () => expect(can("operateur", "company.update")).toBe(false));
  it("peut lire la société", () => expect(can("operateur", "company.read")).toBe(true));
  it("ne peut PAS gérer les utilisateurs", () => expect(can("operateur", "user.manage")).toBe(false));
});

// ─── requirePermission() ──────────────────────────────────────────────────────

describe("requirePermission() — Admin (pas de restriction ownership)", () => {
  it("ne lance pas pour quote.update sans ownerId (admin override)", () => {
    expect(() => requirePermission("admin", "quote.update")).not.toThrow();
  });

  it("ne lance pas pour user.manage", () => {
    expect(() => requirePermission("admin", "user.manage")).not.toThrow();
  });
});

describe("requirePermission() — Commercial ownership", () => {
  const userId = "user-123";
  const otherId = "user-456";

  it("quote.update sur sa propre ressource → OK", () => {
    expect(() =>
      requirePermission("commercial", "quote.update", userId, userId)
    ).not.toThrow();
  });

  it("quote.update sur ressource d'un autre → PermissionError", () => {
    expect(() =>
      requirePermission("commercial", "quote.update", otherId, userId)
    ).toThrow(PermissionError);
  });

  it("quote.delete sur ressource d'un autre → PermissionError", () => {
    expect(() =>
      requirePermission("commercial", "quote.delete", otherId, userId)
    ).toThrow(PermissionError);
  });

  it("quote.update sans ownerId → PermissionError", () => {
    expect(() =>
      requirePermission("commercial", "quote.update", undefined, userId)
    ).toThrow(PermissionError);
  });

  it("quote.create (pas de ownership) → OK sans ownerId", () => {
    expect(() => requirePermission("commercial", "quote.create")).not.toThrow();
  });

  it("user.manage → toujours PermissionError", () => {
    expect(() => requirePermission("commercial", "user.manage")).toThrow(
      PermissionError
    );
  });
});

describe("requirePermission() — Opérateur", () => {
  it("quote.create → PermissionError", () => {
    expect(() => requirePermission("operateur", "quote.create")).toThrow(
      PermissionError
    );
  });

  it("quote.read → OK", () => {
    expect(() => requirePermission("operateur", "quote.read")).not.toThrow();
  });
});

describe("PermissionError", () => {
  it("statusCode = 403", () => {
    const err = new PermissionError("quote.create" as Action);
    expect(err.statusCode).toBe(403);
  });

  it("message contient l'action", () => {
    const err = new PermissionError("quote.delete" as Action);
    expect(err.message).toContain("quote.delete");
  });

  it("instanceof PermissionError", () => {
    expect(
      (() => {
        try {
          requirePermission("operateur", "quote.create");
        } catch (e) {
          return e instanceof PermissionError;
        }
        return false;
      })()
    ).toBe(true);
  });
});

// ─── Exhaustivité matrice ─────────────────────────────────────────────────────

describe("can() — couverture complète des actions par rôle", () => {
  const roles: Role[] = ["admin", "commercial", "operateur"];
  const readActions: Action[] = [
    "quote.read",
    "client.read",
    "company.read",
    "clause.read",
    "template.read",
  ];

  it.each(roles)("rôle %s peut effectuer toutes les lectures", (role) => {
    for (const action of readActions) {
      expect(can(role, action)).toBe(true);
    }
  });

  const destructiveActions: Action[] = [
    "user.manage",
    "company.update",
    "clause.delete",
  ];

  it("seul Admin peut effectuer les actions destructrices sensibles", () => {
    for (const action of destructiveActions) {
      expect(can("admin", action)).toBe(true);
      expect(can("commercial", action)).toBe(false);
      expect(can("operateur", action)).toBe(false);
    }
  });
});
