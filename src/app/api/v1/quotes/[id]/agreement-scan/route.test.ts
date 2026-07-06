import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/quotes/[id]/agreement-scan/route";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { quote: { findFirst: vi.fn() } },
    select: vi.fn(),
  },
}));

vi.mock("@/lib/storage", () => ({
  upload: vi.fn().mockResolvedValue({ url: "https://storage.example/scan.png" }),
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function mockSession(role: string, companyId: string | null = "co-1") {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "u1", role, companyId, tenantId: null } as never,
    session: {} as never,
  });
}

function mockDbSelectEmpty() {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  vi.mocked(db.select).mockReturnValue(chain as never);
}

function mockQuote(quote: { id: string; companyId: string | null; ownerId: string | null }) {
  vi.mocked(db.query.quote.findFirst).mockResolvedValue(quote as never);
}

function buildRequest(): Request {
  const formData = new FormData();
  const file = new File([new Uint8Array([1, 2, 3])], "scan.png", { type: "image/png" });
  formData.set("scan", file);
  const req = new Request("http://localhost/api/v1/quotes/q1/agreement-scan", {
    method: "POST",
    body: formData,
  });
  // jsdom ne préserve pas File via formData() — bypass (même pattern que companies/logo/route.test.ts)
  vi.spyOn(req, "formData").mockResolvedValue(formData);
  return req;
}

describe("POST /api/v1/quotes/[id]/agreement-scan", () => {
  it("404 si le devis appartient a un autre tenant (admin bypass IDOR)", async () => {
    mockSession("admin", "co-1");
    mockDbSelectEmpty();
    // Le predicat companyId est dans la requete elle-meme : un devis d'un autre
    // tenant ne remonte jamais de la DB (simule ici par findFirst -> undefined).
    vi.mocked(db.query.quote.findFirst).mockResolvedValue(undefined as never);

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: "q1" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("200 si le devis appartient au tenant de l'appelant", async () => {
    mockSession("admin", "co-1");
    mockDbSelectEmpty();
    mockQuote({ id: "q1", companyId: "co-1", ownerId: "someone-else" });

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: "q1" }) });

    expect(res.status).toBe(200);
  });

  it("401 si pas de session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: "q1" }) });

    expect(res.status).toBe(401);
  });

  it("404 si devis introuvable", async () => {
    mockSession("admin", "co-1");
    mockDbSelectEmpty();
    vi.mocked(db.query.quote.findFirst).mockResolvedValue(undefined as never);

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: "q1" }) });

    expect(res.status).toBe(404);
  });

  it("403 si session sans companyId, meme si devis a companyId null (fail closed)", async () => {
    mockSession("admin", null);
    mockDbSelectEmpty();
    mockQuote({ id: "q1", companyId: null, ownerId: "someone-else" });
    const callsBefore = vi.mocked(db.query.quote.findFirst).mock.calls.length;

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: "q1" }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(vi.mocked(db.query.quote.findFirst).mock.calls.length).toBe(callsBefore);
  });
});
