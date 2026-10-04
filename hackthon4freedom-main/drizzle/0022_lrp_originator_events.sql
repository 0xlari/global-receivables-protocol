CREATE TABLE "lrp_originator_events" (
	"id" text PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"event_type" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'PRIVATE_RECORDED' NOT NULL,
	"originator_pubkey" text,
	"private_record_id" text NOT NULL,
	"private_payload_hash" text NOT NULL,
	"candidate_event" jsonb,
	"signed_event" jsonb,
	"public_event_id" text,
	"divergences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"canonical_source" "lrp_canonical_source" DEFAULT 'LEGACY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lrp_originator_events_public_event_id_unique" UNIQUE("public_event_id"),
	CONSTRAINT "lrp_originator_events_type" CHECK ("lrp_originator_events"."event_type" in ('PayerCommitmentProof', 'ClientValidationDecision', 'NwcAuthorizationAttestation')),
	CONSTRAINT "lrp_originator_events_mode" CHECK ("lrp_originator_events"."mode" in ('SHADOW', 'LRP')),
	CONSTRAINT "lrp_originator_events_status" CHECK ("lrp_originator_events"."status" in ('PRIVATE_RECORDED', 'CANDIDATE_READY', 'SHADOW_VALIDATED', 'PUBLICATION_PENDING', 'PUBLISHED', 'PROJECTION_PENDING')),
	CONSTRAINT "lrp_originator_events_pubkey_shape" CHECK ("lrp_originator_events"."originator_pubkey" is null or "lrp_originator_events"."originator_pubkey" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lrp_originator_events_private_hash_shape" CHECK ("lrp_originator_events"."private_payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lrp_originator_events_public_event_shape" CHECK ("lrp_originator_events"."public_event_id" is null or "lrp_originator_events"."public_event_id" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "lrp_originator_events" ADD CONSTRAINT "lrp_originator_events_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lrp_originator_events" ADD CONSTRAINT "lrp_originator_events_public_event_id_lrp_public_events_event_id_fk" FOREIGN KEY ("public_event_id") REFERENCES "public"."lrp_public_events"("event_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "lrp_originator_events_receivable_type_unique" ON "lrp_originator_events" USING btree ("receivable_id","event_type");
--> statement-breakpoint
CREATE INDEX "lrp_originator_events_status_idx" ON "lrp_originator_events" USING btree ("event_type","status");
