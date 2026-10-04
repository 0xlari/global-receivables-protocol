CREATE TYPE "public"."payer_payment_method" AS ENUM('NWC_AUTOMATIC', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."payer_payment_authorization_status" AS ENUM('PENDING_CONNECTION', 'ACTIVE', 'INVALID', 'REVOKED', 'EXPIRED', 'PAYMENT_PENDING', 'PAID', 'FAILED', 'MANUAL_PAYMENT_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."nwc_connection_status" AS ENUM('ACTIVE', 'INVALID', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."scheduled_payment_attempt_status" AS ENUM('SCHEDULED', 'INVOICE_CREATED', 'REQUEST_SENT', 'PENDING', 'SETTLED', 'FAILED', 'UNKNOWN', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "payer_payment_authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" uuid NOT NULL,
	"receivable_id" text NOT NULL,
	"payer_id" text NOT NULL,
	"confirmation_id" text NOT NULL,
	"management_token_hash" text NOT NULL,
	"method" "payer_payment_method" NOT NULL,
	"status" "payer_payment_authorization_status" NOT NULL,
	"max_amount_msat" bigint NOT NULL,
	"max_fee_msat" bigint NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"single_use" boolean DEFAULT true NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payer_payment_authorizations_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "payer_payment_authorizations_management_token_hash_unique" UNIQUE("management_token_hash"),
	CONSTRAINT "payer_payment_authorizations_amount_positive" CHECK ("payer_payment_authorizations"."max_amount_msat" > 0),
	CONSTRAINT "payer_payment_authorizations_fee_non_negative" CHECK ("payer_payment_authorizations"."max_fee_msat" >= 0),
	CONSTRAINT "payer_payment_authorizations_expiry" CHECK ("payer_payment_authorizations"."expires_at" > "payer_payment_authorizations"."scheduled_for"),
	CONSTRAINT "payer_payment_authorizations_single_use" CHECK ("payer_payment_authorizations"."single_use" is true),
	CONSTRAINT "payer_payment_authorizations_token_hash" CHECK ("payer_payment_authorizations"."management_token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "payer_payment_authorizations_manual_state" CHECK ("payer_payment_authorizations"."method" <> 'MANUAL'::payer_payment_method or "payer_payment_authorizations"."status" = 'MANUAL_PAYMENT_REQUIRED'::payer_payment_authorization_status)
);--> statement-breakpoint
CREATE TABLE "nwc_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"authorization_id" text NOT NULL,
	"wallet_service_pubkey" text NOT NULL,
	"relay_urls" jsonb NOT NULL,
	"encrypted_connection_secret" text NOT NULL,
	"connection_fingerprint" text NOT NULL,
	"supported_methods" jsonb NOT NULL,
	"last_checked_at" timestamp with time zone NOT NULL,
	"connection_status" "nwc_connection_status" DEFAULT 'ACTIVE' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nwc_connections_authorization_id_unique" UNIQUE("authorization_id"),
	CONSTRAINT "nwc_connections_connection_fingerprint_unique" UNIQUE("connection_fingerprint"),
	CONSTRAINT "nwc_connections_pubkey_shape" CHECK ("nwc_connections"."wallet_service_pubkey" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "nwc_connections_fingerprint_shape" CHECK ("nwc_connections"."connection_fingerprint" ~ '^[a-f0-9]{64}$')
);--> statement-breakpoint
CREATE TABLE "scheduled_payment_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"authorization_id" text NOT NULL,
	"invoice_id" text,
	"invoice_reference" text,
	"invoice_payment_hash" text,
	"idempotency_key" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"attempted_at" timestamp with time zone,
	"status" "scheduled_payment_attempt_status" DEFAULT 'SCHEDULED' NOT NULL,
	"nwc_request_event_id" text,
	"nwc_response_event_id" text,
	"failure_code" text,
	"failure_reason_safe" text,
	"fees_paid_msat" bigint,
	"preimage_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_payment_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "scheduled_payment_attempts_fees_non_negative" CHECK ("scheduled_payment_attempts"."fees_paid_msat" is null or "scheduled_payment_attempts"."fees_paid_msat" >= 0),
	CONSTRAINT "scheduled_payment_attempts_preimage_hash" CHECK ("scheduled_payment_attempts"."preimage_hash" is null or "scheduled_payment_attempts"."preimage_hash" ~ '^[a-f0-9]{64}$')
);--> statement-breakpoint
ALTER TABLE "payer_payment_authorizations" ADD CONSTRAINT "payer_payment_authorizations_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_payment_authorizations" ADD CONSTRAINT "payer_payment_authorizations_payer_id_clients_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_payment_authorizations" ADD CONSTRAINT "payer_payment_authorizations_confirmation_id_client_confirmations_id_fk" FOREIGN KEY ("confirmation_id") REFERENCES "public"."client_confirmations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nwc_connections" ADD CONSTRAINT "nwc_connections_authorization_id_payer_payment_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."payer_payment_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payment_attempts" ADD CONSTRAINT "scheduled_payment_attempts_authorization_id_payer_payment_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."payer_payment_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payer_payment_authorizations_one_per_receivable" ON "payer_payment_authorizations" USING btree ("receivable_id");--> statement-breakpoint
CREATE INDEX "payer_payment_authorizations_due_idx" ON "payer_payment_authorizations" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_payment_attempts_one_per_authorization" ON "scheduled_payment_attempts" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "scheduled_payment_attempts_due_idx" ON "scheduled_payment_attempts" USING btree ("status","scheduled_for");
