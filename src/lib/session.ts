import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

/**
 * Protected routes that require authentication.
 * These are also configured in src/proxy.ts for optimistic redirects.
 */
export const protectedRoutes = ["/chat", "/dashboard", "/profile"];

/**
 * Checks if the current request is authenticated.
 * Should be called in Server Components for protected routes.
 *
 * @returns The session object if authenticated
 * @throws Redirects to home page if not authenticated
 */
export async function requireAuth() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/");
  }

  return session;
}

/**
 * Gets the current session without requiring authentication.
 * Returns null if not authenticated.
 *
 * @returns The session object or null
 */
export async function getOptionalSession() {
  return await auth.api.getSession({ headers: await headers() });
}

export type SessionWithRole = {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  role: Role;
};

export async function getSessionWithRole(): Promise<SessionWithRole | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const role = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  return { session, role };
}

/**
 * Checks if a given path is a protected route.
 *
 * @param path - The path to check
 * @returns True if the path requires authentication
 */
export function isProtectedRoute(path: string): boolean {
  return protectedRoutes.some(
    (route) => path === route || path.startsWith(`${route}/`)
  );
}

/**
 * Requires an authenticated superadmin session (Server Components).
 * Redirects to "/" if not authenticated or not superadmin.
 */
export async function requireOwnerAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const role = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  if (role !== "superadmin") redirect("/");
  return session;
}

/**
 * Requires an authenticated superadmin session for API routes.
 * Returns a typed result instead of throwing, so the caller can wrap in apiError.
 */
export async function requireOwnerSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false as const, status: 401, code: "UNAUTHORIZED" as const };
  }
  const role = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  if (role !== "superadmin") {
    return { ok: false as const, status: 403, code: "FORBIDDEN" as const };
  }
  return { ok: true as const, session };
}
