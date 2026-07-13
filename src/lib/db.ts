import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.POSTGRES_URL as string;

if (!connectionString) {
  throw new Error("POSTGRES_URL environment variable is not set");
}

const DEFAULT_POOL_MAX = 10;

/**
 * Allows constrained environments, such as the local E2E database, to limit
 * the postgres-js pool per process. Production keeps the existing default.
 */
function getPostgresPoolMax(): number {
  const configured = process.env.POSTGRES_POOL_MAX;
  if (!configured) return DEFAULT_POOL_MAX;

  const parsed = Number(configured);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_MAX;
}

// In dev, Next.js re-evaluates this module on every recompile; without a
// global singleton each recompile opens a fresh pool and Postgres eventually
// rejects connections ("sorry, too many clients already").
const globalForDb = globalThis as unknown as { __pgClient?: ReturnType<typeof postgres> };

const client = globalForDb.__pgClient ?? postgres(connectionString, { max: getPostgresPoolMax() });
if (process.env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
