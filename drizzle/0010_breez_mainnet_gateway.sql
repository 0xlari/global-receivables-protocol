CREATE TYPE "public"."external_payment_purpose" AS ENUM('CONTRIBUTION', 'PAYER_SETTLEMENT', 'REQUESTER_DISBURSEMENT', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."external_payment_status" AS ENUM('PREPARING', 'PENDING', 'SETTLED', 'EXPIRED', 'FAILED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."external_swap_direction" AS ENUM('L_BTC_TO_USDT', 'USDT_TO_L_BTC');--> statement-breakpoint
CREATE TYPE "public"."external_swap_status" AS ENUM('PREPARED', 'EXECUTING', 'COMPLETE', 'FAILED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('MATCHED', 'DIVERGED', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."financial_environment" ADD VALUE 'TESTNET';--> statement-breakpoint
ALTER TYPE "public"."financial_environment" ADD VALUE 'MAINNET';--> statement-breakpoint
CREATE TABLE "external_payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_request_id" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"event_type" text NOT NULL,
	"external_reference" text NOT NULL,
	"amount_sat" bigint,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_payment_events_hash_shape" CHECK ("external_payment_events"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "external_payment_events_amount_non_negative" CHECK ("external_payment_events"."amount_sat" is null or "external_payment_events"."amount_sat" >= 0)
);
--> statement-breakpoint
CREATE TABLE "external_payment_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text,
	"idempotency_key" text NOT NULL,
	"session_id" text NOT NULL,
	"environment" "financial_environment" DEFAULT 'MAINNET' NOT NULL,
	"purpose" "external_payment_purpose" NOT NULL,
	"expected_asset" "asset_code" NOT NULL,
	"expected_amount" bigint NOT NULL,
	"destination" text,
	"external_reference" text,
	"status" "external_payment_status" DEFAULT 'PREPARING' NOT NULL,
	"fees_sat" bigint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_payment_requests_mainnet_only" CHECK ("external_payment_requests"."environment" = 'MAINNET'::financial_environment),
	CONSTRAINT "external_payment_requests_amount_positive" CHECK ("external_payment_requests"."expected_amount" > 0),
	CONSTRAINT "external_payment_requests_fees_non_negative" CHECK ("external_payment_requests"."fees_sat" >= 0),
	CONSTRAINT "external_payment_requests_contribution_intent" CHECK ("external_payment_requests"."purpose" <> 'CONTRIBUTION'::external_payment_purpose or "external_payment_requests"."intent_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "external_swap_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"environment" "financial_environment" DEFAULT 'MAINNET' NOT NULL,
	"direction" "external_swap_direction" NOT NULL,
	"from_asset_id" text NOT NULL,
	"to_asset_id" text NOT NULL,
	"receiver_amount_units" bigint NOT NULL,
	"fees_sat" bigint DEFAULT 0 NOT NULL,
	"estimated_asset_fees_units" bigint DEFAULT 0 NOT NULL,
	"max_slippage_bps" integer NOT NULL,
	"status" "external_swap_status" DEFAULT 'PREPARED' NOT NULL,
	"external_reference" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_swap_attempts_mainnet_only" CHECK ("external_swap_attempts"."environment" = 'MAINNET'::financial_environment),
	CONSTRAINT "external_swap_attempts_assets_distinct" CHECK ("external_swap_attempts"."from_asset_id" <> "external_swap_attempts"."to_asset_id"),
	CONSTRAINT "external_swap_attempts_amount_positive" CHECK ("external_swap_attempts"."receiver_amount_units" > 0),
	CONSTRAINT "external_swap_attempts_fees_non_negative" CHECK ("external_swap_attempts"."fees_sat" >= 0 and "external_swap_attempts"."estimated_asset_fees_units" >= 0),
	CONSTRAINT "external_swap_attempts_slippage_range" CHECK ("external_swap_attempts"."max_slippage_bps" >= 0 and "external_swap_attempts"."max_slippage_bps" <= 500)
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"environment" "financial_environment" DEFAULT 'MAINNET' NOT NULL,
	"status" "reconciliation_status" NOT NULL,
	"external_btc_sats" bigint NOT NULL,
	"ledger_btc_sats" bigint NOT NULL,
	"btc_difference_sats" bigint NOT NULL,
	"external_usdt_units" bigint NOT NULL,
	"ledger_usdt_units" bigint NOT NULL,
	"usdt_difference_units" bigint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_runs_mainnet_only" CHECK ("reconciliation_runs"."environment" = 'MAINNET'::financial_environment),
	CONSTRAINT "reconciliation_runs_external_non_negative" CHECK ("reconciliation_runs"."external_btc_sats" >= 0 and "reconciliation_runs"."external_usdt_units" >= 0)
);
--> statement-breakpoint
ALTER TABLE "external_payment_events" ADD CONSTRAINT "external_payment_events_payment_request_id_external_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."external_payment_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_payment_requests" ADD CONSTRAINT "external_payment_requests_intent_id_contribution_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."contribution_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_swap_attempts" ADD CONSTRAINT "external_swap_attempts_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_payment_events_deduplication_unique" ON "external_payment_events" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "external_payment_events_request_idx" ON "external_payment_events" USING btree ("payment_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_payment_requests_idempotency_unique" ON "external_payment_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "external_payment_requests_external_reference_unique" ON "external_payment_requests" USING btree ("external_reference");--> statement-breakpoint
CREATE INDEX "external_payment_requests_pending_idx" ON "external_payment_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "external_payment_requests_session_idx" ON "external_payment_requests" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_swap_attempts_idempotency_unique" ON "external_swap_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "external_swap_attempts_external_reference_unique" ON "external_swap_attempts" USING btree ("external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_runs_idempotency_unique" ON "reconciliation_runs" USING btree ("idempotency_key");
