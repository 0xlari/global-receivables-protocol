CREATE TABLE "app_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "app_sessions_token_hash_shape" CHECK ("app_sessions"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "lnurl_auth_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"k1_hash" text NOT NULL,
	"poll_token_hash" text NOT NULL,
	"callback_url" text NOT NULL,
	"callback_domain" text NOT NULL,
	"user_id" text,
	"linking_key_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"authenticated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lnurl_auth_challenges_k1_hash_unique" UNIQUE("k1_hash"),
	CONSTRAINT "lnurl_auth_challenges_poll_token_hash_unique" UNIQUE("poll_token_hash"),
	CONSTRAINT "lnurl_auth_challenges_k1_hash_shape" CHECK ("lnurl_auth_challenges"."k1_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lnurl_auth_challenges_poll_hash_shape" CHECK ("lnurl_auth_challenges"."poll_token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "wallet_authenticators" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"domain" text NOT NULL,
	"linking_key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_authenticators_key_hash_shape" CHECK ("wallet_authenticators"."linking_key_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reputation_id" uuid;--> statement-breakpoint
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lnurl_auth_challenges" ADD CONSTRAINT "lnurl_auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_authenticators" ADD CONSTRAINT "wallet_authenticators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_sessions_user_idx" ON "app_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lnurl_auth_challenges_expiry_idx" ON "lnurl_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_authenticators_domain_key_unique" ON "wallet_authenticators" USING btree ("domain","linking_key_hash");--> statement-breakpoint
CREATE INDEX "wallet_authenticators_user_idx" ON "wallet_authenticators" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_reputation_id_unique" UNIQUE("reputation_id");