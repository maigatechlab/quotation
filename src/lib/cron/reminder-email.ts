import { escapeAttribute, escapeHtml } from "@/lib/email";
import type { ReminderStage } from "./expiry-decisions";

const STAGE_COLOR: Record<ReminderStage, string> = {
  first: "#2563eb", // blue
  second: "#d97706", // orange
  urgent: "#b91c1c", // red
};

const STAGE_SUBJECT: Record<ReminderStage, string> = {
  first: "Votre abonnement Quotation Logistique expire dans 7 jours",
  second: "Rappel : votre abonnement expire dans 3 jours",
  urgent: "Urgent : votre abonnement Quotation expire demain",
};

export function reminderSubject(stage: ReminderStage): string {
  return STAGE_SUBJECT[stage];
}

export interface ReminderEmailParams {
  tenantName: string;
  subdomainUrl: string;
  expiryDateFormatted: string;
  daysRemaining: number;
  ownerWhatsapp: string;
  ownerEmail: string;
}

export function buildReminderEmailHtml(stage: ReminderStage, params: ReminderEmailParams): string {
  const name = escapeHtml(params.tenantName);
  const subdomainUrl = escapeAttribute(params.subdomainUrl);
  const subdomainDisplay = escapeHtml(params.subdomainUrl);
  const expiryDate = escapeHtml(params.expiryDateFormatted);
  const whatsapp = escapeHtml(params.ownerWhatsapp);
  const email = escapeHtml(params.ownerEmail);
  const emailAttr = escapeAttribute(params.ownerEmail);
  const color = STAGE_COLOR[stage];

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <h2 style="color:${color}">${escapeHtml(reminderSubject(stage))}</h2>
      <p>Bonjour,</p>
      <p>Votre abonnement pour <strong>${name}</strong> expire le <strong>${expiryDate}</strong> (dans ${params.daysRemaining} jour${params.daysRemaining > 1 ? "s" : ""}).</p>
      <p>Régularisez votre paiement pour éviter l'interruption de service.</p>
      <p style="margin:24px 0">
        <a href="${subdomainUrl}"
           style="background:${color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Accéder à mon espace
        </a>
      </p>
      <p style="color:#6b7280;font-size:14px">Espace : ${subdomainDisplay}</p>
      <p style="font-size:14px">Contact : ${whatsapp} / <a href="mailto:${emailAttr}" style="color:#1a2744">${email}</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px">Quotation Logistique — Ne pas répondre à cet email.</p>
    </div>
  `;
}

export function buildReminderEmailText(stage: ReminderStage, params: ReminderEmailParams): string {
  return [
    reminderSubject(stage),
    "",
    "Bonjour,",
    "",
    `Votre abonnement pour ${params.tenantName} expire le ${params.expiryDateFormatted} (dans ${params.daysRemaining} jour${params.daysRemaining > 1 ? "s" : ""}).`,
    "Régularisez votre paiement pour éviter l'interruption de service.",
    "",
    `Espace : ${params.subdomainUrl}`,
    `Contact : ${params.ownerWhatsapp} / ${params.ownerEmail}`,
    "",
    "Quotation Logistique — Ne pas répondre à cet email.",
  ].join("\n");
}

export interface ExpiryEmailParams {
  tenantName: string;
  subdomainUrl: string;
  graceEndsAtFormatted: string;
  graceDays: number;
  ownerWhatsapp: string;
  ownerEmail: string;
}

export function expirySubject(graceDays: number): string {
  return `Votre abonnement a été suspendu — régularisez sous ${graceDays} jours`;
}

export function buildExpiryEmailHtml(params: ExpiryEmailParams): string {
  const name = escapeHtml(params.tenantName);
  const graceEndsAt = escapeHtml(params.graceEndsAtFormatted);
  const whatsapp = escapeHtml(params.ownerWhatsapp);
  const email = escapeHtml(params.ownerEmail);
  const emailAttr = escapeAttribute(params.ownerEmail);

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <h2 style="color:#b91c1c">Votre abonnement a été suspendu</h2>
      <p>Bonjour,</p>
      <p>Votre abonnement pour <strong>${name}</strong> a été suspendu pour non-paiement. Votre accès est désormais limité en <strong>lecture seule</strong>.</p>
      <p>Vous disposez d'une période de grâce de <strong>${params.graceDays} jours</strong> (jusqu'au ${graceEndsAt}) pour régulariser et rétablir un accès complet. Au-delà, l'accès restera bloqué en lecture seule.</p>
      <p style="font-size:14px">Contactez ${whatsapp} / <a href="mailto:${emailAttr}" style="color:#1a2744">${email}</a> pour régulariser.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px">Quotation Logistique — Ne pas répondre à cet email.</p>
    </div>
  `;
}

export function buildExpiryEmailText(params: ExpiryEmailParams): string {
  return [
    "Votre abonnement a été suspendu",
    "",
    "Bonjour,",
    "",
    `Votre abonnement pour ${params.tenantName} a été suspendu pour non-paiement. Votre accès est désormais limité en lecture seule.`,
    `Vous disposez d'une période de grâce de ${params.graceDays} jours (jusqu'au ${params.graceEndsAtFormatted}) pour régulariser et rétablir un accès complet. Au-delà, l'accès restera bloqué en lecture seule.`,
    "",
    `Contactez ${params.ownerWhatsapp} / ${params.ownerEmail} pour régulariser.`,
    "",
    "Quotation Logistique — Ne pas répondre à cet email.",
  ].join("\n");
}
