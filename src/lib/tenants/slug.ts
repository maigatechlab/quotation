/**
 * Tenant slug helpers — pure, testable.
 * A slug becomes the tenant subdomain ({slug}.quotation.com), so it must be a
 * valid DNS label: lowercase alphanumerics and hyphens, 3–63 chars.
 */

const SLUG_MIN = 3;
const SLUG_MAX = 63;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derives a DNS-safe slug from a free-form company name.
 * "Trans Sahel Logistics" → "trans-sahel-logistics"
 * "Établissement Café" → "etablissement-cafe"
 * Falls back to "tenant" when the input yields an empty result.
 */
export function generateSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanum → hyphen
    .replace(/-{2,}/g, "-") // collapse repeated hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens

  return slug.length > 0 ? slug : "tenant";
}

export interface SlugValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validates a slug against DNS-label rules. Pure — no DB uniqueness check here
 * (uniqueness is enforced server-side in createTenantWithAdmin).
 */
export function validateSlug(slug: string): SlugValidation {
  if (slug.length < SLUG_MIN) {
    return { valid: false, reason: "too_short" };
  }
  if (slug.length > SLUG_MAX) {
    return { valid: false, reason: "too_long" };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return { valid: false, reason: "invalid_chars" };
  }
  return { valid: true };
}
