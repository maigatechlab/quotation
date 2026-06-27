"use client";

import { db } from "@/lib/local-db";
import type { SyncOp } from "@/lib/local-db";

const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;

export interface PushOpResult {
  opId: string;
  status: "applied" | "conflict" | "noop" | "failed";
  entity?: unknown;
}

export interface PushResult {
  results: PushOpResult[];
}

// P3: non-retryable 4xx — fail immediately without consuming retry budget
class FatalHttpError extends Error {
  constructor(public readonly statusCode: number) {
    super(`HTTP ${statusCode} (fatal, no retry)`);
  }
}

async function pushSingleOp(op: SyncOp): Promise<PushOpResult> {
  const res = await fetch("/api/v1/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops: [op] }),
  });

  if (res.status === 409) {
    // P12: handle malformed 409 body explicitly instead of falling through
    try {
      const body = (await res.json()) as {
        results: Array<{ opId: string; status: string; entity?: unknown }>;
      };
      const result = body.results[0];
      if (result?.entity !== undefined) {
        const { handleConflict } = await import("@/lib/sync/conflict");
        await handleConflict(op, result.entity);
        await db.syncQueue.delete(op.opId);
        return { opId: op.opId, status: "conflict", entity: result.entity };
      }
    } catch {
      // malformed body — fall through to permanent failure
    }
    await db.syncQueue.update(op.opId, {
      failed: true,
      lastError: "malformed or unresolvable conflict response",
    });
    return { opId: op.opId, status: "failed" };
  }

  // P3: 4xx other than 409 are permanent — throw FatalHttpError to skip retry loop
  if (res.status >= 400 && res.status < 500) {
    throw new FatalHttpError(res.status);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const body = (await res.json()) as PushResult;
  const result = body.results[0];
  if (!result) throw new Error("Empty push response");

  await db.syncQueue.delete(op.opId);
  return result;
}

async function pushWithRetry(op: SyncOp): Promise<PushOpResult> {
  for (let attempt = 0; attempt < BACKOFF_DELAYS_MS.length; attempt++) {
    try {
      return await pushSingleOp(op);
    } catch (err) {
      // P3: 4xx = fatal, no retry
      if (err instanceof FatalHttpError) {
        await db.syncQueue.update(op.opId, {
          failed: true,
          retryCount: attempt + 1,
          lastError: err.message,
        });
        return { opId: op.opId, status: "failed" };
      }

      const isLastAttempt = attempt === BACKOFF_DELAYS_MS.length - 1;
      if (isLastAttempt) {
        // P13: persist lastError for diagnostics
        await db.syncQueue.update(op.opId, {
          failed: true,
          retryCount: attempt + 1,
          lastError: err instanceof Error ? err.message : String(err),
        });
        // P15: return "failed" not "noop" so callers can distinguish permanent failure
        return { opId: op.opId, status: "failed" };
      }
      const delay = BACKOFF_DELAYS_MS[attempt] ?? 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return { opId: op.opId, status: "failed" };
}

export async function pushOps(ops: SyncOp[]): Promise<PushResult> {
  const results: PushOpResult[] = [];
  // P11: track entities that had a conflict this cycle to skip stale follow-up ops
  const conflictedEntityIds = new Set<string>();

  for (const op of ops) {
    if (conflictedEntityIds.has(op.entityId)) {
      await db.syncQueue.update(op.opId, {
        failed: true,
        lastError: "skipped: earlier op for this entity conflicted this cycle",
      });
      results.push({ opId: op.opId, status: "failed" });
      continue;
    }

    const result = await pushWithRetry(op);
    if (result.status === "conflict") {
      conflictedEntityIds.add(op.entityId);
    }
    results.push(result);
  }

  return { results };
}
