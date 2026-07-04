/**
 * Welcome email templates for a newly provisioned tenant admin.
 * Mirrors the inline-styled HTML approach of buildResetPasswordHtml in
 * src/lib/email.ts.
 *
 * SECURITY: every dynamic value (especially the generated password, which can
 * contain <, >, ", ', `) MUST be escaped before insertion into HTML. The escape
 * helpers in src/lib/email.ts are not exported, so equivalents are defined here.
 */

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

export interface WelcomeEmailParams {
  tenantName: string;
  subdomainUrl: string;
  adminEmail: string;
  password: string;
  /** ISO date string (already formatted by the caller for display) or null. */
  trialEndsAt: string | null;
}

export function buildWelcomeEmailHtml(params: WelcomeEmailParams): string {
  const name = escapeHtml(params.tenantName);
  const url = escapeAttribute(params.subdomainUrl);
  const urlText = escapeHtml(params.subdomainUrl);
  const email = escapeHtml(params.adminEmail);
  const password = escapeHtml(params.password);
  const trialLine = params.trialEndsAt
    ? `<p style="color:#6b7280;font-size:14px">Votre période d'essai se termine le <strong>${escapeHtml(
        params.trialEndsAt
      )}</strong>.</p>`
    : "";

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <h2 style="color:#1a2744">Bienvenue sur Quotation Logistique</h2>
      <p>Bonjour,</p>
      <p>L'espace de <strong>${name}</strong> a été créé. Voici vos identifiants de connexion :</p>
      <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Adresse</td>
          <td style="padding:6px 0"><a href="${url}" style="color:#1a2744;font-weight:600">${urlText}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Email</td>
          <td style="padding:6px 0"><strong>${email}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7280">Mot de passe</td>
          <td style="padding:6px 0"><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${password}</code></td>
        </tr>
      </table>
      <p style="margin:24px 0">
        <a href="${url}"
           style="background:#1a2744;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Accéder à mon espace
        </a>
      </p>
      <p style="color:#b91c1c;font-size:14px"><strong>Changez votre mot de passe à la première connexion.</strong></p>
      ${trialLine}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px">Quotation Logistique — Ne pas répondre à cet email.</p>
    </div>
  `;
}

export function buildWelcomeEmailText(params: WelcomeEmailParams): string {
  const trialLine = params.trialEndsAt
    ? `\nVotre période d'essai se termine le ${params.trialEndsAt}.`
    : "";

  return [
    "Bienvenue sur Quotation Logistique",
    "",
    `L'espace de ${params.tenantName} a été créé. Voici vos identifiants :`,
    "",
    `Adresse : ${params.subdomainUrl}`,
    `Email : ${params.adminEmail}`,
    `Mot de passe : ${params.password}`,
    "",
    "Changez votre mot de passe à la première connexion.",
    trialLine,
    "",
    "Quotation Logistique — Ne pas répondre à cet email.",
  ].join("\n");
}
