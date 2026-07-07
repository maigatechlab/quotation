import "fake-indexeddb/auto";

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import type { QuoteLocal } from "@/lib/local-db";
import frNE from "@/messages/fr-NE.json";
import { StatusChangeSheet } from "./status-change-sheet";

const now = "2026-07-06T00:00:00.000Z";

const baseQuote: QuoteLocal = {
  id: "quote-1",
  number: "DEV-2026-001",
  clientId: "client-1",
  companyId: "company-1",
  objet: "Transport ciment",
  dateDevis: now,
  totalFcfa: 500_000,
  status: "validated",
  pays: "NE",
  ownerId: "user-1",
  revision: 3,
  updatedAt: now,
  createdAt: now,
};

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  triggerSync: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

vi.mock("@/lib/sync/outbox", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sync/outbox")>("@/lib/sync/outbox");
  return {
    ...actual,
    triggerSync: (...args: unknown[]) => mocks.triggerSync(...args),
  };
});

function withIntl(node: ReactNode) {
  return (
    <NextIntlClientProvider messages={frNE} locale="fr-NE">
      {node}
    </NextIntlClientProvider>
  );
}

describe("StatusChangeSheet — snapshot changedByName (Story 8.8)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.quotes.put(baseQuote);
    mocks.toastSuccess.mockReset();
    mocks.triggerSync.mockReset();
  });

  afterEach(() => {
    cleanup();
    db.close();
  });

  it("writes changedByName alongside changedBy when the status is changed", async () => {
    render(
      withIntl(
        <StatusChangeSheet
          quoteId="quote-1"
          currentStatus="validated"
          userId="user-1"
          userName="Amadou Maiga"
          isOpen={true}
          onClose={() => {}}
        />
      )
    );

    const sentButton = screen.getByText("Envoyé");
    fireEvent.click(sentButton);

    await waitFor(async () => {
      const logs = await db.quoteStatusLogs.where("quoteId").equals("quote-1").toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.changedBy).toBe("user-1");
      expect(logs[0]?.changedByName).toBe("Amadou Maiga");
      expect(logs[0]?.toStatus).toBe("sent");
    });
  });
});
