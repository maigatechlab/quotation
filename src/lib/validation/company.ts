import { z } from "zod";

export const companySchema = z.object({
  raisonSociale: z.string().min(1, "La raison sociale est requise"),
  formeJuridique: z.string().optional(),
  capital: z.number().nonnegative().optional(),
  rccm: z
    .string()
    .min(1, "Le RCCM est requis")
    .regex(
      /^[A-Z]{2}-[A-Z]{2,4}-\d{4}-[A-Z]-\d+$/,
      "Format RCCM invalide (ex: NE-NIA-2023-B-1234)"
    ),
  nif: z
    .string()
    .min(1, "Le NIF est requis")
    .regex(/^\d{8,12}$/, "Le NIF doit contenir 8 à 12 chiffres"),
  adresse: z.string().optional(),
  bp: z.string().optional(),
  phones: z.array(z.string().min(1)).min(1, "Au moins un téléphone est requis"),
  emails: z.array(z.string().email("Format email invalide")).optional(),
  signataireNom: z.string().optional(),
  signataireFonction: z.string().optional(),
  conditionsPaiementDefaut: z.string().optional(),
});

export type CompanyInput = z.infer<typeof companySchema>;
