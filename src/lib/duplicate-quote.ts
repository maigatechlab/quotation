import {
  computeCamions,
  computeLineTotal,
  computeQuoteTotal,
  computeValeurMarchandise,
} from "@/lib/calc";
import type { QuoteClauseLocal, QuoteLineLocal, QuoteLocal } from "@/lib/local-db";
import {
  generateTempNumber,
  getDeviceId,
  getNextLocalSeq,
} from "@/lib/sync/numbering";

export interface DuplicateQuoteData {
  newQuoteId: string;
  quoteRecord: QuoteLocal;
  lineRecords: QuoteLineLocal[];
  clauseRecords: QuoteClauseLocal[];
}

/**
 * Pure builder — no DB writes. Converts source quote + lines + clauses into
 * new records ready for an atomic Dexie transaction.
 *
 * Caller responsibility: persist the returned records in a single transaction.
 */
export function buildDuplicateQuoteData(
  source: QuoteLocal,
  sourceLines: QuoteLineLocal[],
  sourceClauses: QuoteClauseLocal[],
  userId: string,
  now: Date = new Date()
): DuplicateQuoteData {
  const newQuoteId = crypto.randomUUID();
  const dateDevis = now.toISOString();
  const dateValidite = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const deviceId = getDeviceId();
  const seq = getNextLocalSeq(deviceId);
  const newNumber = generateTempNumber(deviceId, seq);

  // Derived goods fields — use shared calc helpers; omit when inputs are absent or out-of-bounds
  let truckCount: number | undefined;
  let goodsValueFcfa: number | undefined;

  if (source.tonnage != null && source.truckCapacity != null) {
    try {
      truckCount = computeCamions(source.tonnage, source.truckCapacity);
    } catch { /* inputs violate calc bounds — omit derived field */ }
  }

  if (source.tonnage != null && source.unitPrice != null) {
    try {
      goodsValueFcfa = computeValeurMarchandise(
        source.tonnage,
        source.unitPrice,
        source.exchangeRate ?? 1
      );
    } catch { /* inputs violate calc bounds — omit derived field */ }
  }

  // Lines — recalculate totalFcfa, preserve original ordre (don't reindex)
  const lineRecords: QuoteLineLocal[] = sourceLines.map((l) => ({
    id: crypto.randomUUID(),
    quoteId: newQuoteId,
    designation: l.designation,
    unitPrice: l.unitPrice,
    quantity: l.quantity,
    totalFcfa: computeLineTotal(l.unitPrice, l.quantity),
    ordre: l.ordre,
    pays: "NE" as const,
    revision: 0,
    updatedAt: dateDevis,
    createdAt: dateDevis,
  }));

  const totalFcfa = computeQuoteTotal(lineRecords);

  // Build quote record — required fields first, then conditional optionals
  // Deliberately excluded: clientAccord* (lifecycle state), companyId (server-stamped)
  const quoteRecord: QuoteLocal = {
    id: newQuoteId,
    number: newNumber,
    status: "draft",
    totalFcfa,
    pays: "NE",
    revision: 0,
    updatedAt: dateDevis,
    createdAt: dateDevis,
    ownerId: userId,
    dateDevis,
    dateValidite,
  };

  if (truckCount !== undefined) quoteRecord.truckCount = truckCount;
  if (goodsValueFcfa !== undefined) quoteRecord.goodsValueFcfa = goodsValueFcfa;
  if (source.reference != null) quoteRecord.reference = source.reference;
  if (source.objet != null) quoteRecord.objet = source.objet;
  if (source.clientId != null) quoteRecord.clientId = source.clientId;
  if (source.clientSnapshot != null) quoteRecord.clientSnapshot = source.clientSnapshot;
  if (source.signataireNom != null) quoteRecord.signataireNom = source.signataireNom;
  if (source.signataireFonction != null) quoteRecord.signataireFonction = source.signataireFonction;
  if (source.conditionsPaiement != null) quoteRecord.conditionsPaiement = source.conditionsPaiement;
  if (source.originCountry != null) quoteRecord.originCountry = source.originCountry;
  if (source.originCity != null) quoteRecord.originCity = source.originCity;
  if (source.destinationCountry != null) quoteRecord.destinationCountry = source.destinationCountry;
  if (source.destinationCity != null) quoteRecord.destinationCity = source.destinationCity;
  if (source.goodsNature != null) quoteRecord.goodsNature = source.goodsNature;
  if (source.tonnage != null) quoteRecord.tonnage = source.tonnage;
  if (source.truckCapacity != null) quoteRecord.truckCapacity = source.truckCapacity;
  if (source.unitPrice != null) quoteRecord.unitPrice = source.unitPrice;
  if (source.sourceCurrency != null) quoteRecord.sourceCurrency = source.sourceCurrency;
  if (source.exchangeRate != null) quoteRecord.exchangeRate = source.exchangeRate;

  // Clauses — copy with new IDs, preserve ordre and content
  const clauseRecords: QuoteClauseLocal[] = sourceClauses.map((c) => {
    const newClause: QuoteClauseLocal = {
      id: crypto.randomUUID(),
      quoteId: newQuoteId,
      contenu: c.contenu,
      ordre: c.ordre,
      pays: "NE",
      revision: 0,
      updatedAt: dateDevis,
      createdAt: dateDevis,
    };
    if (c.clauseId != null) newClause.clauseId = c.clauseId;
    if (c.titre != null) newClause.titre = c.titre;
    return newClause;
  });

  return { newQuoteId, quoteRecord, lineRecords, clauseRecords };
}
