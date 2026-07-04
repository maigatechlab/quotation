import { z } from "zod";

// No "free" in the enum — free has no checkout (0 XOF, never charged via Stripe).
export const createCheckoutSessionSchema = z.object({
  plan: z.enum(["pro", "enterprise"], { error: "Le plan est requis" }),
  billingCycle: z.enum(["monthly", "annual"], { error: "Le cycle de facturation est requis" }),
  adminEmail: z.string().trim().toLowerCase().email("Email invalide"),
  companyName: z.string().trim().min(2, "Nom de société trop court").max(120),
  adminName: z.string().trim().min(2, "Nom trop court").max(120),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;

// Validates the metadata round-tripped through a Stripe Checkout Session —
// defense in depth in case a session was somehow created outside our own API.
export const checkoutMetadataSchema = z.object({
  plan: z.enum(["pro", "enterprise"]),
  billingCycle: z.enum(["monthly", "annual"]),
  amountXof: z.coerce.number().int().positive(),
  amountEur: z.coerce.number().int().positive(),
  companyName: z.string().trim().min(2).max(120),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().toLowerCase().email(),
});

export type CheckoutMetadataInput = z.infer<typeof checkoutMetadataSchema>;
