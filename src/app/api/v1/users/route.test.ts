import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/users/route";

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

function mockSession(role: string) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "u1", role } as never,
    session: {} as never,
  });
}

function mockNoSession() {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
}

function mockDbUsers() {
  const chain = {
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([
      { id: "u1", name: "Alice", email: "alice@ex.com", role: "admin", createdAt: new Date() },
    ]),
  };
  vi.mocked(db.select).mockReturnValue(chain as never);
}

describe("GET /api/v1/users", () => {
  it("401 si pas de session", async () => {
    mockNoSession();
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("403 si commercial (user.read interdit)", async () => {
    mockSession("commercial");
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("403 si operateur (user.read interdit)", async () => {
    mockSession("operateur");
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("200 avec liste si admin", async () => {
    mockSession("admin");
    mockDbUsers();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe("u1");
  });
});
