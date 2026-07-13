import { z } from "zod";

/**
 * Server-side environment variables schema.
 * These variables are only available on the server.
 */
const serverEnvSchema = z
  .object({
    // Database
    POSTGRES_URL: z.string().url("Invalid database URL"),

    // Authentication
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),

    // OAuth
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // AI
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL: z.string().default("openai/gpt-5-mini"),

    // Storage
    BLOB_READ_WRITE_TOKEN: z.string().optional(),

    // Email (Resend) — required in production only, empty by design in dev/test
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),

    // Cron
    CRON_SECRET: z.string().optional(),


    // Multi-tenant subdomains — defaults to placeholder "quotation.com" in
    // tenant-config.ts, so it must be set explicitly in production or every
    // emailed tenant URL points to an unreachable domain.
    APEX_DOMAIN: z.string().optional(),

    // App
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== "production") return;

    const requiredInProduction = [
      ["RESEND_API_KEY", data.RESEND_API_KEY],
      ["EMAIL_FROM", data.EMAIL_FROM],
      ["CRON_SECRET", data.CRON_SECRET],
      ["APEX_DOMAIN", data.APEX_DOMAIN],
    ] as const;

    for (const [key, value] of requiredInProduction) {
      if (!value) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
  });

/**
 * Client-side environment variables schema.
 * These variables are exposed to the browser via NEXT_PUBLIC_ prefix.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SENTRY_DSN: z
    .union([z.literal(""), z.string().url("Invalid Sentry DSN URL")])
    .optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Validates and returns server-side environment variables.
 * Throws an error if validation fails.
 */
export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error(
      "Invalid server environment variables:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error("Invalid server environment variables");
  }

  return parsed.data;
}

/**
 * Validates and returns client-side environment variables.
 * Throws an error if validation fails.
 */
export function getClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });

  if (!parsed.success) {
    console.error(
      "Invalid client environment variables:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error("Invalid client environment variables");
  }

  return parsed.data;
}

/**
 * Checks if required environment variables are set.
 * Logs warnings for missing optional variables.
 */
export function checkEnv(): void {
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  // Check required variables
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required");
  }

  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  // Production-only required variables (Story 8.7 — closes gap left by
  // Stories 8.2/8.3 where these were only checked at runtime, not at boot)
  const productionRequired: Array<[string, string | undefined]> = [
    ["RESEND_API_KEY", process.env.RESEND_API_KEY],
    ["EMAIL_FROM", process.env.EMAIL_FROM],
    ["CRON_SECRET", process.env.CRON_SECRET],
    ["APEX_DOMAIN", process.env.APEX_DOMAIN],
  ];

  for (const [key, value] of productionRequired) {
    if (!value) {
      if (isProduction) {
        throw new Error(`${key} is required in production`);
      }
      warnings.push(`${key} is not set.`);
    }
  }

  // Check optional variables and warn
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    warnings.push("Google OAuth is not configured. Social login will be disabled.");
  }

  if (!process.env.OPENROUTER_API_KEY) {
    warnings.push("OPENROUTER_API_KEY is not set. AI chat will not work.");
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    warnings.push("BLOB_READ_WRITE_TOKEN is not set. Using local storage for file uploads.");
  }

  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const parsedClientEnv = clientEnvSchema.safeParse({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    });

    if (!parsedClientEnv.success) {
      throw new Error("NEXT_PUBLIC_SENTRY_DSN must be a valid URL when set");
    }
  }

  // Log warnings in development
  if (process.env.NODE_ENV === "development" && warnings.length > 0) {
    console.warn("\n⚠️  Environment warnings:");
    warnings.forEach((w) => console.warn(`   - ${w}`));
    console.warn("");
  }
}
