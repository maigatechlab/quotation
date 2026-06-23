import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BottomNav, shouldHideNav } from "@/components/nav/bottom-nav";

const mocks = vi.hoisted(() => ({
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => mocks.pathname),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string) => {
    const messages: Record<string, string> = {
      main: "Navigation principale",
      home: "Accueil",
      quotes: "Devis",
      newQuote: "Nouveau devis",
      clients: "Clients",
      account: "Compte",
    };
    return messages[key] ?? key;
  }),
}));

vi.mock("next/link", () => ({
  default: vi.fn(
    ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      createElement("a", { href: href?.toString(), ...props }, children)
    ),
  ),
}));

describe("shouldHideNav", () => {
  it("n'est pas caché sur les routes applicatives principales", () => {
    expect(shouldHideNav("/")).toBe(false);
    expect(shouldHideNav("/devis")).toBe(false);
    expect(shouldHideNav("/clients")).toBe(false);
    expect(shouldHideNav("/parametres")).toBe(false);
  });

  it("est caché sur les routes auth et les routes plein écran", () => {
    expect(shouldHideNav("/login")).toBe(true);
    expect(shouldHideNav("/register")).toBe(true);
    expect(shouldHideNav("/forgot-password")).toBe(true);
    expect(shouldHideNav("/reset-password")).toBe(true);
    expect(shouldHideNav("/devis/nouveau")).toBe(true);
    expect(shouldHideNav("/clients/nouveau")).toBe(true);
  });

  it("est caché sur /devis/[id] mais pas sur /devis", () => {
    expect(shouldHideNav("/devis/abc-123")).toBe(true);
    expect(shouldHideNav("/devis/DEV-2026-0001")).toBe(true);
    expect(shouldHideNav("/devis")).toBe(false);
  });
});

describe("BottomNav", () => {
  it("rend les cinq emplacements de navigation avec labels accessibles", () => {
    mocks.pathname = "/";

    const html = renderToStaticMarkup(createElement(BottomNav));

    expect(html).toContain('aria-label="Navigation principale"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/devis"');
    expect(html).toContain('href="/devis/nouveau"');
    expect(html).toContain('href="/clients"');
    expect(html).toContain('href="/parametres"');
    expect(html).toContain('aria-label="Nouveau devis"');
  });

  it("expose aria-current sur l'item actif", () => {
    mocks.pathname = "/clients";

    const html = renderToStaticMarkup(createElement(BottomNav));

    expect(html).toContain('href="/clients" aria-label="Clients" aria-current="page"');
  });

  it("ne rend rien sur les routes masquées", () => {
    mocks.pathname = "/devis/nouveau";

    expect(renderToStaticMarkup(createElement(BottomNav))).toBe("");
  });
});