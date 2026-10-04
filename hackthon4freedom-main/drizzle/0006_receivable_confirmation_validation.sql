CREATE TYPE "public"."admin_review_decision" AS ENUM('PASSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."client_confirmation_status" AS ENUM('PENDING', 'ACCEPTED', 'DIVERGED', 'BTC_REFUSED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."receivable_evidence_scan_status" AS ENUM('PENDING', 'CLEAN', 'INFECTED', 'UNSUPPORTED');--> statement-breakpoint
CREATE TABLE "admin_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"validation_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"decision" "admin_review_decision" NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_reviews_validation_id_unique" UNIQUE("validation_id"),
	CONSTRAINT "admin_reviews_reason_present" CHECK (length("admin_reviews"."reason") >= 10)
);
--> statement-breakpoint
CREATE TABLE "client_confirmations" (
	"id" text PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"receivable_version" integer NOT NULL,
	"token_hash" text NOT NULL,
	"status" "client_confirmation_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"client_accepts_btc" boolean,
	"confirmed_amount" bigint,
	"confirmed_due_at" timestamp with time zone,
	"terms_version" text,
	"divergences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_confirmations_used_terminal" CHECK ("client_confirmations"."status" = 'PENDING'::client_confirmation_status or "client_confirmations"."used_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "receivable_evidences" (
	"id" text PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"receivable_version" integer NOT NULL,
	"private_object_reference" text NOT NULL,
	"sha256" text NOT NULL,
	"extension" text NOT NULL,
	"declared_mime_type" text NOT NULL,
	"detected_mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"scan_status" "receivable_evidence_scan_status" DEFAULT 'PENDING' NOT NULL,
	"scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivable_evidences_size_positive" CHECK ("receivable_evidences"."byte_size" > 0),
	CONSTRAINT "receivable_evidences_clean_scanned" CHECK ("receivable_evidences"."scan_status" <> 'CLEAN'::receivable_evidence_scan_status or "receivable_evidences"."scanned_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "receivable_fingerprints" (
	"sha256" text PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "receivable_fingerprints_receivable_id_unique" UNIQUE("receivable_id")
);
--> statement-breakpoint
CREATE TABLE "receivable_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"version" integer NOT NULL,
	"service_description" text NOT NULL,
	"contract_asset" "asset_code" DEFAULT 'USD_REFERENCE' NOT NULL,
	"nominal_amount" bigint NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivable_versions_version_positive" CHECK ("receivable_versions"."version" > 0),
	CONSTRAINT "receivable_versions_nominal_positive" CHECK ("receivable_versions"."nominal_amount" > 0),
	CONSTRAINT "receivable_versions_asset_usd_reference" CHECK ("receivable_versions"."contract_asset" = 'USD_REFERENCE'::asset_code)
);
--> statement-breakpoint
ALTER TABLE "validations" ADD COLUMN "receivable_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_confirmations" ADD CONSTRAINT "client_confirmations_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_evidences" ADD CONSTRAINT "receivable_evidences_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_fingerprints" ADD CONSTRAINT "receivable_fingerprints_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_versions" ADD CONSTRAINT "receivable_versions_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_confirmations_token_hash_unique" ON "client_confirmations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "client_confirmations_one_pending_unique" ON "client_confirmations" USING btree ("receivable_id") WHERE "client_confirmations"."status" = 'PENDING'::client_confirmation_status;--> statement-breakpoint
CREATE INDEX "client_confirmations_receivable_idx" ON "client_confirmations" USING btree ("receivable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_evidences_private_reference_unique" ON "receivable_evidences" USING btree ("private_object_reference");--> statement-breakpoint
CREATE INDEX "receivable_evidences_hash_idx" ON "receivable_evidences" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_versions_number_unique" ON "receivable_versions" USING btree ("receivable_id","version");--> statement-breakpoint
ALTER TABLE "client_confirmations" ADD CONSTRAINT "client_confirmations_version_fk" FOREIGN KEY ("receivable_id", "receivable_version") REFERENCES "receivable_versions"("receivable_id", "version") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "receivable_evidences" ADD CONSTRAINT "receivable_evidences_version_fk" FOREIGN KEY ("receivable_id", "receivable_version") REFERENCES "receivable_versions"("receivable_id", "version") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "client_confirmations" ADD CONSTRAINT "client_confirmations_token_hash_shape" CHECK ("token_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "receivable_evidences" ADD CONSTRAINT "receivable_evidences_hash_shape" CHECK ("sha256" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;--> statement-breakpoint
CREATE TRIGGER receivable_versions_append_only
BEFORE UPDATE OR DELETE ON receivable_versions
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER admin_reviews_append_only
BEFORE UPDATE OR DELETE ON admin_reviews
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();
