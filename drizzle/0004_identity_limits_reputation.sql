CREATE TYPE "public"."collateral_environment" AS ENUM('SIMULATION');--> statement-breakpoint
CREATE TYPE "public"."collateral_status" AS ENUM('PROPOSED', 'ACTIVE', 'RELEASED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('IDENTITY_PROCESSING', 'PROFESSIONAL_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('PENDING', 'VERIFIED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."identity_evidence_type" AS ENUM('IDENTITY', 'PROFESSIONAL_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."reputation_fact_status" AS ENUM('ACTIVE', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."reputation_fact_type" AS ENUM('RECEIVABLE_PAID', 'RECEIVABLE_DEFAULTED', 'CLIENT_PAID', 'CLIENT_DEFAULTED');--> statement-breakpoint
CREATE TYPE "public"."reputation_subject_type" AS ENUM('USER', 'CLIENT');--> statement-breakpoint
CREATE TABLE "collaterals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"asset" "asset_code" NOT NULL,
	"nominal_amount" bigint NOT NULL,
	"eligible_usd_cents" bigint NOT NULL,
	"status" "collateral_status" DEFAULT 'PROPOSED' NOT NULL,
	"environment" "collateral_environment" DEFAULT 'SIMULATION' NOT NULL,
	"reference" text NOT NULL,
	"expires_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaterals_reference_unique" UNIQUE("reference"),
	CONSTRAINT "collaterals_nominal_positive" CHECK ("collaterals"."nominal_amount" > 0),
	CONSTRAINT "collaterals_eligible_usd_positive" CHECK ("collaterals"."eligible_usd_cents" > 0),
	CONSTRAINT "collaterals_simulation_only" CHECK ("collaterals"."environment" = 'SIMULATION'::collateral_environment)
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "consent_type" NOT NULL,
	"policy_version" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_limit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"rule_version" text NOT NULL,
	"reason" text NOT NULL,
	"previous_total_amount" bigint NOT NULL,
	"new_total_amount" bigint NOT NULL,
	"previous_used_amount" bigint NOT NULL,
	"new_used_amount" bigint NOT NULL,
	"breakdown" jsonb NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_limit_events_amounts_non_negative" CHECK ("credit_limit_events"."previous_total_amount" >= 0 and "credit_limit_events"."new_total_amount" >= 0 and "credit_limit_events"."previous_used_amount" >= 0 and "credit_limit_events"."new_used_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_limits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"asset" "asset_code" DEFAULT 'USD_REFERENCE' NOT NULL,
	"total_amount" bigint DEFAULT 10000 NOT NULL,
	"used_amount" bigint DEFAULT 0 NOT NULL,
	"rule_version" text NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_limits_asset_usd_reference" CHECK ("credit_limits"."asset" = 'USD_REFERENCE'::asset_code),
	CONSTRAINT "credit_limits_total_non_negative" CHECK ("credit_limits"."total_amount" >= 0),
	CONSTRAINT "credit_limits_used_non_negative" CHECK ("credit_limits"."used_amount" >= 0),
	CONSTRAINT "credit_limits_version_positive" CHECK ("credit_limits"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "identity_evidences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "identity_evidence_type" NOT NULL,
	"provider" text NOT NULL,
	"protected_reference" text NOT NULL,
	"status" "evidence_status" DEFAULT 'PENDING' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_evidences_verified_timestamp" CHECK ("identity_evidences"."status" <> 'VERIFIED'::evidence_status or "identity_evidences"."verified_at" is not null),
	CONSTRAINT "identity_evidences_revoked_timestamp" CHECK ("identity_evidences"."status" <> 'REVOKED'::evidence_status or "identity_evidences"."revoked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "reputation_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" "reputation_subject_type" NOT NULL,
	"subject_id" text NOT NULL,
	"type" "reputation_fact_type" NOT NULL,
	"status" "reputation_fact_status" DEFAULT 'ACTIVE' NOT NULL,
	"evidence_reference" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collaterals" ADD CONSTRAINT "collaterals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_limit_events" ADD CONSTRAINT "credit_limit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_limits" ADD CONSTRAINT "credit_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_evidences" ADD CONSTRAINT "identity_evidences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collaterals_user_idx" ON "collaterals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consents_one_active_per_type" ON "consents" USING btree ("user_id","type") WHERE "consents"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "consents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_limit_events_idempotency_unique" ON "credit_limit_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "credit_limit_events_user_idx" ON "credit_limit_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_evidences_active_provider_unique" ON "identity_evidences" USING btree ("user_id","type","provider") WHERE "identity_evidences"."status" in ('PENDING'::evidence_status, 'VERIFIED'::evidence_status);--> statement-breakpoint
CREATE UNIQUE INDEX "identity_evidences_protected_reference_unique" ON "identity_evidences" USING btree ("protected_reference");--> statement-breakpoint
CREATE INDEX "identity_evidences_user_idx" ON "identity_evidences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reputation_facts_evidence_unique" ON "reputation_facts" USING btree ("evidence_reference");--> statement-breakpoint
CREATE INDEX "reputation_facts_subject_idx" ON "reputation_facts" USING btree ("subject_type","subject_id","type");