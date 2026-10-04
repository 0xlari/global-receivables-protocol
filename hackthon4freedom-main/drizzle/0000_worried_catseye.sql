CREATE TYPE "public"."asset_code" AS ENUM('BTC', 'USD_REFERENCE', 'USDT');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('CREATED', 'INVOICE_ISSUED', 'PENDING', 'SETTLED', 'EXPIRED', 'FAILED', 'ALLOCATED', 'DISTRIBUTED', 'REFUND_PENDING', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."ledger_transaction_status" AS ENUM('PENDING', 'POSTED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."pool_mode" AS ENUM('FULL_BTC', 'USD_PAIRED');--> statement-breakpoint
CREATE TYPE "public"."pool_status" AS ENUM('DRAFT', 'OPEN', 'FULL', 'PARTIAL_EXPIRED', 'CANCELLED', 'ACCEPTED_PARTIAL', 'REFUNDING', 'DISBURSING', 'FUNDED', 'SETTLING', 'SETTLED', 'COVERED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."receivable_status" AS ENUM('DRAFT', 'AWAITING_CLIENT', 'UNDER_VALIDATION', 'NEEDS_CORRECTION', 'REJECTED', 'APPROVED', 'POOLED', 'ADVANCED', 'DUE', 'PAID', 'DEFAULTED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('PENDING', 'RUNNING', 'NEEDS_REVIEW', 'PASSED', 'FAILED');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"correlation_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"protected_contact_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contribution_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"contributor_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"asset" "asset_code" NOT NULL,
	"status" "contribution_status" DEFAULT 'CREATED' NOT NULL,
	"invoice_reference" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_intents_invoice_reference_unique" UNIQUE("invoice_reference"),
	CONSTRAINT "contribution_intents_amount_positive" CHECK ("contribution_intents"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"external_payment_reference" text NOT NULL,
	"amount" bigint NOT NULL,
	"asset" "asset_code" NOT NULL,
	"status" "contribution_status" DEFAULT 'SETTLED' NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_amount_positive" CHECK ("contributions"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"asset" "asset_code" NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"account_id" text NOT NULL,
	"asset" "asset_code" NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_non_zero" CHECK ("ledger_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"description" text NOT NULL,
	"status" "ledger_transaction_status" DEFAULT 'PENDING' NOT NULL,
	"correlation_id" text NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_attempts_non_negative" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pool_allocations" (
	"pool_id" text NOT NULL,
	"contribution_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_allocations_pool_id_contribution_id_pk" PRIMARY KEY("pool_id","contribution_id"),
	CONSTRAINT "pool_allocations_amount_positive" CHECK ("pool_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" text PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"mode" "pool_mode" NOT NULL,
	"settlement_asset" "asset_code" NOT NULL,
	"target_amount" bigint NOT NULL,
	"funded_amount" bigint DEFAULT 0 NOT NULL,
	"status" "pool_status" DEFAULT 'DRAFT' NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pools_target_amount_positive" CHECK ("pools"."target_amount" > 0),
	CONSTRAINT "pools_funded_amount_within_target" CHECK ("pools"."funded_amount" >= 0 and "pools"."funded_amount" <= "pools"."target_amount")
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_id" text NOT NULL,
	"client_id" text NOT NULL,
	"contract_asset" "asset_code" DEFAULT 'USD_REFERENCE' NOT NULL,
	"nominal_amount" bigint NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "receivable_status" DEFAULT 'DRAFT' NOT NULL,
	"evidence_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"client_accepted_btc" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivables_nominal_amount_positive" CHECK ("receivables"."nominal_amount" > 0),
	CONSTRAINT "receivables_version_positive" CHECK ("receivables"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"status" "user_status" DEFAULT 'PENDING' NOT NULL,
	"nostr_pubkey" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_nostr_pubkey_unique" UNIQUE("nostr_pubkey")
);
--> statement-breakpoint
CREATE TABLE "validations" (
	"id" text PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"status" "validation_status" DEFAULT 'PENDING' NOT NULL,
	"rules_version" text NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision_reason" text,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contribution_intents" ADD CONSTRAINT "contribution_intents_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_intents" ADD CONSTRAINT "contribution_intents_contributor_id_users_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_intent_id_contribution_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."contribution_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_allocations" ADD CONSTRAINT "pool_allocations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_allocations" ADD CONSTRAINT "pool_allocations_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "contribution_intents_pool_idx" ON "contribution_intents" USING btree ("pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_external_payment_unique" ON "contributions" USING btree ("external_payment_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_asset_unique" ON "ledger_accounts" USING btree ("code","asset");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_id_asset_unique" ON "ledger_accounts" USING btree ("id","asset");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_idempotency_unique" ON "ledger_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("processed_at","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_allocations_contribution_unique" ON "pool_allocations" USING btree ("contribution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pools_one_active_per_receivable" ON "pools" USING btree ("receivable_id") WHERE "pools"."status" not in ('CANCELLED'::pool_status, 'SETTLED'::pool_status);--> statement-breakpoint
CREATE INDEX "receivables_requester_idx" ON "receivables" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "validations_receivable_idx" ON "validations" USING btree ("receivable_id");
