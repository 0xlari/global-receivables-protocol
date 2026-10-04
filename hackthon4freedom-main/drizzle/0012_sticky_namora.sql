CREATE TYPE "public"."nostr_attestation_status" AS ENUM('SIGNED', 'PUBLISHED', 'CORRECTED');--> statement-breakpoint
CREATE TYPE "public"."nostr_relay_status" AS ENUM('PENDING', 'ACKNOWLEDGED', 'FAILED');--> statement-breakpoint
CREATE TABLE "nostr_attestations" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_user_id" text NOT NULL,
	"semantic_key" text NOT NULL,
	"assertion" text NOT NULL,
	"operation_ref" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"event_id" text NOT NULL,
	"signed_event" jsonb NOT NULL,
	"correction_of_id" text,
	"status" "nostr_attestation_status" DEFAULT 'SIGNED' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nostr_attestations_semantic_key_unique" UNIQUE("semantic_key"),
	CONSTRAINT "nostr_attestations_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "nostr_attestations_operation_ref_shape" CHECK ("nostr_attestations"."operation_ref" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "nostr_attestations_evidence_hash_shape" CHECK ("nostr_attestations"."evidence_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "nostr_attestations_event_id_shape" CHECK ("nostr_attestations"."event_id" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "nostr_auth_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"pubkey" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"request_url" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nostr_auth_challenges_nonce_hash_unique" UNIQUE("nonce_hash"),
	CONSTRAINT "nostr_auth_challenges_pubkey_shape" CHECK ("nostr_auth_challenges"."pubkey" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "nostr_auth_challenges_nonce_shape" CHECK ("nostr_auth_challenges"."nonce_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "nostr_relay_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"attestation_id" text NOT NULL,
	"relay_url" text NOT NULL,
	"status" "nostr_relay_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"acknowledged_at" timestamp with time zone,
	"observed_event_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nostr_relay_publications_attempts_non_negative" CHECK ("nostr_relay_publications"."attempts" >= 0),
	CONSTRAINT "nostr_relay_publications_observed_hash_shape" CHECK ("nostr_relay_publications"."observed_event_hash" is null or "nostr_relay_publications"."observed_event_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "nostr_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nostr_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "nostr_sessions_token_shape" CHECK ("nostr_sessions"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "nostr_attestations" ADD CONSTRAINT "nostr_attestations_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nostr_relay_publications" ADD CONSTRAINT "nostr_relay_publications_attestation_id_nostr_attestations_id_fk" FOREIGN KEY ("attestation_id") REFERENCES "public"."nostr_attestations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nostr_sessions" ADD CONSTRAINT "nostr_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nostr_attestations_subject_idx" ON "nostr_attestations" USING btree ("subject_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "nostr_auth_challenges_pubkey_idx" ON "nostr_auth_challenges" USING btree ("pubkey");--> statement-breakpoint
CREATE UNIQUE INDEX "nostr_relay_publications_target_unique" ON "nostr_relay_publications" USING btree ("attestation_id","relay_url");--> statement-breakpoint
CREATE INDEX "nostr_sessions_user_idx" ON "nostr_sessions" USING btree ("user_id");