import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  // Single locale v1 — fr-NE (Niger)
  return {
    locale: "fr-NE",
    messages: (await import("../messages/fr-NE.json")).default,
  };
});
