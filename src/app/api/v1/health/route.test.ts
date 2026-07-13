import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  db: {
    execute: vi.fn().mockRejectedValue(new Error("postgres://db.internal:5432/app?password=secret")),
  },
}))

import { GET } from "@/app/api/v1/health/route"

describe("GET /api/v1/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("does not disclose a database exception in its public response", async () => {
    vi.stubEnv("NEON_PROJECT_ID", "")

    const response = await GET()
    const body = await response.json()

    expect(body.checks.database).toMatchObject({
      status: "error",
      schema_applied: false,
      error: "database check failed",
    })
    expect(JSON.stringify(body)).not.toContain("db.internal")
    expect(JSON.stringify(body)).not.toContain("password=secret")
  })
})