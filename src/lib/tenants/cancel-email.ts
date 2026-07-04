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

export interface CancelEmailParams {
  tenantName: string;
  effectiveDate: Date;
  ownerWhatsapp: string;
  ownerEmail: string;
}

export function buildCancelEmailHtml(params: CancelEmailParams): string {
  const name = escapeHtml(params.tenantName);
  const dateStr = escapeHtml(
    params.effectiveDate.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  );
  const whatsapp = escapeHtml(params.ownerWhatsapp);
  const email = escapeHtml(params.ownerEmail);
  const emailAttr = escapeAttribute(params.ownerEmail);

  const whatsappRaw = params.ownerWhatsapp.replace(/\D/g, "");
  const whatsappHref = whatsappRaw
    ? `<a href="https://wa.me/${escapeAttribute(whatsappRaw)}" style="color:#1a2744">${whatsapp}</a>`
    : `<span>${whatsapp}</span>`;

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <h2 style="color:#b91c1c">Votre abonnement Quotation Logistique a été annulé définitivement</h2>
      <p>Bonjour,</p>
      <p>L'abonnement de <strong>${name}</strong> a été annulé définitivement.</p>
      <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Date d'effet</td>
          <td style="padding:6px 0">${dateStr}</td>
        </tr>
      </table>
      <p style="color:#b91c1c;font-size:14px"><strong>Cette action est IRRÉVERSIBLE.</strong> Votre accès a été bloqué totalement.</p>
      <p style="color:#6b7280;font-size:14px">Vos données sont conservées. Aucune information n'a été supprimée.</p>
      <p style="font-size:14px">La réactivation nécessite un contact manuel avec Maiga Tech Lab :</p>
      <ul style="font-size:14px">
        <li>WhatsApp : ${whatsappHref}</li>
        <li>Email : <a href="mailto:${emailAttr}" style="color:#1a2744">${email}</a></li>
      </ul>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px">Quotation Logistique — Ne pas répondre à cet email.</p>
    </div>
  `;
}

export function buildCancelEmailText(params: CancelEmailParams): string {
  const dateStr = params.effectiveDate.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return [
    "Votre abonnement Quotation Logistique a été annulé définitivement",
    "",
    `L'abonnement de ${params.tenantName} a été annulé définitivement.`,
    "",
    `Date d'effet : ${dateStr}`,
    "",
    "Cette action est IRRÉVERSIBLE. Votre accès a été bloqué totalement.",
    "Vos données sont conservées. Aucune information n'a été supprimée.",
    "",
    "La réactivation nécessite un contact manuel avec Maiga Tech Lab :",
    `WhatsApp : ${params.ownerWhatsapp}`,
    `Email : ${params.ownerEmail}`,
    "",
    "Quotation Logistique — Ne pas répondre à cet email.",
  ].join("\n");
}
