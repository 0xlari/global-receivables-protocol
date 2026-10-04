CREATE TYPE "public"."payment_purpose" AS ENUM('SERVICE', 'SALARY', 'SALE', 'COMMISSION', 'OTHER');--> statement-breakpoint
ALTER TABLE "pools" ALTER COLUMN "rules_version" SET DEFAULT 'pool-financial-v0.2';--> statement-breakpoint
ALTER TABLE "client_confirmations" ADD COLUMN "confirms_description" boolean;--> statement-breakpoint
ALTER TABLE "receivable_versions" ADD COLUMN "payment_purpose" "payment_purpose" DEFAULT 'SERVICE' NOT NULL;--> statement-breakpoint
UPDATE "client_confirmations" SET "confirms_description" = true WHERE "status" = 'ACCEPTED';--> statement-breakpoint
ALTER TABLE "client_confirmations" ADD CONSTRAINT "client_confirmations_accepted_matches_all_terms" CHECK ("client_confirmations"."status" <> 'ACCEPTED'::client_confirmation_status or ("client_confirmations"."client_accepts_btc" is true and "client_confirmations"."confirms_description" is true and "client_confirmations"."confirmed_amount" is not null and "client_confirmations"."confirmed_due_at" is not null and "client_confirmations"."terms_version" is not null));
