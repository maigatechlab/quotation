import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { createAuditEvent, emitAuditEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, PermissionError, requirePermission, type Action, type Role } from "@/lib/permissions";
import {
  client as clientTable,
  quote as quoteTable,
  quoteLine as quoteLineTable,
  clause as clauseTable,
  template as templateTable,
  company as companyTable,
  syncOpLog,
} from "@/lib/schema";
import { clientSchema } from "@/lib/validation/client";

const SyncOpSchema = z.object({
  opId: z.string().min(1),
  entity: z.enum(["client", "quote", "quoteLine", "clause", "company", "template"]),
  entityId: z.string().min(1),
  type: z.enum(["create", "update", "delete"]),
  payload: z.record(z.string(), z.unknown()),
  baseRevision: z.number().int().min(0),
  queuedAt: z.string(),
});

const SyncPushRequestSchema = z.object({
  ops: z.array(SyncOpSchema).min(1).max(100),
});

type SyncOpInput = z.infer<typeof SyncOpSchema>;

interface PushOpResult {
  opId: string;
  status: "applied" | "conflict" | "noop";
  entity?: unknown;
}

// Maps a sync op to the permission action it requires.
// When an entity already exists and op.type is "create" (upsert path),
// treat it as an update so ownership semantics apply (prevents overwriting
// another user's client using create permission alone).
function resolveEntityAction(
  entity: SyncOpInput["entity"],
  type: SyncOpInput["type"],
  hasExisting: boolean,
): Action {
  if (entity === "company") return "company.update";
  if (entity === "quoteLine") return "quote.update";
  const effectiveType = hasExisting && type === "create" ? "update" : type;
  return `${entity}.${effectiveType}` as Action;
}

// Returns the ownerId to use for "own" permission checks.
// quoteLine has no ownerId — resolves from parent quote.
// company is boolean-only (no "own") — returns undefined.
async function resolveEntityOwner(
  entity: SyncOpInput["entity"],
  op: SyncOpInput,
  currentEntity: Record<string, unknown> | null,
): Promise<string | undefined> {
  if (entity === "company") return undefined;

  if (entity === "quoteLine") {
    const quoteId =
      typeof op.payload.quoteId === "string"
        ? op.payload.quoteId
        : typeof currentEntity?.quoteId === "string"
        ? currentEntity.quoteId
        : null;
    if (!quoteId) return undefined;
    const rows = await db.select().from(quoteTable).where(eq(quoteTable.id, quoteId)).limit(1);
    return typeof rows[0]?.ownerId === "string" ? rows[0].ownerId : undefined;
  }

  return typeof currentEntity?.ownerId === "string" ? currentEntity.ownerId : undefined;
}

// Thrown when an op targets an entity that belongs to a different tenant.
class OwnershipError extends Error {
  constructor() {
    super("sync_ownership_violation");
  }
}

// Payload field coercions — payload is Record<string,unknown> from the client
const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const strN = (v: unknown): string | null => (v != null && v !== "" ? String(v) : null);
const intN = (v: unknown): number | null =>
  v != null ? (typeof v === "number" ? Math.round(v) : parseInt(String(v), 10)) : null;
const floatN = (v: unknown): number | null =>
  v != null ? (typeof v === "number" ? v : parseFloat(String(v))) : null;
const dateN = (v: unknown): Date | null => (v != null ? new Date(String(v)) : null);

const VALID_QUOTE_STATUSES = [
  "draft",
  "validated",
  "sent",
  "accepted",
  "expired",
  "cancelled",
] as const;
type QuoteStatus = (typeof VALID_QUOTE_STATUSES)[number];

function quoteStatusVal(v: unknown): QuoteStatus {
  if (typeof v === "string" && (VALID_QUOTE_STATUSES as readonly string[]).includes(v)) {
    return v as QuoteStatus;
  }
  return "draft";
}

async function fetchCurrentEntity(
  entity: string,
  entityId: string
): Promise<Record<string, unknown> | null> {
  switch (entity) {
    case "client": {
      const rows = await db.select().from(clientTable).where(eq(clientTable.id, entityId)).limit(1);
      return rows[0] ? (rows[0] as Record<string, unknown>) : null;
    }
    case "quote": {
      const rows = await db.select().from(quoteTable).where(eq(quoteTable.id, entityId)).limit(1);
      return rows[0] ? (rows[0] as Record<string, unknown>) : null;
    }
    case "quoteLine": {
      const rows = await db
        .select()
        .from(quoteLineTable)
        .where(eq(quoteLineTable.id, entityId))
        .limit(1);
      return rows[0] ? (rows[0] as Record<string, unknown>) : null;
    }
    case "clause": {
      const rows = await db
        .select()
        .from(clauseTable)
        .where(eq(clauseTable.id, entityId))
        .limit(1);
      return rows[0] ? (rows[0] as Record<string, unknown>) : null;
    }
    case "template": {
      const rows = await db
        .select()
        .from(templateTable)
        .where(eq(templateTable.id, entityId))
        .limit(1);
      return rows[0] ? (rows[0] as Record<string, unknown>) : null;
    }
    case "company": {
      const rows = await db
        .select()
        .from(companyTable)
        .where(eq(companyTable.id, entityId))
        .limit(1);
      return rows[0] ? (rows[0] as Record<string, unknown>) : null;
    }
    default:
      return null;
  }
}

// Verify the op targets an entity the caller is allowed to modify.
// Caller guarantees userCompanyId is non-null (POST blocks null users before reaching here).
// Throws OwnershipError when userCompanyId mismatches the stored entity.
function assertOwnership(
  op: SyncOpInput,
  currentEntity: Record<string, unknown> | null,
  userCompanyId: string
): void {
  // P5+P6: company entity — entityId must always equal caller's company (create and update)
  if (op.entity === "company") {
    if (op.entityId !== userCompanyId) throw new OwnershipError();
    return;
  }

  if (currentEntity === null) {
    // New non-company entity: server will stamp companyId = tenantId, no check needed.
    return;
  }

  const entityCompanyId = currentEntity.companyId as string | null;
  // P6: rows with null companyId are unprovisioned — block writes to prevent cross-tenant mutation
  if (entityCompanyId === null || entityCompanyId !== userCompanyId) {
    throw new OwnershipError();
  }
}

async function persistEntityMutation(
  op: SyncOpInput,
  newRevision: number,
  // Authoritative tenant ID from session — never trusts payload.companyId.
  userCompanyId: string,
  // D3: session user ID — stamps ownerId on creates; preserved from currentEntity on updates.
  userId: string,
  currentEntity: Record<string, unknown> | null,
): Promise<void> {
  const p = op.payload;
  const now = new Date();
  const createdAt = dateN(p.createdAt) ?? now;
  const tenantId = userCompanyId;

  switch (op.entity) {
    case "client": {
      if (op.type === "delete") {
        // Server-side guard: block delete if client has associated quotes.
        // The local dialog checks IndexedDB but that data can be stale or bypassed.
        const linkedQuotes = await db
          .select()
          .from(quoteTable)
          .where(eq(quoteTable.clientId, op.entityId))
          .limit(1);
        if (linkedQuotes.length > 0) {
          throw Object.assign(new Error("client_has_quotes"), {});
        }
        await db
          .update(clientTable)
          .set({ deletedAt: now, revision: newRevision, updatedAt: now })
          .where(eq(clientTable.id, op.entityId));
      } else {
        const clientValidation = clientSchema.safeParse({
          companyName: p.companyName,
          phone: p.phone,
          email: p.email ?? undefined,
          contactName: p.contactName ?? undefined,
          country: p.country ?? undefined,
          city: p.city ?? undefined,
          address: p.address ?? undefined,
          notes: p.notes ?? undefined,
        });
        if (!clientValidation.success) {
          throw Object.assign(new Error("client_payload_invalid"), {
            validationError: clientValidation.error.flatten().fieldErrors,
          });
        }
        // Preserve original ownerId on updates to prevent admin edits from
        // reassigning ownership (breaking commercial's "own" access).
        const existingOwnerId =
          typeof currentEntity?.ownerId === "string" ? currentEntity.ownerId : null;
        const ownerIdToUse =
          op.type === "update" && existingOwnerId !== null ? existingOwnerId : userId;

        const clientValues = {
          companyName: str(p.companyName),
          contactName: strN(p.contactName),
          phone: str(p.phone),
          email: strN(p.email),
          country: strN(p.country) ?? "NE",
          city: strN(p.city),
          address: strN(p.address),
          notes: strN(p.notes),
          deletedAt: dateN(p.deletedAt),
          ownerId: ownerIdToUse,
          companyId: tenantId,
          pays: strN(p.pays) ?? "NE",
          revision: newRevision,
          updatedAt: now,
        };
        await db
          .insert(clientTable)
          .values({ id: op.entityId, ...clientValues, createdAt })
          .onConflictDoUpdate({ target: clientTable.id, set: clientValues });
      }
      break;
    }

    case "quote": {
      if (op.type === "delete") {
        await db.delete(quoteTable).where(eq(quoteTable.id, op.entityId));
      } else {
        const existingQuoteOwnerId =
          typeof currentEntity?.ownerId === "string" ? currentEntity.ownerId : null;
        const quoteOwnerIdToUse =
          op.type === "update" && existingQuoteOwnerId !== null
            ? existingQuoteOwnerId
            : userId;

        const quoteValues = {
          number: str(p.number),
          reference: strN(p.reference),
          objet: strN(p.objet),
          status: quoteStatusVal(p.status),
          clientId: strN(p.clientId),
          clientSnapshot: p.clientSnapshot ?? null,
          ownerId: quoteOwnerIdToUse,
          dateDevis: dateN(p.dateDevis),
          dateValidite: dateN(p.dateValidite),
          signataireNom: strN(p.signataireNom),
          signataireFonction: strN(p.signataireFonction),
          conditionsPaiement: strN(p.conditionsPaiement),
          originCountry: strN(p.originCountry),
          originCity: strN(p.originCity),
          destinationCountry: strN(p.destinationCountry),
          destinationCity: strN(p.destinationCity),
          goodsNature: strN(p.goodsNature),
          tonnage: floatN(p.tonnage),
          truckCapacity: floatN(p.truckCapacity),
          truckCount: intN(p.truckCount),
          unitPrice: intN(p.unitPrice),
          sourceCurrency: strN(p.sourceCurrency) ?? "XOF",
          exchangeRate: floatN(p.exchangeRate) ?? 1,
          goodsValueFcfa: intN(p.goodsValueFcfa),
          totalFcfa: intN(p.totalFcfa) ?? 0,
          companyId: tenantId,
          pays: strN(p.pays) ?? "NE",
          revision: newRevision,
          updatedAt: now,
        };
        await db
          .insert(quoteTable)
          .values({ id: op.entityId, ...quoteValues, createdAt })
          .onConflictDoUpdate({ target: quoteTable.id, set: quoteValues });
      }
      break;
    }

    case "quoteLine": {
      if (op.type === "delete") {
        await db.delete(quoteLineTable).where(eq(quoteLineTable.id, op.entityId));
      } else {
        const lineValues = {
          quoteId: str(p.quoteId),
          designation: str(p.designation),
          unitPrice: intN(p.unitPrice) ?? 0,
          quantity: intN(p.quantity) ?? 1,
          totalFcfa: intN(p.totalFcfa) ?? 0,
          ordre: intN(p.ordre) ?? 0,
          templateId: strN(p.templateId),
          companyId: tenantId,
          pays: strN(p.pays) ?? "NE",
          revision: newRevision,
          updatedAt: now,
        };
        await db
          .insert(quoteLineTable)
          .values({ id: op.entityId, ...lineValues, createdAt })
          .onConflictDoUpdate({ target: quoteLineTable.id, set: lineValues });
      }
      break;
    }

    case "clause": {
      if (op.type === "delete") {
        await db.delete(clauseTable).where(eq(clauseTable.id, op.entityId));
      } else {
        const clauseValues = {
          titre: str(p.titre),
          contenu: str(p.contenu),
          categorie: strN(p.categorie),
          companyId: tenantId,
          pays: strN(p.pays) ?? "NE",
          revision: newRevision,
          updatedAt: now,
        };
        await db
          .insert(clauseTable)
          .values({ id: op.entityId, ...clauseValues, createdAt })
          .onConflictDoUpdate({ target: clauseTable.id, set: clauseValues });
      }
      break;
    }

    case "template": {
      if (op.type === "delete") {
        await db
          .update(templateTable)
          .set({ deletedAt: now, revision: newRevision, updatedAt: now })
          .where(eq(templateTable.id, op.entityId));
      } else {
        type TemplateLine = { designation: string; unitPrice: number; quantity: number };
        const rawLines: unknown[] = Array.isArray(p.lines) ? (p.lines as unknown[]) : [];
        if (!str(p.nom).trim()) {
          throw Object.assign(new Error("template_payload_invalid"), {
            validationError: { nom: ["required"] },
          });
        }
        if (rawLines.length === 0) {
          throw Object.assign(new Error("template_payload_invalid"), {
            validationError: { lines: ["at_least_one_line"] },
          });
        }
        const lines: TemplateLine[] = rawLines.map((l) => {
          const line = l as Record<string, unknown>;
          const designation = str(line["designation"]).trim();
          const unitPrice = Math.round(Number(line["unitPrice"]) || 0);
          const quantity = Math.round(Number(line["quantity"]) || 0);
          if (!designation || unitPrice <= 0 || quantity < 1) {
            throw Object.assign(new Error("template_payload_invalid"), {
              validationError: { lines: ["invalid_line"] },
            });
          }
          return { designation, unitPrice, quantity };
        });
        const templateValues = {
          nom: str(p.nom).trim(),
          lines,
          deletedAt: null,
          companyId: tenantId,
          pays: strN(p.pays) ?? "NE",
          revision: newRevision,
          updatedAt: now,
        };
        await db
          .insert(templateTable)
          .values({ id: op.entityId, ...templateValues, createdAt })
          .onConflictDoUpdate({ target: templateTable.id, set: templateValues });
      }
      break;
    }

    case "company": {
      if (op.type !== "delete") {
        const phones: string[] = Array.isArray(p.phones) ? (p.phones as string[]) : [];
        const emails: string[] = Array.isArray(p.emails) ? (p.emails as string[]) : [];
        const companyValues = {
          raisonSociale: str(p.raisonSociale),
          formeJuridique: strN(p.formeJuridique),
          capital: intN(p.capital),
          rccm: str(p.rccm),
          nif: str(p.nif),
          adresse: strN(p.adresse),
          bp: strN(p.bp),
          phones,
          emails,
          logoUrl: strN(p.logoUrl),
          signataireNom: strN(p.signataireNom),
          signataireFonction: strN(p.signataireFonction),
          conditionsPaiementDefaut: strN(p.conditionsPaiementDefaut),
          // companyId on the company table is a parent-company reference, not the tenant FK.
          companyId: strN(p.companyId),
          pays: strN(p.pays) ?? "NE",
          revision: newRevision,
          updatedAt: now,
        };
        await db
          .insert(companyTable)
          .values({ id: op.entityId, ...companyValues, createdAt })
          .onConflictDoUpdate({ target: companyTable.id, set: companyValues });
      }
      break;
    }
  }
}

async function applyOp(
  op: SyncOpInput,
  userId: string,
  userCompanyId: string,
  userRole: Role,
): Promise<PushOpResult> {
  // Idempotency — same opId already processed
  const existing = await db
    .select()
    .from(syncOpLog)
    .where(eq(syncOpLog.opId, op.opId))
    .limit(1);
  if (existing.length > 0) {
    return { opId: op.opId, status: "noop" };
  }

  const currentEntity = await fetchCurrentEntity(op.entity, op.entityId);

  // Tenant ownership check — throws OwnershipError on violation
  assertOwnership(op, currentEntity, userCompanyId);

  // "own" perm check — uses actual entity ownerId so cross-user ops are blocked
  const entityAction = resolveEntityAction(op.entity, op.type, currentEntity !== null);
  const entityOwnerId = await resolveEntityOwner(op.entity, op, currentEntity);
  try {
    requirePermission(userRole, entityAction, entityOwnerId, userId);
  } catch (err) {
    if (err instanceof PermissionError) throw new OwnershipError();
    throw err;
  }

  const serverRevision =
    currentEntity !== null ? ((currentEntity.revision as number) ?? 0) : 0;

  // P1: conflict when server moved at all beyond client's last known revision
  if (currentEntity !== null && serverRevision > op.baseRevision) {
    await emitAuditEvent(
      createAuditEvent({
        who: userId,
        what: "conflict.archived",
        where: "api/v1/sync/push",
        entity: { type: op.entity, id: op.entityId },
        before: op.payload,
        after: currentEntity,
      })
    );

    await db.insert(syncOpLog).values({
      opId: op.opId,
      entity: op.entity,
      entityId: op.entityId,
      type: op.type,
      result: "conflict",
    });

    return { opId: op.opId, status: "conflict", entity: currentEntity };
  }

  const newRevision = serverRevision + 1;

  await persistEntityMutation(op, newRevision, userCompanyId, userId, currentEntity);

  await db.insert(syncOpLog).values({
    opId: op.opId,
    entity: op.entity,
    entityId: op.entityId,
    type: op.type,
    result: "applied",
  });

  await emitAuditEvent(
    createAuditEvent({
      who: userId,
      what: `sync.${op.type}`,
      where: "api/v1/sync/push",
      entity: { type: op.entity, id: op.entityId },
      before: currentEntity,
      after: op.payload,
    })
  );

  return { opId: op.opId, status: "applied" };
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  const userId = (session.user as Record<string, unknown>).id as string;
  const rawCid = (session.user as Record<string, unknown>).companyId;
  const userCompanyId: string | null =
    typeof rawCid === "string" && rawCid !== "" ? rawCid : null;

  // Fail closed: every push must be scoped to a company.
  // Users without a companyId are not yet provisioned for sync.
  if (!userCompanyId) {
    return apiError("FORBIDDEN", "Utilisateur non associé à une entreprise.", HTTP_STATUS.FORBIDDEN);
  }

  try {
    requirePermission(userRole, "sync.push");
  } catch (err) {
    if (err instanceof PermissionError) {
      return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = SyncPushRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_FAILED",
      "Données invalides.",
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.flatten().fieldErrors as Record<string, string>
    );
  }

  const results: PushOpResult[] = [];

  for (const op of parsed.data.ops) {
    // Fast-fail: coarse-grained check blocks false perms without DB calls.
    // "own" perms pass here; fine-grained owner check runs inside applyOp
    // after fetchCurrentEntity resolves the actual entity ownerId.
    if (!can(userRole, resolveEntityAction(op.entity, op.type, false))) {
      return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
    }

    let result: PushOpResult;
    try {
      result = await applyOp(op, userId, userCompanyId, userRole);
    } catch (err) {
      if (err instanceof OwnershipError) {
        return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
      }
      if (err instanceof Error && err.message === "client_payload_invalid") {
        return apiError("VALIDATION_FAILED", "Données client invalides.", HTTP_STATUS.UNPROCESSABLE);
      }
      if (err instanceof Error && err.message === "template_payload_invalid") {
        return apiError("VALIDATION_FAILED", "Données modèle invalides.", HTTP_STATUS.UNPROCESSABLE);
      }
      if (err instanceof Error && err.message === "client_has_quotes") {
        return apiError("VALIDATION_FAILED", "Ce client possède des devis et ne peut pas être supprimé.", HTTP_STATUS.UNPROCESSABLE);
      }
      // Propagate as 500 — client retries via backoff, op stays in outbox
      throw err;
    }

    if (result.status === "conflict") {
      // Return 409 immediately; client handles one op at a time
      return NextResponse.json({ results: [result] }, { status: HTTP_STATUS.CONFLICT });
    }
    results.push(result);
  }

  return NextResponse.json({ results }, { status: HTTP_STATUS.OK });
}
