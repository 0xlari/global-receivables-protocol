CREATE TABLE "mainnet_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"requested_amount_sats" bigint DEFAULT 0 NOT NULL,
	"max_amount_sats" bigint DEFAULT 5000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mainnet_sessions_fixed_max" CHECK ("mainnet_sessions"."max_amount_sats" = 5000),
	CONSTRAINT "mainnet_sessions_amount_within_limit" CHECK ("mainnet_sessions"."requested_amount_sats" >= 0 and "mainnet_sessions"."requested_amount_sats" <= "mainnet_sessions"."max_amount_sats")
);
--> statement-breakpoint
ALTER TABLE "external_payment_requests" DROP CONSTRAINT "external_payment_requests_amount_positive";--> statement-breakpoint
ALTER TABLE "external_payment_requests" ADD CONSTRAINT "external_payment_requests_session_id_mainnet_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mainnet_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_payment_requests" ADD CONSTRAINT "external_payment_requests_amount_positive" CHECK ("external_payment_requests"."expected_amount" > 0 and "external_payment_requests"."expected_amount" <= 1000);