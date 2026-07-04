import { z } from "zod";

export const reactivateSchema = z.object({
  coveringPaymentId: z.string().uuid("L'identifiant du paiement est invalide"),
  note: z.string().trim().max(2000, "La note ne doit pas dépasser 2000 caractères").optional(),
});

export type ReactivateInput = z.infer<typeof reactivateSchema>;
