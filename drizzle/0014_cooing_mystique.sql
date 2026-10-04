CREATE TYPE "public"."mainnet_demo_status" AS ENUM('DRAFT', 'ARMED', 'ACTIVE', 'COMPLETED', 'STOPPED', 'ABORTED');--> statement-breakpoint
CREATE TABLE "mainnet_circuit_breaker_events" (
	"id" text PRIMARY KEY NOT NULL,
	"demo_run_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reason" text NOT NULL,
	"details_hash" text NOT NULL,
	"triggered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mainnet_circuit_breaker_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "mainnet_circuit_breaker_reason_present" CHECK (length("mainnet_circuit_breaker_events"."reason") >= 5),
	CONSTRAINT "mainnet_circuit_breaker_details_hash" CHECK ("mainnet_circuit_breaker_events"."details_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "mainnet_demo_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"demo_run_id" text NOT NULL,
	"approver_ref_hash" text NOT NULL,
	"checklist_hash" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mainnet_demo_approvals_demo_run_id_unique" UNIQUE("demo_run_id"),
	CONSTRAINT "mainnet_demo_approval_hashes" CHECK ("mainnet_demo_approvals"."approver_ref_hash" ~ '^[a-f0-9]{64}$' and "mainnet_demo_approvals"."checklist_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "mainnet_demo_approval_window" CHECK ("mainnet_demo_approvals"."expires_at" > "mainnet_demo_approvals"."approved_at" and "mainnet_demo_approvals"."expires_at" <= "mainnet_demo_approvals"."approved_at" + interval '2 hours'),
	CONSTRAINT "mainnet_demo_approval_revocation" CHECK ("mainnet_demo_approvals"."revoked_at" is null or "mainnet_demo_approvals"."revoked_at" >= "mainnet_demo_approvals"."approved_at")
);
--> statement-breakpoint
CREATE TABLE "mainnet_demo_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"readiness_audit_id" text NOT NULL,
	"status" "mainnet_demo_status" DEFAULT 'DRAFT' NOT NULL,
	"operator_ref_hash" text NOT NULL,
	"max_invoice_sats" bigint DEFAULT 1000 NOT NULL,
	"max_session_sats" bigint DEFAULT 5000 NOT NULL,
	"max_hot_wallet_sats" bigint DEFAULT 10000 NOT NULL,
	"offline_fallback_ready" boolean DEFAULT false NOT NULL,
	"armed_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"stop_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mainnet_demo_operator_hash_shape" CHECK ("mainnet_demo_runs"."operator_ref_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "mainnet_demo_fixed_limits" CHECK ("mainnet_demo_runs"."max_invoice_sats" = 1000 and "mainnet_demo_runs"."max_session_sats" = 5000 and "mainnet_demo_runs"."max_hot_wallet_sats" = 10000),
	CONSTRAINT "mainnet_demo_armed_timestamp" CHECK ("mainnet_demo_runs"."status" not in ('ARMED'::mainnet_demo_status, 'ACTIVE'::mainnet_demo_status, 'COMPLETED'::mainnet_demo_status) or "mainnet_demo_runs"."armed_at" is not null),
	CONSTRAINT "mainnet_demo_active_timestamp" CHECK ("mainnet_demo_runs"."status" not in ('ACTIVE'::mainnet_demo_status, 'COMPLETED'::mainnet_demo_status) or "mainnet_demo_runs"."activated_at" is not null),
	CONSTRAINT "mainnet_demo_terminal_timestamp" CHECK ("mainnet_demo_runs"."status" not in ('COMPLETED'::mainnet_demo_status, 'STOPPED'::mainnet_demo_status, 'ABORTED'::mainnet_demo_status) or ("mainnet_demo_runs"."stopped_at" is not null and length("mainnet_demo_runs"."stop_reason") >= 5))
);
--> statement-breakpoint
ALTER TABLE "mainnet_circuit_breaker_events" ADD CONSTRAINT "mainnet_circuit_breaker_events_demo_run_id_mainnet_demo_runs_id_fk" FOREIGN KEY ("demo_run_id") REFERENCES "public"."mainnet_demo_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mainnet_demo_approvals" ADD CONSTRAINT "mainnet_demo_approvals_demo_run_id_mainnet_demo_runs_id_fk" FOREIGN KEY ("demo_run_id") REFERENCES "public"."mainnet_demo_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mainnet_demo_runs" ADD CONSTRAINT "mainnet_demo_runs_id_mainnet_sessions_id_fk" FOREIGN KEY ("id") REFERENCES "public"."mainnet_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mainnet_demo_runs" ADD CONSTRAINT "mainnet_demo_runs_readiness_audit_id_mainnet_readiness_audits_id_fk" FOREIGN KEY ("readiness_audit_id") REFERENCES "public"."mainnet_readiness_audits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mainnet_circuit_breaker_run_idx" ON "mainnet_circuit_breaker_events" USING btree ("demo_run_id","triggered_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_mainnet_circuit_breaker_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'mainnet circuit breaker events are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER mainnet_circuit_breaker_events_immutable
BEFORE UPDATE OR DELETE ON mainnet_circuit_breaker_events
FOR EACH ROW EXECUTE FUNCTION prevent_mainnet_circuit_breaker_mutation();
