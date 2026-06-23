import { z } from "zod";

export const clientSchema = z.object({
  companyName: z.string().min(1, "Le nom de la société est requis"),
  contactName: z.string().optional(),
  phone: z.string().min(1, "Le téléphone est requis"),
  email: z.string().email("Format email invalide").optional().or(z.literal("")),
  country: z.string().default("NE"),
  city: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export type ClientInput = z.infer<typeof clientSchema>;
