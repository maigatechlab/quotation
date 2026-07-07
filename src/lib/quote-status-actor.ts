import type { QuoteStatusLogLocal } from "@/lib/local-db";

export interface ActorLookup {
  name: string;
  email: string;
}

export type UsersById = Map<string, ActorLookup>;

/**
 * Resolves a human-readable actor label for a status log entry.
 *
 * Priority order (see Story 8.8 Dev Notes):
 * 1. `changedByName` snapshot (written at status-change time — no network/permission dependency).
 * 2. Legacy entry resolved via `usersById` (loaded from `/api/v1/users`, admin-only).
 * 3. `usersById` loaded successfully but the id is absent → user was deleted.
 * 4. `usersById` is `null` (not loaded — no permission, offline, or request failed) →
 *    neutral "unknown" label. Must NOT claim "deleted" when we simply couldn't check.
 */
export function resolveActorLabel(
  log: Pick<QuoteStatusLogLocal, "changedBy" | "changedByName">,
  usersById: UsersById | null,
  labels: { deleted: string; unknown: string }
): string | undefined {
  if (log.changedByName) return log.changedByName;

  if (!log.changedBy) return undefined;

  if (usersById === null) return labels.unknown;

  const user = usersById.get(log.changedBy);
  if (user) return user.name || user.email;

  return labels.deleted;
}
