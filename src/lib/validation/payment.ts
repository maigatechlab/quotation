import { z } from "zod";
import { MAX_MONETARY_VALUE } from "@/lib/money";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const recordPaymentSchema = z
  .object({
    paymentMethod: z.enum(["nitta", "wave", "amana", "stripe", "cash", "virement"], {
      error: "La méthode de paiement est requise",
    }),
    paymentReference: z.string().trim().max(200).optional(),
    amount: z
      .number()
      .int("Le montant doit être un entier")
      .positive("Le montant doit être un entier positif en FCFA")
      .max(MAX_MONETARY_VALUE, "Montant hors borne"),
    paidAt: z.string().datetime(),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    billingCycle: z.enum(["monthly", "annual"]),
    reactivateIfSuspended: z.boolean().default(false),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);
    if (periodEnd <= periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodEnd"],
        message: "La date de fin de période doit être après la date de début",
      });
    }

    const paidAt = new Date(data.paidAt);
    const maxAllowed = new Date(Date.now() + ONE_DAY_MS);
    if (paidAt > maxAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paidAt"],
        message: "La date de paiement ne peut pas être dans le futur",
      });
    }
  });

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
