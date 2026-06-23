import * as Sentry from "@sentry/nextjs";

export function initSentryEdge() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    console.warn("Sentry disabled: NEXT_PUBLIC_SENTRY_DSN not set");
    return;
  }

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
  });
}