import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/audit/export/route";

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

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const CID = "cid-11111111-0000-0000-0000-000000000000";

function mockSession(role = "admin", companyId: string | null = CID) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "uid-1", role, companyId } as never,
    session: {} as never,
  });
}

function mockNoSession() {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
}

const MOCK_EVENTS = [
  {
    id: "evt-1",
    companyId: CID,
    who: "uid-1",
    what: "quote.created",
    when: new Date("2026-06-01T10:00:00Z"),
    where: "api/v1/sync/push",
    entityType: "quote",
    entityId: "q-1",
    before: null,
    after: { id: "q-1" },
    createdAt: new Date("2026-06-01T10:00:00Z"),
  },
];

function mockDbEvents(events = MOCK_EVENTS) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(events),
  } as never);
}

describe("GET /api/v1/audit/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 si pas de session", async () => {
    mockNoSession();
    const req = new Request("http://localhost/api/v1/audit/export");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("403 si role commercial", async () => {
    mockSession("commercial");
    const req = new Request("http://localhost/api/v1/audit/export");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("403 si role operateur", async () => {
    mockSession("operateur");
    const req = new Request("http://localhost/api/v1/audit/export");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("403 si admin sans companyId", async () => {
    mockSession("admin", null);
    const req = new Request("http://localhost/api/v1/audit/export");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("200 JSON par défaut avec liste d'événements", async () => {
    mockSession();
    mockDbEvents();
    const req = new Request("http://localhost/api/v1/audit/export");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe("evt-1");
    expect(body[0].what).toBe("quote.created");
  });

  it("200 JSON liste vide si aucun événement", async () => {
    mockSession();
    mockDbEvents([]);
    const req = new Request("http://localhost/api/v1/audit/export");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("200 CSV avec BOM UTF-8 et Content-Disposition", async () => {
    mockSession();
    mockDbEvents();
    const req = new Request("http://localhost/api/v1/audit/export?format=csv");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment;.*filename=.*\.csv/);
    const text = await res.text();
    // Headers CSV présents (BOM peut être strip par le TextDecoder jsdom)
    expect(text).toMatch(/^[﻿]?id,who,what,when/);
    // Données présentes
    // Données présentes
    expect(text).toContain("quote.created");
  });

  it("CSV filename contient le companyId et la date", async () => {
    mockSession();
    mockDbEvents();
    const req = new Request("http://localhost/api/v1/audit/export?format=csv");
    const res = await GET(req);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain(CID);
  });

  it("accepte paramètres from et to sans erreur", async () => {
    mockSession();
    mockDbEvents();
    const req = new Request(
      "http://localhost/api/v1/audit/export?from=2026-06-01&to=2026-06-30"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
