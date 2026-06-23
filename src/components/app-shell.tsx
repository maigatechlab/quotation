"use client"

import { usePathname } from "next/navigation"

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"]

export function AppShell({
  children,
  header,
  footer,
}: {
  children: React.ReactNode
  header: React.ReactNode
  footer: React.ReactNode
}) {
  const pathname = usePathname()
  const isAuthPage = AUTH_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )

  return (
    <>
      {!isAuthPage && header}
      <main id="main-content" className="flex-1">
        {children}
      </main>
      {!isAuthPage && footer}
    </>
  )
}
