import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => { throw new Error("redirect"); }),
}));

import { auth } from "@/lib/auth";
import { requireOwnerSession } from "./session";

function mockSession(role: string) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "uid-1", role } as never,
    session: {} as never,
  });
}

function mockNoSession() {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireOwnerSession", () => {
  it("returns ok=true for superadmin", async () => {
    mockSession("superadmin");
    const result = await requireOwnerSession();
    expect(result.ok).toBe(true);
  });

  it("returns 403 for admin (non-superadmin)", async () => {
    mockSession("admin");
    const result = await requireOwnerSession();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("returns 403 for commercial", async () => {
    mockSession("commercial");
    const result = await requireOwnerSession();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("returns 401 for unauthenticated request", async () => {
    mockNoSession();
    const result = await requireOwnerSession();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe("UNAUTHORIZED");
    }
  });
});
