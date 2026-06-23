import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

// Smoke test — Story 1.1 (T2). Validates that the Vitest runner is wired up
// (alias, jsdom, React plugin) and that `cn()` merges Tailwind classes correctly.
// A regression here means the test harness itself is broken.
describe("cn", () => {
  it("déduit les classes Tailwind en conflit en gardant la dernière", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("ignore les valeurs falsy", () => {
    expect(cn("a", false, undefined, null, "", "b")).toBe("a b");
  });
});
