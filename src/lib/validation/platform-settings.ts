import { z } from "zod";

export const notificationsSchema = z.object({
  senderAddress: z.string().trim().toLowerCase().email("Adresse email expÃ©diteur invalide."),
  trialWelcome: z.coerce.boolean(),
  reminderJ7: z.coerce.boolean(),
  reminderJ3: z.coerce.boolean(),
  reminderJ1: z.coerce.boolean(),
  expiryNotification: z.coerce.boolean(),
  suspensionNotification: z.coerce.boolean(),
  reactivationNotification: z.coerce.boolean(),
});

const POSTGRES_INT_MAX = 2_147_483_647;
const PRICE_MESSAGE = "Le prix doit Ãªtre un entier positif (FCFA).";
const MAX_USERS_MESSAGE = "Le nombre d'utilisateurs doit Ãªtre â‰¥ 1.";

const priceField = z.coerce
  .number()
  .refine(Number.isInteger, PRICE_MESSAGE)
  .nonnegative(PRICE_MESSAGE)
  .max(POSTGRES_INT_MAX, PRICE_MESSAGE);
const maxUsersField = z.coerce
  .number()
  .refine(Number.isInteger, MAX_USERS_MESSAGE)
  .min(1, MAX_USERS_MESSAGE)
  .max(POSTGRES_INT_MAX, MAX_USERS_MESSAGE);

export const platformSettingsSchema = z.object({
  priceFreeMonthly: priceField,
  priceFreeAnnual: priceField,
  priceProMonthly: priceField,
  priceProAnnual: priceField,
  priceEnterpriseMonthly: priceField,
  priceEnterpriseAnnual: priceField,
  maxUsersFree: maxUsersField,
  maxUsersPro: maxUsersField,
  maxUsersEnterprise: maxUsersField,
  trialDays: z.coerce
    .number()
    .int()
    .min(1, "La durÃ©e d'essai doit Ãªtre entre 1 et 60 jours.")
    .max(60, "La durÃ©e d'essai doit Ãªtre entre 1 et 60 jours."),
  gracePeriodDays: z.coerce
    .number()
    .int()
    .min(0, "La durÃ©e de grÃ¢ce doit Ãªtre entre 0 et 30 jours.")
    .max(30, "La durÃ©e de grÃ¢ce doit Ãªtre entre 0 et 30 jours."),
  suspendedContactEmail: z.string().trim().toLowerCase().email("Adresse email invalide."),
  suspendedContactWhatsapp: z.string().trim(),
  expiryMessage: z.string().trim(),
  notifications: notificationsSchema,
});

export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;
