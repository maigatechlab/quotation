CREATE TYPE "public"."quota_status" AS ENUM('ok', 'warning', 'exceeded', 'readonly');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('starter', 'pro', 'entreprise');--> statement-breakpoint
CREATE TABLE "company_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tier" "tier" DEFAULT 'starter' NOT NULL,
	"quota_status" "quota_status" DEFAULT 'ok' NOT NULL,
	"quota_used_quotes" integer DEFAULT 0 NOT NULL,
	"quota_used_users" integer DEFAULT 0 NOT NULL,
	"quota_reset_at" timestamp NOT NULL,
	"grace_expires_at" timestamp,
	"exceeded_at" timestamp,
	"notified_80pct" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_subscription_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE INDEX "idx_company_sub_company_id" ON "company_subscription" USING btree ("company_id");