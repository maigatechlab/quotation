import { afterEach, describe, expect, it, vi } from "vitest";
import { checkEnv, getClientEnv } from "./env";

describe("checkEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubBaseRequired() {
    vi.stubEnv("POSTGRES_URL", "postgres://user:pass@localhost:5432/db");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
  }

  it("passes in development without production-only keys", () => {
    stubBaseRequired();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    expect(() => checkEnv()).not.toThrow();
  });

  it("throws in production when RESEND_API_KEY is missing", () => {
    stubBaseRequired();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.com");
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("APEX_DOMAIN", "quotation-app.example.com");

    expect(() => checkEnv()).toThrow("RESEND_API_KEY is required in production");
  });

  it("throws in production when CRON_SECRET is missing", () => {
    stubBaseRequired();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_x");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.com");
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("APEX_DOMAIN", "quotation-app.example.com");

    expect(() => checkEnv()).toThrow("CRON_SECRET is required in production");
  });

  it("throws in production when STRIPE_SECRET_KEY is missing", () => {
    stubBaseRequired();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_x");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.com");
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("APEX_DOMAIN", "quotation-app.example.com");

    expect(() => checkEnv()).toThrow("STRIPE_SECRET_KEY is required in production");
  });

  it("throws in production when APEX_DOMAIN is missing", () => {
    stubBaseRequired();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_x");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.com");
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("APEX_DOMAIN", "");

    expect(() => checkEnv()).toThrow("APEX_DOMAIN is required in production");
  });

  it("passes in production when all required keys are present", () => {
    stubBaseRequired();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_x");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.com");
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("APEX_DOMAIN", "quotation-app.example.com");

    expect(() => checkEnv()).not.toThrow();
  });

  it("still throws when POSTGRES_URL is missing regardless of NODE_ENV", () => {
    vi.stubEnv("POSTGRES_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("NODE_ENV", "development");

    expect(() => checkEnv()).toThrow("POSTGRES_URL is required");
  });

  it("rejects a malformed NEXT_PUBLIC_SENTRY_DSN on the env check path", () => {
    stubBaseRequired();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_x");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.com");
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("APEX_DOMAIN", "quotation-app.example.com");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "not-a-url");

    expect(() => checkEnv()).toThrow(
      "NEXT_PUBLIC_SENTRY_DSN must be a valid URL when set"
    );
  });
});

describe("getClientEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows an empty NEXT_PUBLIC_SENTRY_DSN", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    expect(() => getClientEnv()).not.toThrow();
  });

  it("accepts a valid NEXT_PUBLIC_SENTRY_DSN URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@sentry.io/12345");

    expect(() => getClientEnv()).not.toThrow();
  });

  it("rejects a malformed NEXT_PUBLIC_SENTRY_DSN", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "not-a-url");

    expect(() => getClientEnv()).toThrow("Invalid client environment variables");
  });
});
