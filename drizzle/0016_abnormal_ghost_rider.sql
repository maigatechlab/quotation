ALTER TABLE "user" ADD COLUMN "disabled_at" timestamp;--> statement-breakpoint
CREATE INDEX "user_tenant_disabled_idx" ON "user" USING btree ("tenant_id","disabled_at");