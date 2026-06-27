import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/sync/pull/route";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const CID = "cid-aaaaaaaa-0000-0000-0000-000000000000";

function mockSession(companyId: string | null = CID) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "uid-1", role: "admin", companyId } as never,
    session: {} as never,
  });
}

// Six selects execute in parallel (clients, quotes, quoteLines, clauses, templates, company).
// select().from().where() — where() is terminal (no .limit() in pull route).
function mockAllSelects(rowsPerTable: unknown[][] = [[], [], [], [], [], []]) {
  let idx = 0;
  vi.mocked(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => Promise.resolve(rowsPerTable[idx++] ?? [])),
  } as never));
}

function makeReq(since?: string) {
  const url = "http://localhost/api/v1/sync/pull" + (since ? `?since=${encodeURIComponent(since)}` : "");
  return new Request(url);
}

describe("GET /api/v1/sync/pull", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("empty payload when user has no companyId — zero DB calls", async () => {
    mockSession(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { entities: Record<string, unknown> };
    expect(body.entities.clients).toEqual([]);
    expect(body.entities.quotes).toEqual([]);
    expect(body.entities.company).toBeNull();
    // Fail-closed: no DB queries, nothing leaked
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns tenant-scoped entities when companyId set", async () => {
    mockSession(CID);
    const client = { id: "cl-1", companyId: CID, companyName: "Test" };
    mockAllSelects([
      [client], // clients
      [],       // quotes
      [],       // quoteLines
      [],       // clauses
      [],       // templates
      [{ id: CID, raisonSociale: "Ma Société" }], // company
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    type PullBody = {
      cursor: string;
      entities: {
        clients: unknown[];
        quotes: unknown[];
        quoteLines: unknown[];
        clauses: unknown[];
        templates: unknown[];
        company: unknown;
      };
    };
    const body = await res.json() as PullBody;
    expect(body.entities.clients).toHaveLength(1);
    expect((body.entities.clients[0]! as Record<string, unknown>).companyId).toBe(CID);
    expect(body.entities.company).toMatchObject({ id: CID });
    expect(typeof body.cursor).toBe("string");
    // All 6 selects must have been called (one per entity table)
    expect(db.select).toHaveBeenCalledTimes(6);
  });

  it("returns null company when no company row updated since cursor", async () => {
    mockSession(CID);
    mockAllSelects([[], [], [], [], [], []]); // all empty including company

    const res = await GET(makeReq(new Date().toISOString()));
    expect(res.status).toBe(200);
    const body = await res.json() as { entities: { company: unknown } };
    expect(body.entities.company).toBeNull();
  });
});
