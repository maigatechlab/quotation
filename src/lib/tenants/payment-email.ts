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

export interface PaymentConfirmationEmailParams {
  tenantName: string;
  subdomainUrl: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentReference: string | null;
  paidAt: Date;
  periodStart: Date;
  periodEnd: Date;
  billingCycle: string;
  reactivated: boolean;
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

const CYCLE_LABELS: Record<string, string> = {
  monthly: "Mensuel",
  annual: "Annuel",
};

export function buildPaymentConfirmationEmailHtml(params: PaymentConfirmationEmailParams): string {
  const name = escapeHtml(params.tenantName);
  const url = escapeAttribute(params.subdomainUrl);
  const urlText = escapeHtml(params.subdomainUrl);
  const method = escapeHtml(PAYMENT_METHOD_LABELS[params.paymentMethod] ?? params.paymentMethod);
  const reference = params.paymentReference ? escapeHtml(params.paymentReference) : null;
  const amount = escapeHtml(`${AMOUNT_FORMATTER.format(params.amount)} ${params.currency}`);
  const paidAtStr = escapeHtml(DATE_FORMATTER.format(params.paidAt));
  const startStr = escapeHtml(DATE_FORMATTER.format(params.periodStart));
  const endStr = escapeHtml(DATE_FORMATTER.format(params.periodEnd));
  const cycle = escapeHtml(CYCLE_LABELS[params.billingCycle] ?? params.billingCycle);

  const reactivationBlock = params.reactivated
    ? `<p style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;color:#166534;font-size:14px;margin:16px 0">
        ✅ <strong>Votre compte a été réactivé.</strong> Vous pouvez vous reconnecter dès maintenant.
      </p>`
    : "";

  const referenceRow = reference
    ? `<tr>
        <td style="padding:6px 12px 6px 0;color:#6b7280">Référence</td>
        <td style="padding:6px 0"><strong>${reference}</strong></td>
      </tr>`
    : "";

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <h2 style="color:#1a2744">${params.reactivated ? "Compte réactivé — Paiement reçu" : "Paiement reçu"}</h2>
      <p>Bonjour,</p>
      <p>Nous avons bien reçu un paiement pour l'espace <strong>${name}</strong>.</p>
      ${reactivationBlock}
      <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Montant</td>
          <td style="padding:6px 0"><strong>${amount}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Méthode</td>
          <td style="padding:6px 0">${method}</td>
        </tr>
        ${referenceRow}
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Date</td>
          <td style="padding:6px 0">${paidAtStr}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Cycle</td>
          <td style="padding:6px 0">${cycle}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Période couverte</td>
          <td style="padding:6px 0">${startStr} → ${endStr}</td>
        </tr>
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

export function buildPaymentConfirmationEmailText(params: PaymentConfirmationEmailParams): string {
  const method = PAYMENT_METHOD_LABELS[params.paymentMethod] ?? params.paymentMethod;
  const cycle = CYCLE_LABELS[params.billingCycle] ?? params.billingCycle;

  const lines = [
    params.reactivated ? "Compte réactivé — Paiement reçu" : "Paiement reçu",
    "",
    `Espace : ${params.tenantName}`,
    "",
    `Montant : ${params.amount} ${params.currency}`,
    `Méthode : ${method}`,
    ...(params.paymentReference ? [`Référence : ${params.paymentReference}`] : []),
    `Date : ${DATE_FORMATTER.format(params.paidAt)}`,
    `Cycle : ${cycle}`,
    `Période couverte : ${DATE_FORMATTER.format(params.periodStart)} → ${DATE_FORMATTER.format(params.periodEnd)}`,
    "",
    ...(params.reactivated
      ? ["Votre compte a été réactivé. Vous pouvez vous reconnecter dès maintenant.", ""]
      : []),
    `Connexion : ${params.subdomainUrl}`,
    "",
    "Quotation Logistique — Ne pas répondre à cet email.",
  ];

  return lines.join("\n");
}
