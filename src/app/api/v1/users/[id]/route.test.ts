import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/v1/users/[id]/route";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  db: { update: vi.fn() },
}));

 
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const ADMIN_ID = "admin-1";
const TARGET_ID = "user-2";

function mockSession(role: string, id = ADMIN_ID) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id, role } as never,
    session: {} as never,
  });
}

function mockNoSession() {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
}

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/v1/users/" + TARGET_ID, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id = TARGET_ID) {
  return { params: Promise.resolve({ id }) };
}

function mockDbUpdate(returnValue: unknown[] = []) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
  };
  vi.mocked(db.update).mockReturnValue(chain as never);
}

describe("PATCH /api/v1/users/[id]", () => {
  it("401 si pas de session", async () => {
    mockNoSession();
    const res = await PATCH(makeReq({ role: "commercial" }), makeParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("403 si commercial (user.manage interdit)", async () => {
    mockSession("commercial");
    const res = await PATCH(makeReq({ role: "operateur" }), makeParams());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("403 si operateur (user.manage interdit)", async () => {
    mockSession("operateur");
    const res = await PATCH(makeReq({ role: "commercial" }), makeParams());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("422 si admin tente de modifier son propre rôle", async () => {
    mockSession("admin", ADMIN_ID);
    const res = await PATCH(makeReq({ role: "commercial" }), makeParams(ADMIN_ID));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("400 si rôle invalide", async () => {
    mockSession("admin");
    const res = await PATCH(makeReq({ role: "superadmin" }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("404 si utilisateur introuvable", async () => {
    mockSession("admin");
    mockDbUpdate([]);
    const res = await PATCH(makeReq({ role: "commercial" }), makeParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("200 succès admin met à jour rôle", async () => {
    mockSession("admin");
    mockDbUpdate([{ id: TARGET_ID, name: "Bob", email: "bob@ex.com", role: "commercial" }]);
    const res = await PATCH(makeReq({ role: "commercial" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(TARGET_ID);
    expect(body.role).toBe("commercial");
  });

  it("400 si body JSON malformé", async () => {
    mockSession("admin");
    const req = new NextRequest("http://localhost/api/v1/users/" + TARGET_ID, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });
});
