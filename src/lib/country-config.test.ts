import { describe, expect, it } from "vitest";
import { COUNTRY_CONFIGS, getActiveConfig, getCountryConfig } from "./country-config";

describe("country config", () => {
  it("exporte les configs NE, ML et BF avec countryName", () => {
    expect(Object.keys(COUNTRY_CONFIGS).sort()).toEqual(["BF", "ML", "NE"]);
    expect(COUNTRY_CONFIGS.NE?.countryName).toBe("Niger");
  });

  it("retourne la config active NE", () => {
    expect(getActiveConfig()).toEqual(COUNTRY_CONFIGS.NE);
  });

  it("lance une erreur pour un pays inconnu", () => {
    expect(() => getCountryConfig("CI")).toThrow("Unknown country code: CI");
  });
});
