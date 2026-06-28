// Field classification for at-rest encryption — Story 6.1 (NFR-S4, AC2).
//
// Maps each Dexie table name to the classified fields (PII / financial /
// commercial) that must be encrypted at rest. Index fields (id, status,
// clientId, companyId, ordre, revision, dates, …) are intentionally EXCLUDED so
// Dexie can keep indexing/querying them in plaintext.
//
// Tables not listed here (templates, routeTemplates, quoteStatusLogs,
// syncQueue, auditMirror) are NOT encrypted in MVP-1:
//   - syncQueue payloads must stay plaintext for the server push.
//   - auditMirror before/after is deferred to Story 6.3.
//   - The others are not enumerated as classified in AC2.
//
// Beyond the literal AC2 list we also encrypt two derived PII/commercial
// stores flagged in code review: quotes.clientSnapshot (a full plaintext copy
// of a client's PII) and quoteClauses.contenu (verbatim contract clause text
// mirroring the classified clauses.contenu). The encryption layer is
// transparent so these decrypt at every read site; the server still receives
// plaintext via the syncQueue payload, not these at-rest records.

export const CLASSIFIED_FIELDS: Record<string, readonly string[]> = {
  // PII
  clients: ["companyName", "contactName", "phone", "email", "address", "notes"],
  company: [
    "raisonSociale",
    "adresse",
    "phones",
    "emails",
    "signataireNom",
    "signataireFonction",
  ],
  // Financial + embedded client PII snapshot
  quotes: ["totalFcfa", "goodsValueFcfa", "unitPrice", "clientSnapshot"],
  // Commercial
  quoteLines: ["designation", "unitPrice", "totalFcfa"],
  clauses: ["contenu"],
  quoteClauses: ["contenu"],
};

export function classifiedFieldsFor(tableName: string): readonly string[] {
  return CLASSIFIED_FIELDS[tableName] ?? [];
}

export function hasClassifiedFields(tableName: string): boolean {
  return classifiedFieldsFor(tableName).length > 0;
}
