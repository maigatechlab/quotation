import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { db } from "@/lib/db";
import { extractSlugFromHost, resolveTenantByHost } from "@/lib/tenants/resolve-tenant";
import { APEX_DOMAIN } from "@/lib/tenants/tenant-config";
import { enforceTenantAccess } from "@/lib/tenants/tenant-enforcement";

const PUBLIC_PATHS = [
  "/subscription-expired",
  "/login",
  "/forgot-password",
  "/reset-password",
];
const AUTH_PREFIX = "/api/auth";
const OWNER_PREFIX = "/owner";
// API routes manage their own 401/403 — proxy must not redirect them to "/"
const API_PREFIX = "/api/";
// Headers the proxy is the sole authority to set — strip from any incoming request
const PROXY_CONTROLLED_HEADERS = ["x-tenant-id", "x-tenant-grace"];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith(AUTH_PREFIX) ||
    pathname.startsWith(API_PREFIX)
  );
}

/**
 * Next.js 16 Proxy — auth protection + multi-tenant subdomain resolution.
 * Runtime: Node.js (default). Do NOT add `export const runtime = "edge"`.
 *
 * Dev mode (SUBDOMAIN_DEV_MODE=1): reads slug from x-test-tenant-slug header
 * so subdomains work without *.localhost DNS config.
 *   curl -H "x-test-tenant-slug: acme" http://localhost:3000/dashboard
 *
 * Tenant-user membership (user.tenantId === resolved tenant) is NOT enforced here.
 * The proxy stamps x-tenant-id for routing context only. Per-user tenant membership
 * validation is the responsibility of server components and API routes (via session
 * + user.tenantId check). Full RBAC guard lands in story 7-2.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // Strip client-supplied tenant headers — proxy is the sole authority to set these.
  const sanitizedHeaders = new Headers(request.headers);
  for (const header of PROXY_CONTROLLED_HEADERS) {
    sanitizedHeaders.delete(header);
  }

  // /owner/* routes: bypass tenant resolution; require session cookie (role guard in Server Component)
  const isOwnerRoute = pathname.startsWith(OWNER_PREFIX);

  // Dev mode: override slug via header
  const devMode = process.env.SUBDOMAIN_DEV_MODE === "1";
  const testSlug = devMode ? (request.headers.get("x-test-tenant-slug") ?? null) : null;

  const slug = testSlug ?? extractSlugFromHost(host, APEX_DOMAIN);
  const hasTenantContext = slug !== null && !isOwnerRoute;

  if (hasTenantContext) {
    const resolved = await resolveTenantByHost(host, db, testSlug);

    if (resolved.kind === "tenant") {
      const decision = await enforceTenantAccess(resolved.tenant);

      if (decision.action === "redirect" && !isPublicPath(pathname)) {
        const redirectUrl = new URL("/subscription-expired", request.url);
        const effectiveDate = resolved.tenant.subscriptionEnd ?? resolved.tenant.updatedAt ?? null;
        if (effectiveDate) {
          redirectUrl.searchParams.set("date", effectiveDate.toISOString());
        }
        return NextResponse.redirect(redirectUrl);
      }

      // Set trusted tenant headers on the sanitized copy
      sanitizedHeaders.set("x-tenant-id", resolved.tenant.id);
      if (decision.action === "allow-with-grace") {
        sanitizedHeaders.set("x-tenant-grace", decision.graceEndsAt.toISOString());
      }

      // Auth check for protected tenant routes
      if (!isPublicPath(pathname)) {
        const sessionCookie = getSessionCookie(request);
        if (!sessionCookie) {
          return NextResponse.redirect(new URL("/login", request.url));
        }
      }

      return NextResponse.next({ request: { headers: sanitizedHeaders } });
    }

    // not-found slug: fall through with sanitized headers (no tenant context)
  }

  // /owner/* routes: optimistic cookie check (role=superadmin validated in Server Component)
  if (isOwnerRoute) {
    if (pathname === "/owner/login") {
      return NextResponse.next({ request: { headers: sanitizedHeaders } });
    }
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/owner/login", request.url));
    }
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
  }

  // Apex domain routes: standard auth check
  if (!isPublicPath(pathname)) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next({ request: { headers: sanitizedHeaders } });
}

export const config = {
  // Exclude static assets and Next internals from matcher.
  // /owner/* included so the proxy runs but skips tenant resolution (handled above).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.ico$|.*\\.webp$|.*\\.jpg$|.*\\.jpeg$|.*\\.woff2?$).*)"],
};

