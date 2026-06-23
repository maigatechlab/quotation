import type { ReactNode } from "react"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ResetPasswordForm } from "./reset-password-form"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  resetPassword: vi.fn(),
  params: new URLSearchParams(),
}))

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.params,
}))

vi.mock("@/lib/auth-client", () => ({
  resetPassword: (...args: unknown[]) => mocks.resetPassword(...args),
}))

describe("ResetPasswordForm", () => {
  afterEach(() => {
    cleanup()
    mocks.push.mockReset()
    mocks.resetPassword.mockReset()
    mocks.params = new URLSearchParams()
  })

  it("shows the invalid link message for Better Auth INVALID_TOKEN callbacks", () => {
    mocks.params = new URLSearchParams("error=INVALID_TOKEN")

    const { container } = render(<ResetPasswordForm />)

    expect(container.textContent).toContain("Ce lien est invalide ou a déjà été utilisé.")
    expect(container.textContent).toContain("Demander un nouveau lien")
  })

  it("submits the token and redirects after a successful reset", async () => {
    mocks.params = new URLSearchParams("token=abc123")
    mocks.resetPassword.mockResolvedValue({ error: null })

    const { container } = render(<ResetPasswordForm />)
    const password = container.querySelector("#password") as HTMLInputElement
    const confirmPassword = container.querySelector("#confirmPassword") as HTMLInputElement
    const form = container.querySelector("form") as HTMLFormElement

    fireEvent.change(password, { target: { value: "nouveau-secret" } })
    fireEvent.change(confirmPassword, { target: { value: "nouveau-secret" } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mocks.resetPassword).toHaveBeenCalledWith({
        newPassword: "nouveau-secret",
        token: "abc123",
      })
      expect(mocks.push).toHaveBeenCalledWith("/login?reset=success")
    })
  })
})
