CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('nitta', 'wave', 'amana', 'stripe', 'cash', 'virement');--> statement-breakpoint
CREATE TYPE "public"."tenant_plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'trial', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_reference" text,
	"paid_at" timestamp NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"billing_cycle" "billing_cycle" NOT NULL,
	"confirmed_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "tenant_status" DEFAULT 'trial' NOT NULL,
	"plan" "tenant_plan" DEFAULT 'free' NOT NULL,
	"subscription_start" date,
	"subscription_end" date,
	"trial_ends_at" date,
	"grace_period_ends_at" date,
	"max_users" integer DEFAULT 3 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_events" ADD CONSTRAINT "tenant_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subscription_payments_tenant_id" ON "subscription_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_payments_paid_at" ON "subscription_payments" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "idx_tenant_events_tenant_id" ON "tenant_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_events_created_at" ON "tenant_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_tenant_id_idx" ON "user" USING btree ("tenant_id");