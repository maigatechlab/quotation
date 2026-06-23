CREATE TYPE "public"."quote_status" AS ENUM('draft', 'validated', 'sent', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'commercial', 'operateur');--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"who" text NOT NULL,
	"what" text NOT NULL,
	"when" timestamp DEFAULT now() NOT NULL,
	"where" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clause" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titre" text NOT NULL,
	"contenu" text NOT NULL,
	"categorie" text,
	"company_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"phone" text NOT NULL,
	"email" text,
	"country" text DEFAULT 'NE',
	"city" text,
	"address" text,
	"notes" text,
	"deleted_at" timestamp,
	"owner_id" text,
	"company_id" uuid,
	"pays" text DEFAULT 'NE',
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raison_sociale" text NOT NULL,
	"forme_juridique" text,
	"capital" integer,
	"rccm" text NOT NULL,
	"nif" text NOT NULL,
	"adresse" text,
	"bp" text,
	"phones" jsonb DEFAULT '[]'::jsonb,
	"emails" jsonb DEFAULT '[]'::jsonb,
	"logo_url" text,
	"signataire_nom" text,
	"signataire_fonction" text,
	"conditions_paiement_defaut" text,
	"company_id" uuid,
	"pays" text DEFAULT 'NE',
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"reference" text,
	"objet" text,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"client_id" uuid,
	"client_snapshot" jsonb,
	"owner_id" text,
	"date_devis" timestamp,
	"date_validite" timestamp,
	"signataire_nom" text,
	"signataire_fonction" text,
	"conditions_paiement" text,
	"origin_country" text,
	"origin_city" text,
	"destination_country" text,
	"destination_city" text,
	"goods_nature" text,
	"tonnage" real,
	"truck_capacity" real,
	"truck_count" integer,
	"unit_price" integer,
	"source_currency" text DEFAULT 'XOF',
	"exchange_rate" real DEFAULT 1,
	"goods_value_fcfa" integer,
	"total_fcfa" integer DEFAULT 0 NOT NULL,
	"company_id" uuid,
	"pays" text DEFAULT 'NE',
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_clause" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"clause_id" uuid,
	"contenu_override" text,
	"ordre" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"designation" text NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total_fcfa" integer NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"template_id" uuid,
	"company_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_status_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"from_status" "quote_status",
	"to_status" "quote_status" NOT NULL,
	"changed_by" text,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb,
	"company_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'commercial' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_clause" ADD CONSTRAINT "quote_clause_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_clause" ADD CONSTRAINT "quote_clause_clause_id_clause_id_fk" FOREIGN KEY ("clause_id") REFERENCES "public"."clause"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_status_log" ADD CONSTRAINT "quote_status_log_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_status_log" ADD CONSTRAINT "quote_status_log_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_event_entity" ON "audit_event" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_event_who" ON "audit_event" USING btree ("who");--> statement-breakpoint
CREATE INDEX "idx_client_owner_id" ON "client" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_client_company_id" ON "client" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_client_deleted_at" ON "client" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_quote_client_id" ON "quote" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_quote_owner_id" ON "quote" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_quote_status" ON "quote" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_quote_company_id" ON "quote" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_quote_number" ON "quote" USING btree ("number");--> statement-breakpoint
CREATE INDEX "idx_quote_clause_quote_id" ON "quote_clause" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_quote_line_quote_id" ON "quote_line" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_quote_status_log_quote_id" ON "quote_status_log" USING btree ("quote_id");