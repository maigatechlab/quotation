import "fake-indexeddb/auto";

import { describe, it, expect } from "vitest";
import { db } from "@/lib/local-db";
import { openSwSyncDb } from "./sw-db";

// P7 — version concordance guard (code review 2026-06-27).
// If this test fails, update openSwSyncDb() in sw-db.ts to match the new
// version declared in local-db.ts, then update this test comment.
describe("openSwSyncDb — version concordance with local-db.ts", () => {
  it("declares the same max schema version as local-db.ts", () => {
    const swDb = openSwSyncDb();
    // Dexie.verno reflects the highest version() declaration without opening the DB.
    expect(swDb.verno).toBe(db.verno);
  });
});
