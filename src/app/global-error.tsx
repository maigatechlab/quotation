"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface GlobalErrorProps {
  error: Error & { digest?: string };
}

export default function GlobalError({ error }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold">Une erreur est survenue</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Veuillez recharger la page ou reessayer plus tard.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}