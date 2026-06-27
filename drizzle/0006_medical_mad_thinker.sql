CREATE TABLE "sync_op_log" (
	"op_id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"type" text NOT NULL,
	"result" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_sync_op_log_entity" ON "sync_op_log" USING btree ("entity","entity_id");