import { z } from "zod";

export const quoteStatuses = [
  "draft",
  "validated",
  "sent",
  "accepted",
  "expired",
  "cancelled",
] as const;

export type QuoteStatus = (typeof quoteStatuses)[number];

export const quoteSchema = z.object({
  reference: z.string().optional(),
  objet: z.string().min(1, "L'objet du devis est requis"),
  clientId: z.string().min(1, "Le client est requis"),
  dateDevis: z.string().min(1, "La date est requise"),
  dateValidite: z.string().min(1, "La date de validité est requise"),
  status: z.enum(quoteStatuses).default("draft"),
  signataireNom: z.string().optional(),
  signataireFonction: z.string().optional(),
  conditionsPaiement: z.string().optional(),
  pays: z.string().default("NE"),
});

export type QuoteInput = z.infer<typeof quoteSchema>;
