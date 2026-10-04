CREATE TYPE "public"."financial_environment" AS ENUM('SIMULATION');--> statement-breakpoint
CREATE TYPE "public"."partial_pool_decision" AS ENUM('ACCEPT_PARTIAL', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."pool_risk_band" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TABLE "partial_pool_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"decision" "partial_pool_decision" NOT NULL,
	"actor_id" text NOT NULL,
	"funded_amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partial_pool_decisions_pool_id_unique" UNIQUE("pool_id"),
	CONSTRAINT "partial_pool_decisions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "partial_pool_decisions_funded_positive" CHECK ("partial_pool_decisions"."funded_amount" > 0),
	CONSTRAINT "partial_pool_decisions_reason_present" CHECK (length("partial_pool_decisions"."reason") >= 5)
);
--> statement-breakpoint
CREATE TABLE "pool_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"btc_price_usd_cents" bigint NOT NULL,
	"source" text NOT NULL,
	"source_reference" text NOT NULL,
	"spread_bps" integer DEFAULT 0 NOT NULL,
	"lightning_fee_sats" bigint DEFAULT 0 NOT NULL,
	"swap_fee_usd_cents" bigint DEFAULT 0 NOT NULL,
	"environment" "financial_environment" DEFAULT 'SIMULATION' NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_quotes_price_positive" CHECK ("pool_quotes"."btc_price_usd_cents" > 0),
	CONSTRAINT "pool_quotes_spread_non_negative" CHECK ("pool_quotes"."spread_bps" >= 0),
	CONSTRAINT "pool_quotes_fees_non_negative" CHECK ("pool_quotes"."lightning_fee_sats" >= 0 and "pool_quotes"."swap_fee_usd_cents" >= 0),
	CONSTRAINT "pool_quotes_expiry_after_quote" CHECK ("pool_quotes"."expires_at" > "pool_quotes"."quoted_at")
);
--> statement-breakpoint
CREATE TABLE "pool_settlement_simulations" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payment_usd_cents" bigint NOT NULL,
	"principal_usd_cents" bigint NOT NULL,
	"external_costs_usd_cents" bigint NOT NULL,
	"applicable_losses_usd_cents" bigint NOT NULL,
	"net_result_usd_cents" bigint NOT NULL,
	"platform_result_usd_cents" bigint NOT NULL,
	"contributors_result_usd_cents" bigint NOT NULL,
	"rules_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_settlement_simulations_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "pool_settlement_simulations_values_non_negative" CHECK ("pool_settlement_simulations"."payment_usd_cents" >= 0 and "pool_settlement_simulations"."principal_usd_cents" >= 0 and "pool_settlement_simulations"."external_costs_usd_cents" >= 0 and "pool_settlement_simulations"."applicable_losses_usd_cents" >= 0 and "pool_settlement_simulations"."net_result_usd_cents" >= 0 and "pool_settlement_simulations"."platform_result_usd_cents" >= 0 and "pool_settlement_simulations"."contributors_result_usd_cents" >= 0),
	CONSTRAINT "pool_settlement_simulations_split" CHECK ("pool_settlement_simulations"."platform_result_usd_cents" + "pool_settlement_simulations"."contributors_result_usd_cents" = "pool_settlement_simulations"."net_result_usd_cents")
);
--> statement-breakpoint
ALTER TABLE "contribution_intents" ADD COLUMN "capacity_reserved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "quote_id" text;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "risk_band" "pool_risk_band" DEFAULT 'LOW' NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "environment" "financial_environment" DEFAULT 'SIMULATION' NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "rules_version" text DEFAULT 'pool-financial-v0.1' NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "nominal_usd_cents" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "advance_usd_cents" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "discount_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "reserved_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "paired_obligation_usdt_units" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "treasury_btc_reserved_sats" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "external_costs_usd_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partial_pool_decisions" ADD CONSTRAINT "partial_pool_decisions_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_settlement_simulations" ADD CONSTRAINT "pool_settlement_simulations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pool_quotes_source_reference_unique" ON "pool_quotes" USING btree ("source_reference");--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_quote_id_pool_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."pool_quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_nominal_advance_positive" CHECK ("pools"."nominal_usd_cents" > 0 and "pools"."advance_usd_cents" > 0 and "pools"."advance_usd_cents" <= "pools"."nominal_usd_cents");--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_discount_bps_range" CHECK ("pools"."discount_bps" >= 0 and "pools"."discount_bps" <= 500);--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_reserved_capacity_within_target" CHECK ("pools"."reserved_amount" >= 0 and "pools"."funded_amount" + "pools"."reserved_amount" <= "pools"."target_amount");--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_paired_segregation" CHECK (("pools"."mode" = 'FULL_BTC'::pool_mode and "pools"."paired_obligation_usdt_units" = 0 and "pools"."treasury_btc_reserved_sats" = 0) or ("pools"."mode" = 'USD_PAIRED'::pool_mode and "pools"."paired_obligation_usdt_units" > 0 and "pools"."treasury_btc_reserved_sats" >= "pools"."target_amount"));--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_external_costs_non_negative" CHECK ("pools"."external_costs_usd_cents" >= 0);--> statement-breakpoint
CREATE TRIGGER pool_quotes_append_only
BEFORE UPDATE OR DELETE ON pool_quotes
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER partial_pool_decisions_append_only
BEFORE UPDATE OR DELETE ON partial_pool_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER pool_settlement_simulations_append_only
BEFORE UPDATE OR DELETE ON pool_settlement_simulations
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_pool_financial_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'PARTIAL_EXPIRED'::pool_status AND
    (NEW.funded_amount <= 0 OR NEW.funded_amount >= NEW.target_amount OR NEW.reserved_amount <> 0) THEN
    RAISE EXCEPTION 'partial expiry requires positive partial funding and no reservations'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'ACCEPTED_PARTIAL'::pool_status AND NOT EXISTS (
    SELECT 1 FROM partial_pool_decisions
    WHERE pool_id = NEW.id AND decision = 'ACCEPT_PARTIAL'::partial_pool_decision
  ) THEN
    RAISE EXCEPTION 'accepted partial pool requires an immutable decision'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'REFUNDING'::pool_status AND NOT EXISTS (
    SELECT 1 FROM partial_pool_decisions
    WHERE pool_id = NEW.id AND decision = 'REFUND'::partial_pool_decision
  ) THEN
    RAISE EXCEPTION 'refunding pool requires an immutable decision'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER pools_financial_state_guard
BEFORE UPDATE OF status ON pools
FOR EACH ROW EXECUTE FUNCTION enforce_pool_financial_state();
