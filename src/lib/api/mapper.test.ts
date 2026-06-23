import { describe, expect, expectTypeOf, it } from "vitest";
import { toApiCase, toDbCase } from "./mapper";

describe("api mapper", () => {
  it("convertit snake_case vers camelCase recursivement", () => {
    const result = toApiCase({ quote_id: "q1", nested_value: { total_fcfa: 1000 } });

    expect(result).toEqual({ quoteId: "q1", nestedValue: { totalFcfa: 1000 } });
    expectTypeOf(result).toEqualTypeOf<{
      quoteId: string;
      nestedValue: { totalFcfa: number };
    }>();
  });

  it("convertit camelCase vers snake_case recursivement", () => {
    const result = toDbCase({ quoteId: "q1", nestedValue: { totalFcfa: 1000 } });

    expect(result).toEqual({ quote_id: "q1", nested_value: { total_fcfa: 1000 } });
    expectTypeOf(result).toEqualTypeOf<{
      quote_id: string;
      nested_value: { total_fcfa: number };
    }>();
  });
});
