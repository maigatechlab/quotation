import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePermission, useRole } from "@/hooks/use-role";

vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(),
}));
import { useSession } from "@/lib/auth-client";

function mockSession(role?: string) {
  vi.mocked(useSession).mockReturnValue({
    data: role ? { user: { id: "u1", role } as never, session: {} as never } : null,
    error: null,
    isPending: false,
  } as never);
}

describe("useRole", () => {
  it("retourne 'admin' quand la session contient role='admin'", () => {
    mockSession("admin");
    const { result } = renderHook(() => useRole());
    expect(result.current).toBe("admin");
  });

  it("retourne 'commercial' quand la session contient role='commercial'", () => {
    mockSession("commercial");
    const { result } = renderHook(() => useRole());
    expect(result.current).toBe("commercial");
  });

  it("retourne 'operateur' quand la session contient role='operateur'", () => {
    mockSession("operateur");
    const { result } = renderHook(() => useRole());
    expect(result.current).toBe("operateur");
  });

  it("fallback 'commercial' si session null", () => {
    mockSession();
    const { result } = renderHook(() => useRole());
    expect(result.current).toBe("commercial");
  });
});

describe("usePermission", () => {
  it("admin peut 'user.manage'", () => {
    mockSession("admin");
    const { result } = renderHook(() => usePermission("user.manage"));
    expect(result.current).toBe(true);
  });

  it("commercial ne peut pas 'user.manage'", () => {
    mockSession("commercial");
    const { result } = renderHook(() => usePermission("user.manage"));
    expect(result.current).toBe(false);
  });

  it("operateur ne peut pas 'user.manage'", () => {
    mockSession("operateur");
    const { result } = renderHook(() => usePermission("user.manage"));
    expect(result.current).toBe(false);
  });

  it("commercial peut 'quote.create'", () => {
    mockSession("commercial");
    const { result } = renderHook(() => usePermission("quote.create"));
    expect(result.current).toBe(true);
  });

  it("fallback commercial sans session ne peut pas 'user.read'", () => {
    mockSession();
    const { result } = renderHook(() => usePermission("user.read"));
    expect(result.current).toBe(false);
  });
});
