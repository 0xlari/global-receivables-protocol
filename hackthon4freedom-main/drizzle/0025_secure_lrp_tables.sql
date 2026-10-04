-- LRP v0.1 data classification:
-- Private: payer_payment_authorizations, nwc_connections,
-- protocol_nwc_authorizations, lrp_receivable_originations,
-- lrp_originator_events, lrp_pool_originations.
-- Operational: scheduled_payment_attempts, lrp_publication_attempts,
-- lrp_entity_links, lrp_projection_runs.
-- Public projections served only by the application API: lrp_public_events,
-- lrp_receivable_projections, lrp_pool_projections.

ALTER TABLE "payer_payment_authorizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "nwc_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "scheduled_payment_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "protocol_nwc_authorizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lrp_public_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lrp_publication_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lrp_entity_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lrp_receivable_projections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lrp_pool_projections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lrp_projection_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lrp_receivable_originations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lrp_originator_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lrp_pool_originations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE
	"payer_payment_authorizations",
	"nwc_connections",
	"scheduled_payment_attempts",
	"protocol_nwc_authorizations",
	"lrp_public_events",
	"lrp_publication_attempts",
	"lrp_entity_links",
	"lrp_receivable_projections",
	"lrp_pool_projections",
	"lrp_projection_runs",
	"lrp_receivable_originations",
	"lrp_originator_events",
	"lrp_pool_originations"
FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE
	data_api_role text;
	protected_tables constant text :=
		'"payer_payment_authorizations", "nwc_connections", "scheduled_payment_attempts", '
		'"protocol_nwc_authorizations", "lrp_public_events", "lrp_publication_attempts", '
		'"lrp_entity_links", "lrp_receivable_projections", "lrp_pool_projections", '
		'"lrp_projection_runs", "lrp_receivable_originations", "lrp_originator_events", '
		'"lrp_pool_originations"';
BEGIN
	FOREACH data_api_role IN ARRAY ARRAY['anon', 'authenticated']
	LOOP
		IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role) THEN
			EXECUTE format(
				'REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
				protected_tables,
				data_api_role
			);
			EXECUTE format(
				'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
				data_api_role
			);
			EXECUTE format(
				'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
				data_api_role
			);
		END IF;
	END LOOP;

	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
		EXECUTE format(
			'REVOKE ALL PRIVILEGES ON TABLE %s FROM service_role',
			protected_tables
		);
		EXECUTE format(
			'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO service_role',
			protected_tables
		);
		EXECUTE
			'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM service_role';
		EXECUTE
			'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role';
		EXECUTE
			'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM service_role';
		EXECUTE
			'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role';
	END IF;
END
$$;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
	REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
	REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
