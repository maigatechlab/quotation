CREATE TABLE "stripe_processed_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"tenant_id" uuid,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "stripe_processed_events" ADD CONSTRAINT "stripe_processed_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_stripe_events_event_id" ON "stripe_processed_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenants_stripe_customer_id" ON "tenants" USING btree ("stripe_customer_id") WHERE "tenants"."stripe_customer_id" IS NOT NULL;