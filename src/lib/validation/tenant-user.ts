import { z } from "zod";

const MANUAL_PASSWORD_MIN = 12;

export const createTenantUserSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est requis").max(120),
    email: z.string().trim().email("Format email invalide"),
    passwordMode: z.enum(["auto", "manual"]),
    manualPassword: z.string().optional(),
    // "superadmin" is intentionally excluded — it's an owner-only role, never
    // assignable to a tenant user (would be a privilege escalation).
    role: z.enum(["admin", "commercial", "operateur"]),
    sendWelcomeEmail: z.boolean().default(true),
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

export type CreateTenantUserInput = z.infer<typeof createTenantUserSchema>;

export const tenantIdParamSchema = z.object({
  id: z.string().uuid("Identifiant de tenant invalide"),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid("Identifiant de tenant invalide"),
  userId: z.string().min(1, "Identifiant d'utilisateur invalide"),
});
