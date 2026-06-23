ALTER TABLE "clause" ADD COLUMN "pays" text DEFAULT 'NE';--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "pays" text DEFAULT 'NE';--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "pays" text DEFAULT 'NE';--> statement-breakpoint
CREATE INDEX "idx_clause_company_id" ON "clause" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_quote_clause_clause_id" ON "quote_clause" USING btree ("clause_id");--> statement-breakpoint
CREATE INDEX "idx_quote_line_company_id" ON "quote_line" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_quote_status_log_changed_by" ON "quote_status_log" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "idx_template_company_id" ON "template" USING btree ("company_id");