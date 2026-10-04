CREATE TABLE "lrp_pool_originations" (
	"id" text PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"pool_id" text NOT NULL,
	"requester_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'TERMS_READY' NOT NULL,
	"provider_pubkey" text,
	"terms_payload" jsonb NOT NULL,
	"terms_hash" text NOT NULL,
	"consented_at" timestamp with time zone,
	"candidate_event" jsonb,
	"signed_event" jsonb,
	"public_event_id" text,
	"divergences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"canonical_source" "lrp_canonical_source" DEFAULT 'LEGACY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lrp_pool_originations_receivable_id_unique" UNIQUE("receivable_id"),
	CONSTRAINT "lrp_pool_originations_pool_id_unique" UNIQUE("pool_id"),
	CONSTRAINT "lrp_pool_originations_public_event_id_unique" UNIQUE("public_event_id"),
	CONSTRAINT "lrp_pool_originations_mode" CHECK ("lrp_pool_originations"."mode" in ('SHADOW', 'LRP')),
	CONSTRAINT "lrp_pool_originations_status" CHECK ("lrp_pool_originations"."status" in ('TERMS_READY', 'CANDIDATE_READY', 'SHADOW_VALIDATED', 'PUBLICATION_PENDING', 'PUBLISHED', 'PROJECTION_PENDING')),
	CONSTRAINT "lrp_pool_originations_pubkey_shape" CHECK ("lrp_pool_originations"."provider_pubkey" is null or "lrp_pool_originations"."provider_pubkey" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lrp_pool_originations_terms_hash_shape" CHECK ("lrp_pool_originations"."terms_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lrp_pool_originations_event_shape" CHECK ("lrp_pool_originations"."public_event_id" is null or "lrp_pool_originations"."public_event_id" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "lrp_pool_originations" ADD CONSTRAINT "lrp_pool_originations_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lrp_pool_originations" ADD CONSTRAINT "lrp_pool_originations_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lrp_pool_originations" ADD CONSTRAINT "lrp_pool_originations_public_event_id_lrp_public_events_event_id_fk" FOREIGN KEY ("public_event_id") REFERENCES "public"."lrp_public_events"("event_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "lrp_pool_originations_requester_idx" ON "lrp_pool_originations" USING btree ("requester_id","status");
