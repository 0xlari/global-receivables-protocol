CREATE TYPE "public"."lrp_canonical_source" AS ENUM('LEGACY', 'LRP');--> statement-breakpoint
CREATE TYPE "public"."lrp_publication_status" AS ENUM('PENDING', 'CONFIRMED', 'INSUFFICIENT_ACKS', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."lrp_projection_run_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "lrp_public_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"kind" integer NOT NULL,
	"pubkey" text NOT NULL,
	"event_created_at" integer NOT NULL,
	"tags" jsonb NOT NULL,
	"content" text NOT NULL,
	"signature" text NOT NULL,
	"observed_relays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lrp_public_events_id_shape" CHECK ("lrp_public_events"."event_id" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lrp_public_events_pubkey_shape" CHECK ("lrp_public_events"."pubkey" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lrp_public_events_signature_shape" CHECK ("lrp_public_events"."signature" ~ '^[a-f0-9]{128}$'),
	CONSTRAINT "lrp_public_events_kind_range" CHECK ("lrp_public_events"."kind" between 8100 and 8114)
);--> statement-breakpoint
CREATE TABLE "lrp_publication_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"entity_type" text NOT NULL,
	"private_entity_id" text NOT NULL,
	"event_id" text NOT NULL,
	"status" "lrp_publication_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"acknowledged_relays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejected_relays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timed_out_relays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lrp_publication_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "lrp_publication_attempts_entity_type" CHECK ("lrp_publication_attempts"."entity_type" in ('RECEIVABLE', 'POOL', 'ORIGINATOR_FACT')),
	CONSTRAINT "lrp_publication_attempts_count_non_negative" CHECK ("lrp_publication_attempts"."attempt_count" >= 0)
);--> statement-breakpoint
CREATE TABLE "lrp_entity_links" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"private_entity_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text NOT NULL,
	"canonical_source" "lrp_canonical_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lrp_entity_links_entity_type" CHECK ("lrp_entity_links"."entity_type" in ('RECEIVABLE', 'POOL'))
);--> statement-breakpoint
CREATE TABLE "lrp_receivable_projections" (
	"receivable_event_id" text PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"provider_pubkey" text NOT NULL,
	"projection" jsonb NOT NULL,
	"projected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lrp_receivable_projections_provider_shape" CHECK ("lrp_receivable_projections"."provider_pubkey" ~ '^[a-f0-9]{64}$')
);--> statement-breakpoint
CREATE TABLE "lrp_pool_projections" (
	"pool_event_id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"provider_pubkey" text NOT NULL,
	"originator_pubkey" text NOT NULL,
	"state" text NOT NULL,
	"latest_event_id" text NOT NULL,
	"progress_bps" integer DEFAULT 0 NOT NULL,
	"projection" jsonb NOT NULL,
	"projected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lrp_pool_projections_provider_shape" CHECK ("lrp_pool_projections"."provider_pubkey" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lrp_pool_projections_originator_shape" CHECK ("lrp_pool_projections"."originator_pubkey" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lrp_pool_projections_latest_event_shape" CHECK ("lrp_pool_projections"."latest_event_id" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lrp_pool_projections_progress_range" CHECK ("lrp_pool_projections"."progress_bps" between 0 and 10000)
);--> statement-breakpoint
CREATE TABLE "lrp_projection_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "lrp_projection_run_status" DEFAULT 'RUNNING' NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"receivable_count" integer DEFAULT 0 NOT NULL,
	"pool_count" integer DEFAULT 0 NOT NULL,
	"inconsistencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "lrp_projection_runs_counts_non_negative" CHECK ("lrp_projection_runs"."event_count" >= 0 and "lrp_projection_runs"."receivable_count" >= 0 and "lrp_projection_runs"."pool_count" >= 0)
);--> statement-breakpoint
ALTER TABLE "lrp_publication_attempts" ADD CONSTRAINT "lrp_publication_attempts_event_id_lrp_public_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."lrp_public_events"("event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lrp_entity_links" ADD CONSTRAINT "lrp_entity_links_event_id_lrp_public_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."lrp_public_events"("event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lrp_receivable_projections" ADD CONSTRAINT "lrp_receivable_projections_receivable_event_id_lrp_public_events_event_id_fk" FOREIGN KEY ("receivable_event_id") REFERENCES "public"."lrp_public_events"("event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lrp_pool_projections" ADD CONSTRAINT "lrp_pool_projections_pool_event_id_lrp_public_events_event_id_fk" FOREIGN KEY ("pool_event_id") REFERENCES "public"."lrp_public_events"("event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lrp_public_events_kind_created_idx" ON "lrp_public_events" USING btree ("kind","event_created_at");--> statement-breakpoint
CREATE INDEX "lrp_publication_attempts_entity_idx" ON "lrp_publication_attempts" USING btree ("entity_type","private_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lrp_entity_links_private_event_type_unique" ON "lrp_entity_links" USING btree ("entity_type","private_entity_id","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "lrp_entity_links_event_unique" ON "lrp_entity_links" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lrp_receivable_projections_public_id_unique" ON "lrp_receivable_projections" USING btree ("receivable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lrp_pool_projections_public_id_unique" ON "lrp_pool_projections" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "lrp_pool_projections_state_idx" ON "lrp_pool_projections" USING btree ("state");
