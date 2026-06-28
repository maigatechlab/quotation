import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkQuota } from "./quota-check";
import {
  TIER_QUOTAS,
  GRACE_PERIOD_DAYS,
  QUOTA_WARNING_THRESHOLD,
  nextResetDate,
} from "./quota-config";

// ---------------------------------------------------------------------------
// quota-config tests
// ---------------------------------------------------------------------------

describe("TIER_QUOTAS", () => {
  it("starter has 50 quotes/month limit", () => {
    expect(TIER_QUOTAS.starter.quotesPerMonth).toBe(50);
  });

  it("pro has null (unlimited) quotes", () => {
    expect(TIER_QUOTAS.pro.quotesPerMonth).toBeNull();
  });

  it("entreprise has 10 users max", () => {
    expect(TIER_QUOTAS.entreprise.usersMax).toBe(10);
  });

  it("starter has usersMax 1", () => {
    expect(TIER_QUOTAS.starter.usersMax).toBe(1);
  });

  it("starter has routeTemplatesAllowed false", () => {
    expect(TIER_QUOTAS.starter.routeTemplatesAllowed).toBe(false);
  });

  it("pro has routeTemplatesAllowed true", () => {
    expect(TIER_QUOTAS.pro.routeTemplatesAllowed).toBe(true);
  });

  it("grace period is 7 days", () => {
    expect(GRACE_PERIOD_DAYS).toBe(7);
  });

  it("warning threshold is 80%", () => {
    expect(QUOTA_WARNING_THRESHOLD).toBe(0.8);
  });
});

describe("nextResetDate", () => {
  it("returns the first day of next month at midnight UTC", () => {
    const result = nextResetDate();
    expect(result.getUTCDate()).toBe(1);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result > new Date()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkQuota tests (with mocked DB)
// ---------------------------------------------------------------------------

const makeSub = (overrides: Record<string, unknown> = {}) => ({
  id: "sub-1",
  companyId: "company-1",
  tier: "starter",
  quotaStatus: "ok",
  quotaUsedQuotes: 0,
  quotaUsedUsers: 0,
  quotaResetAt: nextResetDate(), // future
  graceExpiresAt: null,
  exceededAt: null,
  notified80pct: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("checkQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows quote creation when under limit", async () => {
    const sub = makeSub({ quotaUsedQuotes: 30 });
    // Mock DB that returns sub for subscription query and count for user query
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([sub]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([sub]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    } as unknown as Parameters<typeof checkQuota>[2];

    const result = await checkQuota("company-1", "quote.create", dbMock);
    expect(result.allowed).toBe(true);
  });

  it("blocks quote creation when limit reached (50)", async () => {
    const sub = makeSub({ quotaUsedQuotes: 50 });
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([sub]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([sub]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    } as unknown as Parameters<typeof checkQuota>[2];

    const result = await checkQuota("company-1", "quote.create", dbMock);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("QUOTA_EXCEEDED");
    }
  });

  it("blocks when in readonly mode", async () => {
    const sub = makeSub({ quotaStatus: "readonly" });
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([sub]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([sub]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    } as unknown as Parameters<typeof checkQuota>[2];

    const result = await checkQuota("company-1", "quote.create", dbMock);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("READONLY_MODE");
    }
  });

  it("returns warn80pct=true at 80% threshold (40th quote)", async () => {
    // At 39 used, creating 40th = 40/50 = 80% → triggers warning
    const sub = makeSub({ quotaUsedQuotes: 39, notified80pct: false });
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([sub]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([sub]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    } as unknown as Parameters<typeof checkQuota>[2];

    const result = await checkQuota("company-1", "quote.create", dbMock);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.warn80pct).toBe(true);
    }
  });

  it("no warn80pct when already notified", async () => {
    const sub = makeSub({ quotaUsedQuotes: 39, notified80pct: true });
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([sub]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([sub]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    } as unknown as Parameters<typeof checkQuota>[2];

    const result = await checkQuota("company-1", "quote.create", dbMock);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.warn80pct).toBe(false);
    }
  });

  it("pro tier allows unlimited quotes", async () => {
    const sub = makeSub({ tier: "pro", quotaUsedQuotes: 9999 });
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([sub]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([sub]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    } as unknown as Parameters<typeof checkQuota>[2];

    const result = await checkQuota("company-1", "quote.create", dbMock);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.limit).toBeNull();
    }
  });

  it("transitions exceeded to readonly when grace period expired", async () => {
    const pastDate = new Date(Date.now() - 86_400_000); // 1 day ago
    const sub = makeSub({
      quotaStatus: "exceeded",
      graceExpiresAt: pastDate,
    });
    const updateSetMock = vi.fn().mockReturnThis();
    const updateWhereMock = vi.fn().mockResolvedValue([]);
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(function (this: unknown) {
        return { limit: vi.fn().mockResolvedValue([sub]) };
      }),
      limit: vi.fn().mockResolvedValue([sub]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([sub]),
      update: vi.fn().mockReturnValue({ set: updateSetMock }),
    } as unknown as Parameters<typeof checkQuota>[2];
    updateSetMock.mockReturnValue({ where: updateWhereMock });

    const result = await checkQuota("company-1", "quote.create", dbMock);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("READONLY_MODE");
    }
  });
});
