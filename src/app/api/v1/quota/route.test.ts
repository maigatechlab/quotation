import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/quota/route";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/quota/quota-check", () => ({
  getOrCreateSubscription: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateSubscription } from "@/lib/quota/quota-check";
import { nextResetDate } from "@/lib/quota/quota-config";

const CID = "cid-22222222-0000-0000-0000-000000000000";
const FUTURE = nextResetDate(); // 1er du mois prochain — cohérent avec la logique réelle

function mockSession(companyId: string | null = CID) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "uid-1", companyId } as never,
    session: {} as never,
  });
}

function mockNoSession() {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
}

function mockSub(overrides: Record<string, unknown> = {}) {
  vi.mocked(getOrCreateSubscription).mockResolvedValue({
    id: "sub-1",
    companyId: CID,
    tier: "starter",
    quotaStatus: "ok",
    quotaUsedQuotes: 10,
    quotaUsedUsers: 0,
    quotaResetAt: FUTURE,
    graceExpiresAt: null,
    exceededAt: null,
    notified80pct: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never);
}

function mockUserCount(n = 1) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: n }]),
  } as never);
}

describe("GET /api/v1/quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 si pas de session", async () => {
    mockNoSession();
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("403 si pas de companyId", async () => {
    mockSession(null);
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("200 avec structure tier + quotas + status", async () => {
    mockSession();
    mockSub({ quotaUsedQuotes: 15 });
    mockUserCount(1);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe("starter");
    expect(body.quotaStatus).toBe("ok");
    expect(body.quotas.quotes.limit).toBe(50);
    expect(body.quotas.quotes.used).toBe(15);
    expect(body.quotas.users.used).toBe(1);
    expect(body.graceExpiresAt).toBeNull();
    expect(body.daysRemaining).toBeNull();
  });

  it("retourne null limit pour tier pro (illimité)", async () => {
    mockSession();
    mockSub({ tier: "pro", quotaUsedQuotes: 999 });
    mockUserCount(2);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe("pro");
    expect(body.quotas.quotes.limit).toBeNull();
    expect(body.quotas.users.limit).toBe(3);
  });

  it("retourne daysRemaining si graceExpiresAt défini", async () => {
    mockSession();
    const graceExpiresAt = new Date(Date.now() + 3 * 86_400_000);
    mockSub({ quotaStatus: "exceeded", graceExpiresAt });
    mockUserCount(1);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quotaStatus).toBe("exceeded");
    expect(body.daysRemaining).toBeGreaterThanOrEqual(2);
    expect(body.daysRemaining).toBeLessThanOrEqual(3);
    expect(body.graceExpiresAt).not.toBeNull();
  });

  it("resetAt est une ISO string valide", async () => {
    mockSession();
    mockSub();
    mockUserCount(1);
    const res = await GET();
    const body = await res.json();
    expect(() => new Date(body.quotas.quotes.resetAt)).not.toThrow();
    expect(new Date(body.quotas.quotes.resetAt).getUTCDate()).toBe(1);
  });
});
