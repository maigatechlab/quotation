import { db } from "@/lib/db";
import { auditEvent as auditEventTable } from "@/lib/schema";

export interface AuditEvent {
  companyId?: string | null;
  who: string;
  what: string;
  when: string;
  where: string;
  entity: { type: string; id: string };
  before?: unknown;
  after?: unknown;
}

export interface CreateAuditEventParams {
  companyId?: string | null;
  who: string;
  what: string;
  where: string;
  entity: { type: string; id: string };
  before?: unknown;
  after?: unknown;
}

export function createAuditEvent(params: CreateAuditEventParams): AuditEvent {
  return {
    ...params,
    when: new Date().toISOString(),
  };
}

export async function emitAuditEvent(event: AuditEvent): Promise<void> {
  await db.insert(auditEventTable).values({
    companyId: event.companyId ?? null,
    who: event.who,
    what: event.what,
    when: new Date(event.when),
    where: event.where,
    entityType: event.entity.type,
    entityId: event.entity.id,
    before: event.before ?? null,
    after: event.after ?? null,
  });
}

export async function emitLoginAudit(params: {
  userId: string;
  companyId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await emitAuditEvent(
    createAuditEvent({
      companyId: params.companyId ?? null,
      who: params.userId,
      what: "auth.login",
      where:
        [params.ipAddress, params.userAgent].filter(Boolean).join("|") ||
        "unknown",
      entity: { type: "user", id: params.userId },
    })
  );
}

export async function emitLogoutAudit(params: {
  userId: string;
  companyId?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  await emitAuditEvent(
    createAuditEvent({
      companyId: params.companyId ?? null,
      who: params.userId,
      what: "auth.logout",
      where: params.ipAddress ?? "unknown",
      entity: { type: "user", id: params.userId },
    })
  );
}
