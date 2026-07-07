import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/v1/companies/route";

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
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/audit", () => ({
  createAuditEvent: vi.fn().mockReturnValue({}),
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const CID = "cid-33333333-0000-0000-0000-000000000000";

const MOCK_COMPANY = {
  id: CID,
  raisonSociale: "SARL Transport Niger",
  rccm: "NE-NIY-2024-B-001",
  nif: "123456789",
  phones: ["+227 90 00 00 00"],
  emails: ["contact@transport-niger.ne"],
  pays: "NE",
  revision: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  formeJuridique: null,
  capital: null,
  adresse: null,
  bp: null,
  logoUrl: null,
  signataireNom: null,
  signataireFonction: null,
  conditionsPaiementDefaut: null,
};

function mockSession(
  role = "admin",
  companyId: string | null = CID,
  userId = "uid-1"
) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: userId, role, companyId } as never,
    session: {} as never,
  });
}

function mockNoSession() {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  raisonSociale: "SARL Transport Niger",
  rccm: "NE-NIY-2024-B-001",
  nif: "123456789",
  phones: ["+227 90 00 00 00"],
};

// --------------------------------------------------------------------------
// GET tests
// --------------------------------------------------------------------------

describe("GET /api/v1/companies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 si pas de session", async () => {
    mockNoSession();
    const res = await GET(new Request("http://localhost/api/v1/companies"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("200 null si user sans companyId", async () => {
    mockSession("admin", null);
    const res = await GET(new Request("http://localhost/api/v1/companies"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });

  it("200 avec la société si companyId présent", async () => {
    mockSession();
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([MOCK_COMPANY]),
    } as never);
    const res = await GET(new Request("http://localhost/api/v1/companies"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CID);
    expect(body.raisonSociale).toBe("SARL Transport Niger");
  });

  it("200 null si société introuvable en base", async () => {
    mockSession();
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    } as never);
    const res = await GET(new Request("http://localhost/api/v1/companies"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });
});

// --------------------------------------------------------------------------
// POST tests
// --------------------------------------------------------------------------

describe("POST /api/v1/companies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 si pas de session", async () => {
    mockNoSession();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("403 si role commercial", async () => {
    mockSession("commercial");
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("403 si role operateur", async () => {
    mockSession("operateur");
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("409 si société déjà configurée (ligne company existante pour ce companyId)", async () => {
    mockSession("admin", CID);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([MOCK_COMPANY]),
    } as never);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
  });

  it("201 si companyId placeholder (assigné à la création du tenant) sans ligne company — bootstrap sur cet id", async () => {
    mockSession("admin", CID);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    } as never);
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      const tx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...MOCK_COMPANY, id: CID }]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "uid-1" }]),
            }),
          }),
        }),
      };
      return cb(tx as never);
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(CID);
  });

  it("400 si corps JSON invalide", async () => {
    mockSession("admin", null);
    const req = new Request("http://localhost/api/v1/companies", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("400 si champs obligatoires manquants", async () => {
    mockSession("admin", null);
    const res = await POST(makeRequest({ raisonSociale: "X" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("201 avec société créée si admin sans companyId existant", async () => {
    mockSession("admin", null);
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([MOCK_COMPANY]),
      };
      const updateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "uid-1" }]),
          }),
        }),
      };
      return fn({
        insert: vi.fn().mockReturnValue(insertChain),
        update: vi.fn().mockReturnValue(updateChain),
      } as never);
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.raisonSociale).toBe("SARL Transport Niger");
  });
});
