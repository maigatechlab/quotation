import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  runExpiryJob: vi.fn<() => Promise<unknown>>(() =>
    Promise.resolve({ processed: { reminders: 0, suspended: 0, graceExpired: 0, errors: 0 }, errorTenantIds: [], at: "2026-07-01T00:00:00.000Z" })
  ),
}));

vi.mock("@/lib/cron/expiry-job", () => ({
  runExpiryJob: (...args: unknown[]) => h.runExpiryJob(...(args as [])),
}));

import { GET } from "./route";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: "dev-secret" };
  h.runExpiryJob.mockClear();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.clearAllMocks();
});

describe("GET /api/cron/expiry-reminders", () => {
  it("401 when Authorization header is missing", async () => {
    const res = await GET(new Request("http://localhost/api/cron/expiry-reminders"));
    expect(res.status).toBe(401);
    expect(h.runExpiryJob).not.toHaveBeenCalled();
  });

  it("401 when Authorization header does not match CRON_SECRET", async () => {
    const res = await GET(
      new Request("http://localhost/api/cron/expiry-reminders", {
        headers: { authorization: "Bearer wrong" },
      })
    );
    expect(res.status).toBe(401);
    expect(h.runExpiryJob).not.toHaveBeenCalled();
  });

  it("500 when CRON_SECRET is not configured", async () => {
    process.env.CRON_SECRET = "";
    const res = await GET(
      new Request("http://localhost/api/cron/expiry-reminders", {
        headers: { authorization: "Bearer dev-secret" },
      })
    );
    expect(res.status).toBe(500);
    expect(h.runExpiryJob).not.toHaveBeenCalled();
  });

  it("200 with correct header, runExpiryJob called exactly once", async () => {
    const res = await GET(
      new Request("http://localhost/api/cron/expiry-reminders", {
        headers: { authorization: "Bearer dev-secret" },
      })
    );
    expect(res.status).toBe(200);
    expect(h.runExpiryJob).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body.processed).toBeDefined();
  });
});
