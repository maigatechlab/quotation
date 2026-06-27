import { z } from "zod";

export const routeTemplateSchema = z.object({
  nom: z.string().min(1, "Le nom est requis").max(100, "Nom trop long"),
  originCountry: z.string().min(1, "Le pays de départ est requis"),
  originCity: z.string().min(1, "La ville de départ est requise"),
  destinationCountry: z.string().min(1, "Le pays d'arrivée est requis"),
  destinationCity: z.string().min(1, "La ville d'arrivée est requise"),
  distanceKm: z.number().positive().optional(),
  tarifFcfa: z.number().int().nonnegative().optional(),
});

export type RouteTemplateInput = z.infer<typeof routeTemplateSchema>;
