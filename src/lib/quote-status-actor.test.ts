import { describe, expect, it } from "vitest";
import { resolveActorLabel, type UsersById } from "@/lib/quote-status-actor";

const labels = { deleted: "Utilisateur supprimé", unknown: "Utilisateur inconnu" };

describe("resolveActorLabel", () => {
  it("returns the changedByName snapshot when present (nominal case)", () => {
    const label = resolveActorLabel(
      { changedBy: "user-1", changedByName: "Amadou Maiga" },
      null,
      labels
    );
    expect(label).toBe("Amadou Maiga");
  });

  it("resolves legacy entries (no snapshot) via the loaded users map", () => {
    const usersById: UsersById = new Map([
      ["user-1", { name: "Amadou Maiga", email: "amadou@maiga.ne" }],
    ]);
    const label = resolveActorLabel({ changedBy: "user-1" }, usersById, labels);
    expect(label).toBe("Amadou Maiga");
  });

  it("falls back to email when the resolved user has no name", () => {
    const usersById: UsersById = new Map([["user-1", { name: "", email: "amadou@maiga.ne" }]]);
    const label = resolveActorLabel({ changedBy: "user-1" }, usersById, labels);
    expect(label).toBe("amadou@maiga.ne");
  });

  it("returns the deleted-user label when the map loaded but does not contain the id", () => {
    const usersById: UsersById = new Map();
    const label = resolveActorLabel({ changedBy: "user-gone" }, usersById, labels);
    expect(label).toBe("Utilisateur supprimé");
  });

  it("returns the neutral unknown label when the map was never loaded (no permission / offline / failed)", () => {
    const label = resolveActorLabel({ changedBy: "user-1" }, null, labels);
    expect(label).toBe("Utilisateur inconnu");
  });

  it("returns undefined when there is no actor at all", () => {
    const label = resolveActorLabel({}, null, labels);
    expect(label).toBeUndefined();
  });
});
