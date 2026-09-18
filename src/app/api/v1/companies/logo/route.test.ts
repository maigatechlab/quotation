import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/companies/logo/route";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/audit", () => ({
  createAuditEvent: vi.fn().mockReturnValue({}),
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage", () => ({
  upload: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { upload } from "@/lib/storage";

const CID = "cid-44444444-0000-0000-0000-000000000000";
const LOGO_URL = "https://blob.vercel.com/logo.png";

function mockSession(role = "admin", companyId: string | null = CID) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "uid-1", role, companyId } as never,
    session: {} as never,
  });
}

function mockNoSession() {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
}

function mockDbUpdate() {
  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  } as never);
}

function makeLogoRequest(
  fileContent = "fake-image-data",
  fileType = "image/png",
  fileName = "logo.png",
  sizeBytes?: number
): Request {
  const content = sizeBytes
    ? new Uint8Array(sizeBytes).fill(65)
    : new TextEncoder().encode(fileContent);
  const file = new File([content], fileName, { type: fileType });
  const formData = new FormData();
  formData.append("logo", file);
  const req = new Request("http://localhost/api/v1/companies/logo", {
    method: "POST",
    body: formData,
  });
  // Bypass Request serialization — jsdom ne préserve pas File via formData()
  vi.spyOn(req, "formData").mockResolvedValue(formData);
  return req;
}

describe("POST /api/v1/companies/logo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 si pas de session", async () => {
    mockNoSession();
    const res = await POST(makeLogoRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("403 si role commercial", async () => {
    mockSession("commercial");
    const res = await POST(makeLogoRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("403 si admin sans companyId", async () => {
    mockSession("admin", null);
    const res = await POST(makeLogoRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("400 si aucun fichier envoyé", async () => {
    mockSession();
    const formData = new FormData();
    const req = new Request("http://localhost/api/v1/companies/logo", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("400 si type de fichier non supporté (GIF)", async () => {
    mockSession();
    const res = await POST(makeLogoRequest("gif-data", "image/gif", "logo.gif"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.fields?.logo).toBeTruthy();
  });

  it("400 si fichier trop volumineux (> 2 Mo)", async () => {
    mockSession();
    // 2MB + 1 byte
    const res = await POST(makeLogoRequest(undefined, "image/png", "big.png", 2 * 1024 * 1024 + 1));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.fields?.logo).toBeTruthy();
  });

  it("200 avec logoUrl si upload réussi (PNG)", async () => {
    mockSession();
    vi.mocked(upload).mockResolvedValue({ url: LOGO_URL } as never);
    mockDbUpdate();
    // Bypass Request serialization — jsdom ne préserve pas File via formData()
    const file = new File([new Uint8Array(100)], "logo.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("logo", file);
    const req = new Request("http://localhost/api/v1/companies/logo", {
      method: "POST",
      body: formData,
    });
    vi.spyOn(req, "formData").mockResolvedValue(formData);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logoUrl).toBe(LOGO_URL);
  });

  it("200 avec logoUrl si upload réussi (JPEG)", async () => {
    mockSession();
    vi.mocked(upload).mockResolvedValue({ url: LOGO_URL } as never);
    mockDbUpdate();
    const file = new File([new Uint8Array(100)], "logo.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("logo", file);
    const req = new Request("http://localhost/api/v1/companies/logo", {
      method: "POST",
      body: formData,
    });
    vi.spyOn(req, "formData").mockResolvedValue(formData);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logoUrl).toBe(LOGO_URL);
  });
});
