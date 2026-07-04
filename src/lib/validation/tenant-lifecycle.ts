import { z } from "zod";

export const suspendSchema = z.object({
  reason: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["non-paiement", "fraude", "demande-client", "autre"], {
      error: "Le motif de suspension est requis",
    })
  ),
  note: z
    .string()
    .trim()
    .max(2000, "La note ne doit pas dépasser 2000 caractères")
    .optional(),
  totalBlock: z.boolean().default(false),
});

export type SuspendInput = z.infer<typeof suspendSchema>;

export const cancelSchema = z.object({
  confirmSlug: z.string().trim().min(1, "La confirmation du slug est requise"),
});

export type CancelInput = z.infer<typeof cancelSchema>;
