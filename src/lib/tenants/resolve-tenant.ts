import { and, eq, inArray } from "drizzle-orm";
import type { db as DbType } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { APEX_DOMAIN } from "./tenant-config";

export type TenantRow = typeof tenants.$inferSelect;

export type ResolveResult =
  | { kind: "no-tenant" }
  | { kind: "not-found" }
  | { kind: "tenant"; tenant: TenantRow };

interface CacheEntry {
  result: ResolveResult;
  expiresAt: number;
}

const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export function clearTenantCache(): void {
  cache.clear();
}

export function extractSlugFromHost(host: string, apexDomain: string = APEX_DOMAIN): string | null {
  const h = host.split(":")[0] ?? host;
  if (h === "localhost" || h === apexDomain || h === `www.${apexDomain}`) return null;
  const parts = h.split(".");
  if (h.endsWith(`.${apexDomain}`) && parts.length === 3) {
    return parts[0] ?? null;
  }
  // dev mode: {slug}.localhost
  if (h.endsWith(".localhost") && parts.length === 2) {
    return parts[0] ?? null;
  }
  return null;
}

export async function resolveTenantByHost(
  host: string,
  dbClient: typeof DbType,
  testSlug?: string | null
): Promise<ResolveResult> {
  const slug = testSlug ?? extractSlugFromHost(host);

  if (slug === null) {
    return { kind: "no-tenant" };
  }

  const cached = cache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const rows = await dbClient
    .select()
    .from(tenants)
    .where(
      and(
        eq(tenants.slug, slug),
        inArray(tenants.status, ["active", "trial", "suspended", "cancelled"])
      )
    )
    .limit(1);

  const tenant = rows[0] ?? null;
  const result: ResolveResult = tenant ? { kind: "tenant", tenant } : { kind: "not-found" };

  cache.set(slug, { result, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });

  return result;
}
