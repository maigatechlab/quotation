import { z } from "zod";

export const companySchema = z.object({
  raisonSociale: z.string().min(1, "La raison sociale est requise"),
  formeJuridique: z.string().optional(),
  capital: z.number().nonnegative().optional(),
  rccm: z.string().min(1, "Le RCCM est requis"),
  nif: z.string().min(1, "Le NIF est requis"),
  adresse: z.string().optional(),
  bp: z.string().optional(),
  phones: z.array(z.string().min(1)).min(1, "Au moins un téléphone est requis"),
  emails: z.array(z.string().email()).optional(),
  signataireNom: z.string().optional(),
  signataireFonction: z.string().optional(),
});

export type CompanyInput = z.infer<typeof companySchema>;
