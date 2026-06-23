import { describe, expect, it } from "vitest";
import { errorResponse, successResponse } from "./envelope";

describe("api envelope", () => {
  it("successResponse retourne la ressource directement", () => {
    const data = { id: "quote-1", totalFcfa: 10_000 };

    expect(successResponse(data)).toBe(data);
  });

  it("errorResponse retourne l'enveloppe d'erreur standard", () => {
    expect(errorResponse("VALIDATION_FAILED", "Invalid", { field: "Required" })).toEqual({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid",
        fields: { field: "Required" },
      },
    });
  });
});
