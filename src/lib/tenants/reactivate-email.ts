// escapeHtml/escapeAttribute duplicated from src/lib/email.ts (not exported there — hors scope)
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

export interface ReactivationEmailParams {
  tenantName: string;
  subdomainUrl: string;
  periodStart: Date;
  periodEnd: Date;
  paymentMethod: string;
  paymentReference: string | null;
  paymentAmount: number;
  currency: string;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const AMOUNT_FORMATTER = new Intl.NumberFormat("fr-FR");

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  nitta: "Nitta",
  wave: "Wave",
  amana: "Amana",
  cash: "Cash",
  virement: "Virement",
};

export function buildReactivationEmailHtml(params: ReactivationEmailParams): string {
  const name = escapeHtml(params.tenantName);
  const url = escapeAttribute(params.subdomainUrl);
  const urlText = escapeHtml(params.subdomainUrl);
  const method = escapeHtml(PAYMENT_METHOD_LABELS[params.paymentMethod] ?? params.paymentMethod);
  const reference = params.paymentReference ? escapeHtml(params.paymentReference) : null;
  const amount = escapeHtml(`${AMOUNT_FORMATTER.format(params.paymentAmount)} ${params.currency}`);
  const startStr = escapeHtml(DATE_FORMATTER.format(params.periodStart));
  const endStr = escapeHtml(DATE_FORMATTER.format(params.periodEnd));

  const referenceRow = reference
    ? `<tr>
        <td style="padding:6px 12px 6px 0;color:#6b7280">Référence</td>
        <td style="padding:6px 0"><strong>${reference}</strong></td>
      </tr>`
    : "";

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <h2 style="color:#1a2744">Votre compte a été réactivé</h2>
      <p>Bonjour,</p>
      <p>L'espace <strong>${name}</strong> a été réactivé. Vous pouvez vous reconnecter dès maintenant.</p>
      <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Période d'abonnement</td>
          <td style="padding:6px 0"><strong>${startStr} → ${endStr}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Montant</td>
          <td style="padding:6px 0">${amount}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Méthode</td>
          <td style="padding:6px 0">${method}</td>
        </tr>
        ${referenceRow}
      </table>
      <p style="margin:24px 0">
        <a href="${url}"
           style="background:#1a2744;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Accéder à mon espace
        </a>
      </p>
      <p style="color:#6b7280;font-size:14px">Lien de connexion : <a href="${url}" style="color:#1a2744">${urlText}</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px">Quotation Logistique — Ne pas répondre à cet email.</p>
    </div>
  `;
}

export function buildReactivationEmailText(params: ReactivationEmailParams): string {
  const method = PAYMENT_METHOD_LABELS[params.paymentMethod] ?? params.paymentMethod;

  const lines = [
    "Votre compte a été réactivé",
    "",
    `Espace : ${params.tenantName}`,
    "",
    `Vous pouvez vous reconnecter dès maintenant.`,
    "",
    `Période d'abonnement : ${DATE_FORMATTER.format(params.periodStart)} → ${DATE_FORMATTER.format(params.periodEnd)}`,
    `Montant : ${AMOUNT_FORMATTER.format(params.paymentAmount)} ${params.currency}`,
    `Méthode : ${method}`,
    ...(params.paymentReference ? [`Référence : ${params.paymentReference}`] : []),
    "",
    `Connexion : ${params.subdomainUrl}`,
    "",
    "Quotation Logistique — Ne pas répondre à cet email.",
  ];

  return lines.join("\n");
}
