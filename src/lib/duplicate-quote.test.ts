import { describe, expect, it, vi } from "vitest";
import type { QuoteClauseLocal, QuoteLineLocal, QuoteLocal } from "@/lib/local-db";
import { buildDuplicateQuoteData } from "./duplicate-quote";

vi.mock("@/lib/sync/numbering", () => ({
  getDeviceId: () => "TEST1234",
  getNextLocalSeq: () => 1,
  generateTempNumber: (deviceId: string, seq: number) =>
    `TEMP-${deviceId.slice(0, 4).toUpperCase()}-${String(seq).padStart(4, "0")}`,
}));

const now = new Date("2026-06-27T12:00:00.000Z");
const userId = "user-test-1";

const sourceQuote: QuoteLocal = {
  id: "quote-source-1",
  number: "DEV-2026-001",
  status: "validated",
  clientId: "client-1",
  clientSnapshot: { companyName: "SCTP Niger" },
  ownerId: "user-old",
  dateDevis: "2026-06-01T00:00:00.000Z",
  dateValidite: "2026-07-01T00:00:00.000Z",
  reference: "REF-2026-001",
  objet: "Transport de céréales",
  signataireNom: "Amadou Maiga",
  signataireFonction: "Directeur",
  conditionsPaiement: "30 jours",
  originCountry: "NE",
  originCity: "Niamey",
  destinationCountry: "BF",
  destinationCity: "Ouagadougou",
  goodsNature: "Céréales",
  tonnage: 30,
  truckCapacity: 30,
  unitPrice: 50000,
  sourceCurrency: "XOF",
  exchangeRate: 1,
  truckCount: 1,
  goodsValueFcfa: 1500000,
  totalFcfa: 2000000,
  pays: "NE",
  revision: 2,
  updatedAt: "2026-06-15T00:00:00.000Z",
  createdAt: "2026-06-01T00:00:00.000Z",
};

const sourceLines: QuoteLineLocal[] = [
  {
    id: "line-1",
    quoteId: "quote-source-1",
    designation: "Transport Niamey-Ouagadougou",
    unitPrice: 1500000,
    quantity: 1,
    totalFcfa: 1500000,
    ordre: 0,
    pays: "NE",
    revision: 1,
    updatedAt: "2026-06-10T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "line-2",
    quoteId: "quote-source-1",
    designation: "Assurance",
    unitPrice: 500000,
    quantity: 1,
    totalFcfa: 500000,
    ordre: 5,
    pays: "NE",
    revision: 0,
    updatedAt: "2026-06-10T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

const sourceClauses: QuoteClauseLocal[] = [
  {
    id: "clause-1",
    quoteId: "quote-source-1",
    clauseId: "master-clause-1",
    titre: "Force majeure",
    contenu: "En cas de force majeure...",
    ordre: 0,
    pays: "NE",
    revision: 0,
    updatedAt: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "clause-2",
    quoteId: "quote-source-1",
    contenu: "Clause spécifique au devis.",
    ordre: 1,
    pays: "NE",
    revision: 0,
    updatedAt: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

describe("buildDuplicateQuoteData — quote record", () => {
  it("resets status to draft", () => {
    const { quoteRecord } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.status).toBe("draft");
  });

  it("generates new TEMP number, not source number", () => {
    const { quoteRecord } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.number).toMatch(/^TEMP-/);
    expect(quoteRecord.number).not.toBe(sourceQuote.number);
  });

  it("assigns ownerId to current userId, not source ownerId", () => {
    const { quoteRecord } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.ownerId).toBe(userId);
    expect(quoteRecord.ownerId).not.toBe(sourceQuote.ownerId);
  });

  it("sets dateDevis to now and dateValidite to now+30d", () => {
    const { quoteRecord } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.dateDevis).toBe(now.toISOString());
    const expectedValidite = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(quoteRecord.dateValidite).toBe(expectedValidite);
  });

  it("resets revision to 0", () => {
    const { quoteRecord } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.revision).toBe(0);
  });

  it("copies client, route, goods, signatory, conditions fields", () => {
    const { quoteRecord } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.clientId).toBe("client-1");
    expect(quoteRecord.clientSnapshot).toEqual({ companyName: "SCTP Niger" });
    expect(quoteRecord.originCity).toBe("Niamey");
    expect(quoteRecord.destinationCity).toBe("Ouagadougou");
    expect(quoteRecord.goodsNature).toBe("Céréales");
    expect(quoteRecord.tonnage).toBe(30);
    expect(quoteRecord.unitPrice).toBe(50000);
    expect(quoteRecord.signataireNom).toBe("Amadou Maiga");
    expect(quoteRecord.signataireFonction).toBe("Directeur");
    expect(quoteRecord.conditionsPaiement).toBe("30 jours");
    expect(quoteRecord.reference).toBe("REF-2026-001");
    expect(quoteRecord.objet).toBe("Transport de céréales");
  });

  it("does not copy lifecycle fields (clientAccord*)", () => {
    const sourceWithAccord: QuoteLocal = {
      ...sourceQuote,
      clientAccordNom: "Jean Dupont",
      clientAccordFonction: "DG",
      clientAccordDate: "2026-06-20",
    };
    const { quoteRecord } = buildDuplicateQuoteData(sourceWithAccord, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.clientAccordNom).toBeUndefined();
    expect(quoteRecord.clientAccordFonction).toBeUndefined();
    expect(quoteRecord.clientAccordDate).toBeUndefined();
  });

  it("computes truckCount via computeCamions (30t / 30t = 1)", () => {
    const { quoteRecord } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.truckCount).toBe(1);
  });

  it("computes goodsValueFcfa via computeValeurMarchandise (30 * 50000 * 1)", () => {
    const { quoteRecord } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.goodsValueFcfa).toBe(1500000);
  });

  it("omits truckCount when tonnage is undefined", () => {
    // exactOptionalPropertyTypes: use destructuring to truly omit the key
    const { tonnage: _t, truckCount: _tc, goodsValueFcfa: _gv, ...rest } = sourceQuote;
    const src = rest as QuoteLocal;
    const { quoteRecord } = buildDuplicateQuoteData(src, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.truckCount).toBeUndefined();
  });

  it("omits goodsValueFcfa when tonnage is undefined", () => {
    const { tonnage: _t, truckCount: _tc, goodsValueFcfa: _gv, ...rest } = sourceQuote;
    const src = rest as QuoteLocal;
    const { quoteRecord } = buildDuplicateQuoteData(src, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.goodsValueFcfa).toBeUndefined();
  });

  it("omits truckCount when truckCapacity is undefined", () => {
    const { truckCapacity: _cap, truckCount: _tc, ...rest } = sourceQuote;
    const src = rest as QuoteLocal;
    const { quoteRecord } = buildDuplicateQuoteData(src, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.truckCount).toBeUndefined();
  });

  it("computes totalFcfa from new line totals", () => {
    const { quoteRecord } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(quoteRecord.totalFcfa).toBe(2000000);
  });

  it("generates a new quoteId distinct from source", () => {
    const { newQuoteId } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(newQuoteId).not.toBe(sourceQuote.id);
  });
});

describe("buildDuplicateQuoteData — line records", () => {
  it("gives each line a new UUID distinct from source", () => {
    const { lineRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(lineRecords[0]?.id).not.toBe("line-1");
    expect(lineRecords[1]?.id).not.toBe("line-2");
    expect(lineRecords[0]?.id).not.toBe(lineRecords[1]?.id);
  });

  it("preserves original ordre including non-contiguous values", () => {
    const { lineRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(lineRecords[0]?.ordre).toBe(0);
    expect(lineRecords[1]?.ordre).toBe(5);
  });

  it("sets all line quoteIds to the new quote ID", () => {
    const { newQuoteId, lineRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(lineRecords.every((l) => l.quoteId === newQuoteId)).toBe(true);
  });

  it("recalculates totalFcfa per line", () => {
    const { lineRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(lineRecords[0]?.totalFcfa).toBe(1500000);
    expect(lineRecords[1]?.totalFcfa).toBe(500000);
  });

  it("resets line revision to 0", () => {
    const { lineRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(lineRecords.every((l) => l.revision === 0)).toBe(true);
  });

  it("handles empty lines array", () => {
    const { lineRecords, quoteRecord } = buildDuplicateQuoteData(sourceQuote, [], sourceClauses, userId, now);
    expect(lineRecords).toHaveLength(0);
    expect(quoteRecord.totalFcfa).toBe(0);
  });
});

describe("buildDuplicateQuoteData — clause records", () => {
  it("copies all clauses with new IDs", () => {
    const { clauseRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(clauseRecords).toHaveLength(2);
    expect(clauseRecords[0]?.id).not.toBe("clause-1");
    expect(clauseRecords[1]?.id).not.toBe("clause-2");
    expect(clauseRecords[0]?.id).not.toBe(clauseRecords[1]?.id);
  });

  it("sets all clause quoteIds to new quote ID", () => {
    const { newQuoteId, clauseRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(clauseRecords.every((c) => c.quoteId === newQuoteId)).toBe(true);
  });

  it("preserves contenu and ordre", () => {
    const { clauseRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(clauseRecords[0]?.contenu).toBe("En cas de force majeure...");
    expect(clauseRecords[0]?.ordre).toBe(0);
    expect(clauseRecords[1]?.contenu).toBe("Clause spécifique au devis.");
    expect(clauseRecords[1]?.ordre).toBe(1);
  });

  it("copies clauseId and titre when present, omits when absent", () => {
    const { clauseRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, sourceClauses, userId, now);
    expect(clauseRecords[0]?.clauseId).toBe("master-clause-1");
    expect(clauseRecords[0]?.titre).toBe("Force majeure");
    expect(clauseRecords[1]?.clauseId).toBeUndefined();
    expect(clauseRecords[1]?.titre).toBeUndefined();
  });

  it("handles empty clauses array", () => {
    const { clauseRecords } = buildDuplicateQuoteData(sourceQuote, sourceLines, [], userId, now);
    expect(clauseRecords).toHaveLength(0);
  });
});
