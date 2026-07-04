import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantEvents } from "@/lib/schema";

export class TenantBlockError extends Error {
  constructor(
    public readonly code: "TENANT_READONLY" | "TENANT_BLOCKED" | "TENANT_CANCELLED",
    message: string
  ) {
    super(message);
    this.name = "TenantBlockError";
  }
}

/**
 * Returns true when the tenant should have ALL access blocked (no reads, no writes).
 * - cancelled → always total block
 * - suspended + last event has totalBlock=true → total block (fraud/security)
 * - suspended + totalBlock=false → read-only (non-payment), returns false
 * - active/trial → false
 *
 * Reads totalBlock from the most recent 'suspended' event (no schema change needed for MVP).
 */
export async function isTotalBlock(tenant: { id: string; status: string }): Promise<boolean> {
  if (tenant.status === "cancelled") return true;
  if (tenant.status !== "suspended") return false;

  const rows = await db
    .select({ after: tenantEvents.after })
    .from(tenantEvents)
    .where(and(eq(tenantEvents.tenantId, tenant.id), eq(tenantEvents.eventType, "suspended")))
    .orderBy(desc(tenantEvents.createdAt))
    .limit(1);

  const after = rows[0]?.after as { totalBlock?: boolean } | undefined;
  return Boolean(after?.totalBlock);
}

/**
 * Throws TenantBlockError if the tenant cannot accept write mutations.
 * - cancelled → TENANT_CANCELLED
 * - suspended + totalBlock → TENANT_BLOCKED
 * - suspended + read-only → TENANT_READONLY
 * - active/trial → resolves silently
 *
 * Coordination with 7-1: proxy handles navigation redirect for cancelled/fraud.
 * This helper handles fine-grained mutation blocking in API route handlers.
 */
export async function assertTenantWritable(tenant: {
  id: string;
  status: string;
}): Promise<void> {
  if (tenant.status === "cancelled") {
    throw new TenantBlockError("TENANT_CANCELLED", "Le tenant est annulé.");
  }
  if (tenant.status === "suspended") {
    if (await isTotalBlock(tenant)) {
      throw new TenantBlockError("TENANT_BLOCKED", "Le tenant est bloqué totalement.");
    }
    throw new TenantBlockError("TENANT_READONLY", "Le tenant est en lecture seule.");
  }
}
