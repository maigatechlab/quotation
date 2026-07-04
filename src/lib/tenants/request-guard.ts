import { eq } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { assertTenantWritable, TenantBlockError } from "./tenant-access";

export type SessionUserLike = Record<string, unknown>;

function readScopedTenantId(user: SessionUserLike): string | null {
  const rawTenantId = user["tenantId"];
  return typeof rawTenantId === "string" && rawTenantId !== "" ? rawTenantId : null;
}

export async function assertSessionTenantWritable(
  user: SessionUserLike
): Promise<ReturnType<typeof apiError> | null> {
  const tenantId = readScopedTenantId(user);
  if (!tenantId) return null;

  const rows = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tenant = rows[0];
  if (!tenant) return null;

  try {
    await assertTenantWritable(tenant);
    return null;
  } catch (err) {
    if (err instanceof TenantBlockError) {
      return apiError(err.code, err.message, HTTP_STATUS.FORBIDDEN);
    }
    throw err;
  }
}