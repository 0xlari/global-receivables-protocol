CREATE TABLE "protocol_nwc_authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"receivable_event_id" text NOT NULL,
	"client_pubkey" text NOT NULL,
	"wallet_service_pubkey" text NOT NULL,
	"encrypted_connection_uri" text NOT NULL,
	"safe_fingerprint" text NOT NULL,
	"max_amount_msat" bigint NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_validated_at" timestamp with time zone NOT NULL,
	"attestation_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protocol_nwc_authorizations_receivable_shape" CHECK ("protocol_nwc_authorizations"."receivable_event_id" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "protocol_nwc_authorizations_client_shape" CHECK ("protocol_nwc_authorizations"."client_pubkey" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "protocol_nwc_authorizations_wallet_shape" CHECK ("protocol_nwc_authorizations"."wallet_service_pubkey" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "protocol_nwc_authorizations_fingerprint_shape" CHECK ("protocol_nwc_authorizations"."safe_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "protocol_nwc_authorizations_amount_positive" CHECK ("protocol_nwc_authorizations"."max_amount_msat" > 0),
	CONSTRAINT "protocol_nwc_authorizations_expiry" CHECK ("protocol_nwc_authorizations"."expires_at" > "protocol_nwc_authorizations"."due_at")
);--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_nwc_authorizations_receivable_client_unique" ON "protocol_nwc_authorizations" USING btree ("receivable_event_id","client_pubkey");--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_nwc_authorizations_attestation_unique" ON "protocol_nwc_authorizations" USING btree ("attestation_event_id");
