import { db } from "@/lib/db";
import { auditEvent as auditEventTable } from "@/lib/schema";

export interface AuditEvent {
  who: string;
  what: string;
  when: string;
  where: string;
  entity: { type: string; id: string };
  before?: unknown;
  after?: unknown;
}

export interface CreateAuditEventParams {
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
