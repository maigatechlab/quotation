import { z } from "zod";

const MANUAL_PASSWORD_MIN = 12;

export const createTenantSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(1, "Le nom de la société est requis")
      .max(120),
    slug: z
      .string()
      .trim()
      .min(3, "Le sous-domaine doit faire au moins 3 caractères")
      .max(63, "Le sous-domaine ne peut pas dépasser 63 caractères")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Le slug ne doit contenir que des minuscules, des chiffres et des tirets"
      ),
    plan: z.enum(["free", "pro", "enterprise"]),
    cycle: z.enum(["monthly", "annual"]),
    adminName: z
      .string()
      .trim()
      .min(1, "Le nom de l'administrateur est requis")
      .max(120),
    adminEmail: z.string().trim().email("Format email invalide"),
    passwordMode: z.enum(["auto", "manual"]),
    manualPassword: z.string().optional(),
    sendWelcomeEmail: z.boolean().default(true),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.passwordMode === "manual") {
      if (!data.manualPassword || data.manualPassword.length < MANUAL_PASSWORD_MIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["manualPassword"],
          message: "Le mot de passe doit faire au moins 12 caractères",
        });
      }
    }
  });

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
