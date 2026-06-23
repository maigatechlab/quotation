export interface CountryConfig {
  code: string;
  countryName: string;
  name: string;
  locale: string;
  currency: string;
  dateFormat: string;
  majorCities: string[];
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  NE: {
    code: "NE",
    countryName: "Niger",
    name: "Niger",
    locale: "fr-NE",
    currency: "XOF",
    dateFormat: "dd/MM/yyyy",
    majorCities: ["Niamey", "Zinder", "Maradi", "Agadez", "Tahoua", "Dosso", "Diffa"],
  },
  ML: {
    code: "ML",
    countryName: "Mali",
    name: "Mali",
    locale: "fr-ML",
    currency: "XOF",
    dateFormat: "dd/MM/yyyy",
    majorCities: ["Bamako", "Sikasso", "Mopti", "Gao"],
  },
  BF: {
    code: "BF",
    countryName: "Burkina Faso",
    name: "Burkina Faso",
    locale: "fr-BF",
    currency: "XOF",
    dateFormat: "dd/MM/yyyy",
    majorCities: ["Ouagadougou", "Bobo-Dioulasso", "Koudougou"],
  },
};

export function getCountryConfig(code: string): CountryConfig {
  const config = COUNTRY_CONFIGS[code];
  if (!config) {
    throw new Error(`Unknown country code: ${code}`);
  }
  return config;
}

export function getActiveConfig(): CountryConfig {
  return getCountryConfig("NE");
}
