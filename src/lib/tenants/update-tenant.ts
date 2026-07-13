import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, tenantEvents } from "@/lib/schema";
import { getPlanLimits } from "@/lib/tenants/platform-config";
import { TenantNotFoundError } from "@/lib/tenants/suspend";
import type { UpdateTenantInput } from "@/lib/validation/tenant-update";

export { TenantNotFoundError };

export interface UpdateTenantParams {
  tenantId: string;
  input: UpdateTenantInput;
  actorId: string;
  actorEmail: string;
}

export interface UpdateTenantResult {
  tenant: typeof tenants.$inferSelect;
  changes: ("plan" | "notes" | "status")[];
}

export async function applyTenantUpdate(params: UpdateTenantParams): Promise<UpdateTenantResult> {
  const { tenantId, input, actorId, actorEmail } = params;

  // empty string means "clear the notes" — store NULL, not ""
  const normalizedNotes = input.notes === undefined ? undefined : input.notes === "" ? null : input.notes;

  // Resolved before the transaction: getPlanLimits queries through the shared
  // pool, and doing that while the transaction holds a connection deadlocks
  // when the pool is down to one connection.
  const planLimits = input.plan !== undefined ? await getPlanLimits() : null;

  // transaction + FOR UPDATE: the before snapshot and the update must be atomic,
  // otherwise concurrent PATCHes record a stale `before` in the audit event
  const { snapshotBefore, updated } = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
      .for("update");
    const existing = rows[0];
    if (!existing) throw new TenantNotFoundError(tenantId);

    const snapshotBefore = {
      plan: existing.plan,
      notes: existing.notes,
      status: existing.status,
    };

    const payload: Partial<typeof tenants.$inferInsert> = {};
    if (input.plan !== undefined && planLimits) {
      payload.plan = input.plan;
      // keep the per-tenant column in sync with the plan (source of truth for list/CSV/enforcement)
      payload.maxUsers = planLimits[input.plan].maxUsers;
    }
    if (normalizedNotes !== undefined) payload.notes = normalizedNotes;
    if (input.status !== undefined) payload.status = input.status;

    const updatedRows = await tx
      .update(tenants)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();
    const updated = updatedRows[0];
    if (!updated) throw new TenantNotFoundError(tenantId);

    return { snapshotBefore, updated };
  });

  const changes: ("plan" | "notes" | "status")[] = [];
  if (input.plan !== undefined && input.plan !== snapshotBefore.plan) changes.push("plan");
  if (normalizedNotes !== undefined && normalizedNotes !== snapshotBefore.notes) changes.push("notes");
  if (input.status !== undefined && input.status !== snapshotBefore.status) changes.push("status");

  if (changes.length > 0) {
    const after: Record<string, unknown> = {};
    if (changes.includes("plan")) after["plan"] = updated.plan;
    if (changes.includes("notes")) after["notes"] = updated.notes;
    if (changes.includes("status")) after["status"] = updated.status;

    try {
      await db.insert(tenantEvents).values({
        tenantId,
        eventType: changes.includes("plan") ? "plan_changed" : "updated",
        actorId,
        before: snapshotBefore,
        after,
        note: `Modifié par ${actorEmail}`,
      });
    } catch (err) {
      console.error("tenant_events (update) insert failed", err instanceof Error ? err.message : err);
    }
  }

  return { tenant: updated, changes };
}
