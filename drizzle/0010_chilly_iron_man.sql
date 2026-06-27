CREATE TABLE "route_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"origin_country" text NOT NULL,
	"origin_city" text NOT NULL,
	"destination_country" text NOT NULL,
	"destination_city" text NOT NULL,
	"distance_km" real,
	"tarif_fcfa" integer,
	"deleted_at" timestamp,
	"company_id" uuid,
	"pays" text DEFAULT 'NE',
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_route_template_company_id" ON "route_template" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_route_template_deleted_at" ON "route_template" USING btree ("deleted_at");