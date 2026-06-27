import Dexie from "dexie";

// SW-side Dexie handle for the shared "quotation-local" IndexedDB.
// No "use client" — importable from the Service Worker context.
//
// Version chain MUST mirror local-db.ts exactly.
// A test (sw-db.test.ts) enforces concordance — update both files together
// whenever local-db.ts declares a new schema version.
export function openSwSyncDb(): Dexie {
  const swDb = new Dexie("quotation-local");
  swDb.version(1).stores({
    clients: "id, companyName, phone, city, ownerId, companyId, deletedAt, revision",
    quotes: "id, number, status, clientId, ownerId, companyId, dateDevis, revision",
    quoteLines: "id, quoteId, ordre, companyId, pays, revision",
    clauses: "id, categorie, companyId, pays, revision",
    templates: "id, nom, companyId, pays, revision",
    company: "id, companyId, revision",
    syncQueue: "opId, entity, entityId, queuedAt",
    auditMirror: "id, entityType, entityId, who, synced",
  });
  swDb.version(2).stores({
    syncQueue: "opId, entity, entityId, queuedAt, failed, retryCount",
  });
  swDb.version(3).stores({
    quoteClauses: "id, quoteId, ordre, companyId, pays, revision",
  });
  swDb.version(4).stores({
    quoteStatusLogs: "id, quoteId, changedAt",
  });
  swDb.version(5).stores({
    routeTemplates: "id, nom, companyId, pays, deletedAt, revision",
  });
  return swDb;
}
