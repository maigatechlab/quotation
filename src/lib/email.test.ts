import { afterEach, describe, expect, it, vi } from "vitest"
import { buildResetPasswordHtml, isEmailDeliveryConfigured, sendEmail } from "./email"

describe("email", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("escapes reset email HTML content", () => {
    const html = buildResetPasswordHtml(
      'user"><script>alert(1)</script>@example.com',
      'https://example.com/reset?token=" onclick="alert(1)'
    )

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).toContain("&quot; onclick=&quot;alert(1)")
    expect(html).not.toContain("<script>alert(1)</script>")
  })

  it("requires Resend configuration in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("RESEND_API_KEY", "")

    expect(isEmailDeliveryConfigured()).toBe(false)
    await expect(
      sendEmail({ to: "a@example.com", subject: "Sujet", html: "<p>Test</p>", text: "Test" })
    ).rejects.toThrow("RESEND_API_KEY")
  })
})
