import { z } from "zod";

export const clauseCategories = ["Paiement", "Responsabilité", "Exclusions", "Autre"] as const;

export type ClauseCategory = (typeof clauseCategories)[number];

export const clauseSchema = z.object({
  titre: z.string().min(1, "Le titre est requis"),
  contenu: z.string().min(1, "Le contenu est requis").max(2000, "Le contenu ne doit pas dépasser 2000 caractères"),
  categorie: z.enum(clauseCategories).default("Autre"),
});

export type ClauseInput = z.infer<typeof clauseSchema>;
