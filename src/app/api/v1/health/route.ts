import { NextResponse } from "next/server";

type HealthStatus = "ok" | "warn" | "error";

interface DatabaseCheck {
  status: HealthStatus;
  schema_applied: boolean;
  latency_ms?: number;
  error?: string;
}

interface BackupCheck {
  status: HealthStatus;
  note: string;
  last_verified?: string;  // set only when Neon API confirmed ok
  last_checked?: string;   // set on warn/error — when check ran but didn't verify
}

interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  checks: {
    database: DatabaseCheck;
    storage: { status: HealthStatus; configured: boolean };
    sync: { status: HealthStatus };
    backup: BackupCheck;
  };
}

// Module-level cache: reused across warm function instances (5-minute TTL)
let neonCache: { result: BackupCheck; ts: number } | null = null;
const NEON_CACHE_TTL = 5 * 60 * 1000;

async function checkDatabase(start: number): Promise<DatabaseCheck> {
  try {
    const [{ db }, { sql }, { user: userTable }] = await Promise.all([
      import("@/lib/db"),
      import("drizzle-orm"),
      import("@/lib/schema"),
    ]);

    // Single 1200ms deadline covers ping + schema — schema query has no own timeout
    const dbWork = (async () => {
      await db.execute(sql`SELECT 1 as ping`);
      let schema_applied = false;
      try {
        await db.select().from(userTable).limit(1);
        schema_applied = true;
      } catch {
        schema_applied = false;
      }
      return schema_applied;
    })();

    const schema_applied = await Promise.race([
      dbWork,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 1200)
      ),
    ]);

    const latency_ms = Date.now() - start;
    return { status: "ok", schema_applied, latency_ms };
  } catch (e) {
    return {
      status: "error",
      schema_applied: false,
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}

async function checkNeonBackup(): Promise<BackupCheck> {
  const projectId = process.env.NEON_PROJECT_ID;
  const apiKey = process.env.NEON_API_KEY;

  if (!projectId) {
    return { status: "warn", note: "NEON_PROJECT_ID not set — backup status unknown" };
  }
  if (!apiKey) {
    return { status: "warn", note: "NEON_API_KEY not set — cannot verify backup status" };
  }

  // Return cached result if recent
  const now = Date.now();
  if (neonCache && now - neonCache.ts < NEON_CACHE_TTL) {
    return neonCache.result;
  }

  try {
    const res = await Promise.race([
      fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 800)
      ),
    ]);

    const checkedAt = new Date(now).toISOString();
    if (res.ok) {
      const result: BackupCheck = {
        status: "ok",
        note: "Neon PITR project accessible",
        last_verified: checkedAt,
      };
      neonCache = { result, ts: now };
      return result;
    }
    const result: BackupCheck = {
      status: "warn",
      note: `Neon API responded HTTP ${res.status}`,
      last_checked: checkedAt,
    };
    neonCache = { result, ts: now };
    return result;
  } catch (e) {
    const checkedAt = new Date(now).toISOString();
    const note =
      e instanceof Error && e.message === "timeout"
        ? "Neon API timeout (>800ms)"
        : "Neon API unreachable";
    const result: BackupCheck = { status: "warn", note, last_checked: checkedAt };
    neonCache = { result, ts: now };
    return result;
  }
}

// Public endpoint — no auth required (for external monitoring tools)
export async function GET() {
  const start = Date.now();

  // Run DB check and backup check in parallel to keep total latency ≤ max(1200, 800) ms
  const [database, backup] = await Promise.all([
    checkDatabase(start),
    checkNeonBackup(),
  ]);

  const storageConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const storageStatus: HealthStatus = storageConfigured ? "ok" : "warn";

  const overallStatus: HealthStatus = (() => {
    if (database.status === "error") return "error";
    if (
      database.status === "warn" ||
      !database.schema_applied ||
      storageStatus === "warn" ||
      backup.status === "warn"
    )
      return "warn";
    return "ok";
  })();

  const body: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: "1",
    checks: {
      database,
      storage: { status: storageStatus, configured: storageConfigured },
      sync: { status: "ok" },
      backup,
    },
  };

  // Always HTTP 200 — monitoring tools read the JSON `status` field
  return NextResponse.json(body, { status: 200 });
}
