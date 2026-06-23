"use client";

import { useSession } from "@/lib/auth-client";
import { can, type Action, type Role } from "@/lib/permissions";

export function useRole(): Role {
  const { data } = useSession();
  return ((data?.user as Record<string, unknown>)?.role ?? "commercial") as Role;
}

export function usePermission(action: Action): boolean {
  const role = useRole();
  return can(role, action);
}
