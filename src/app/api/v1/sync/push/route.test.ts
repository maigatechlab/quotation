import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/sync/push/route";

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
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/audit", () => ({
  createAuditEvent: vi.fn().mockReturnValue({}),
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const CID_A = "cid-aaaaaaaa-0000-0000-0000-000000000000";
const CID_B = "cid-bbbbbbbb-0000-0000-0000-000000000000";

function mockSession(role = "admin", companyId: string | null = CID_A) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "uid-1", role, companyId } as never,
    session: {} as never,
  });
}

// select().from().where().limit() chain used in push route
function mockSelectOnce(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  } as never);
}

// Universal insert mock — handles both .values() await and .values().onConflictDoUpdate() await
function mockAllInserts() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue([]);
  vi.mocked(db.insert).mockImplementation(() => ({
    values: vi.fn().mockImplementation(() =>
      Object.assign(Promise.resolve([]), { onConflictDoUpdate })
    ),
  } as never));
}

function mockUpdateOnce() {
  vi.mocked(db.update).mockReturnValueOnce({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  } as never);
}

const BASE_OP = {
  opId: "op-test-1",
  entity: "client",
  entityId: "ent-00000000-0000-0000-0000-000000000001",
  type: "create",
  payload: { companyName: "ACME", phone: "70000000" },
  baseRevision: 0,
  queuedAt: new Date().toISOString(),
};

function makeReq(ops: unknown[] = [BASE_OP]) {
  return new Request("http://localhost/api/v1/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
}

describe("POST /api/v1/sync/push", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("403 when user has no companyId — zero DB calls", async () => {
    mockSession("admin", null);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    // Fail-closed: no DB access before the check
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("400 when body is malformed JSON", async () => {
    mockSession();
    const req = new Request("http://localhost/api/v1/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 when ops array is empty", async () => {
    mockSession();
    const res = await POST(makeReq([]));
    expect(res.status).toBe(400);
  });

  it("403 on ownership violation — entity belongs to different company", async () => {
    mockSession("admin", CID_A);
    mockSelectOnce([]); // idempotency → op not seen before
    mockSelectOnce([{ id: BASE_OP.entityId, companyId: CID_B, revision: 1 }]); // entity owned by CID_B

    const updateOp = { ...BASE_OP, type: "update", baseRevision: 1 };
    const res = await POST(makeReq([updateOp]));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("409 on revision conflict — returns HTTP 409 with server entity", async () => {
    mockSession("admin", CID_A);
    const serverEntity = { id: BASE_OP.entityId, companyId: CID_A, revision: 5 };
    mockSelectOnce([]); // idempotency → not seen
    mockSelectOnce([serverEntity]); // entity: revision 5 > baseRevision 1 + 1
    mockAllInserts(); // syncOpLog insert for conflict log

    const updateOp = { ...BASE_OP, type: "update", baseRevision: 1 };
    const res = await POST(makeReq([updateOp]));
    expect(res.status).toBe(409);
    const body = await res.json() as { results: Array<{ status: string; entity: unknown }> };
    expect(body.results[0]!.status).toBe("conflict");
    expect(body.results[0]!.entity).toMatchObject({ revision: 5 });
  });

  it("propagates DB error — not swallowed as noop", async () => {
    mockSession("admin", CID_A);
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error("db_connection_failed")),
    } as never);

    await expect(POST(makeReq())).rejects.toThrow("db_connection_failed");
  });

  it("200 applied — create op persisted and removed from retry queue", async () => {
    mockSession("admin", CID_A);
    mockSelectOnce([]); // idempotency → not seen
    mockSelectOnce([]); // entity doesn't exist yet
    mockAllInserts();

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { results: Array<{ status: string }> };
    expect(body.results[0]!.status).toBe("applied");
  });

  it("200 noop — idempotent re-send of same opId makes no writes", async () => {
    mockSession("admin", CID_A);
    mockSelectOnce([{ opId: BASE_OP.opId }]); // idempotency → already logged

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { results: Array<{ status: string }> };
    expect(body.results[0]!.status).toBe("noop");
    expect(db.insert).not.toHaveBeenCalled();
  });

  // Per-entity permission gate (company.update)
  it("403 when commercial pushes company sync op — company.update denied, no DB calls", async () => {
    mockSession("commercial", CID_A);
    const companyOp = {
      ...BASE_OP,
      entity: "company",
      entityId: CID_A,
      type: "update",
      payload: { signataireNom: "Forged", signataireFonction: "Hacker" },
      baseRevision: 1,
    };
    const res = await POST(makeReq([companyOp]));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("422 when admin deletes client with associated quotes — server blocks delete", async () => {
    mockSession("admin", CID_A);
    const deleteOp = { ...BASE_OP, type: "delete", baseRevision: 1 };
    mockSelectOnce([]); // idempotency → op not seen
    mockSelectOnce([{ id: BASE_OP.entityId, companyId: CID_A, ownerId: "uid-1", revision: 1 }]); // fetchCurrentEntity
    mockSelectOnce([{ id: "quote-1", clientId: BASE_OP.entityId }]); // linked quote exists
    const res = await POST(makeReq([deleteOp]));
    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("200 when admin deletes client with no quotes — soft delete applied", async () => {
    mockSession("admin", CID_A);
    const deleteOp = { ...BASE_OP, type: "delete", baseRevision: 1 };
    mockSelectOnce([]); // idempotency → op not seen
    mockSelectOnce([{ id: BASE_OP.entityId, companyId: CID_A, ownerId: "uid-1", revision: 1 }]); // fetchCurrentEntity
    mockSelectOnce([]); // no linked quotes
    mockUpdateOnce(); // soft delete update
    mockAllInserts(); // syncOpLog insert
    const res = await POST(makeReq([deleteOp]));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: Array<{ status: string }> };
    expect(body.results[0]!.status).toBe("applied");
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("403 when operateur pushes company sync op — company.update denied, no DB calls", async () => {
    mockSession("operateur", CID_A);
    const companyOp = {
      ...BASE_OP,
      entity: "company",
      entityId: CID_A,
      type: "update",
      payload: { signataireNom: "Forged" },
      baseRevision: 1,
    };
    const res = await POST(makeReq([companyOp]));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  // "own" perm: cross-user same-tenant
  it("403 when commercial updates client owned by different user — own perm enforced", async () => {
    const OTHER_UID = "uid-other";
    mockSession("commercial", CID_A); // session user = "uid-1"
    mockSelectOnce([]); // idempotency → op not seen
    mockSelectOnce([{ id: BASE_OP.entityId, companyId: CID_A, ownerId: OTHER_UID, revision: 1 }]); // entity owned by different user, same tenant

    const updateOp = { ...BASE_OP, entity: "client", type: "update", baseRevision: 1 };
    const res = await POST(makeReq([updateOp]));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(db.insert).not.toHaveBeenCalled();
  });
});
