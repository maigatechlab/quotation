import { z } from "zod";

export const updateTenantSchema = z
  .object({
    plan: z.enum(["free", "pro", "enterprise"]).optional(),
    notes: z
      .string()
      .trim()
      .max(5000, "Les notes ne doivent pas dépasser 5000 caractères")
      .optional(),
    status: z.enum(["active", "trial", "suspended", "cancelled"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.plan === undefined && data.notes === undefined && data.status === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Aucun champ à mettre à jour",
        path: [],
      });
    }
  });

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
