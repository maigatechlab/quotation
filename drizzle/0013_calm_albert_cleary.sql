ALTER TABLE "audit_event" ADD COLUMN "company_id" text;--> statement-breakpoint
CREATE INDEX "idx_audit_event_company" ON "audit_event" USING btree ("company_id");