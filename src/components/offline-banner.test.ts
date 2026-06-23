import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "@/components/offline-banner";

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (_key: string, values?: Record<string, number>) => (
    `Hors ligne · ${values?.count ?? 0} devis en attente`
  )),
}));

function setOnlineStatus(isOnline: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: isOnline,
    configurable: true,
  });
}

function renderBanner() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("n'affiche rien quand l'appareil est en ligne et sans attente", async () => {
    setOnlineStatus(true);
    const { container, root } = renderBanner();

    await act(async () => {
      root.render(createElement(OfflineBanner));
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("affiche la bannière hors ligne puis la masque au retour online", async () => {
    setOnlineStatus(false);
    const { container, root } = renderBanner();

    await act(async () => {
      root.render(createElement(OfflineBanner));
    });

    expect(container.textContent).toContain("Hors ligne · 0 devis en attente");
    expect(container.querySelector('[role="status"]')?.className).toContain("sticky");

    setOnlineStatus(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("affiche les opérations en attente même en ligne", async () => {
    setOnlineStatus(true);
    const { container, root } = renderBanner();

    await act(async () => {
      root.render(createElement(OfflineBanner, { pendingCount: 3 }));
    });

    expect(container.textContent).toContain("Hors ligne · 3 devis en attente");
  });
});