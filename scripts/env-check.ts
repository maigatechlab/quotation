import { checkEnv } from "../src/lib/env";

// `--production` forces production-mode checks regardless of the loaded
// NODE_ENV — a pre-prod .env file may omit NODE_ENV entirely, which would
// otherwise silently skip RESEND_API_KEY/CRON_SECRET enforcement.
if (process.argv.includes("--production")) {
  process.env.NODE_ENV = "production";
}

try {
  checkEnv();
  console.log(
    `✅ Environment variables OK${process.env.NODE_ENV === "production" ? " (production mode)" : ""}`
  );
} catch (error) {
  console.error("❌ Environment check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
