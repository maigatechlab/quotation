interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text: string
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) || process.env.NODE_ENV !== "production"
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;")
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is required for production email delivery")
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n${"=".repeat(60)}\nEMAIL (dev mode - configure RESEND_API_KEY for real sending)\nTo: ${to}\nSubject: ${subject}\nContent: ${text}\n${"=".repeat(60)}\n`
    )
    return
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Quotation Logistique <noreply@quotation.app>",
      to,
      subject,
      html,
      text,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Email send failed: ${error}`)
  }
}

export function buildResetPasswordHtml(email: string, resetUrl: string): string {
  const safeEmail = escapeHtml(email)
  const safeResetUrl = escapeAttribute(resetUrl)

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <h2 style="color:#1a2744">Réinitialisation de votre mot de passe</h2>
      <p>Bonjour,</p>
      <p>Vous avez demandé la réinitialisation du mot de passe pour le compte <strong>${safeEmail}</strong>.</p>
      <p style="margin:24px 0">
        <a href="${safeResetUrl}"
           style="background:#1a2744;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Réinitialiser mon mot de passe
        </a>
      </p>
      <p style="color:#6b7280;font-size:14px">Ce lien est valable 24 heures et ne peut être utilisé qu'une seule fois.</p>
      <p style="color:#6b7280;font-size:14px">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px">Quotation Logistique — Ne pas répondre à cet email.</p>
    </div>
  `
}
