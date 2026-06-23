import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { spectral, hankenGrotesk } from "@/app/fonts";
import { SessionGuard } from "@/components/auth/session-guard";
import { RegisterSW } from "@/components/pwa/register-sw";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Quotation Logistique",
    template: "%s | Quotation Logistique",
  },
  description:
    "Gestion de devis pour professionnels du transport et de la logistique au Niger.",
  keywords: [
    "devis",
    "transport",
    "logistique",
    "Niger",
    "FCFA",
    "gestion",
    "professionnels",
  ],
  authors: [{ name: "Maiga Tech Lab" }],
  creator: "Maiga Tech Lab",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://quotation.logistique.ne"),
  openGraph: {
    type: "website",
    locale: "fr_NE",
    siteName: "Quotation Logistique",
    title: "Quotation Logistique",
    description:
      "Gestion de devis pour professionnels du transport et de la logistique au Niger.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quotation Logistique",
    description:
      "Gestion de devis pour professionnels du transport et de la logistique au Niger.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Quotation Logistique",
  description:
    "Gestion de devis pour professionnels du transport et de la logistique au Niger.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any",
  author: {
    "@type": "Organization",
    name: "Maiga Tech Lab",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${spectral.variable} ${hankenGrotesk.variable} antialiased min-h-dvh flex flex-col`}
      >
        <NextIntlClientProvider messages={messages} locale="fr-NE">
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            <RegisterSW />
            <SessionGuard />
            {children}
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
