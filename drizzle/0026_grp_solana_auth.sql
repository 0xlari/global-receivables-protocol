ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "solana_wallet" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_solana_wallet_unique" ON "users" ("solana_wallet");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solana_auth_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE restrict,
  "wallet" text NOT NULL,
  "nonce_hash" text NOT NULL,
  "message" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "solana_auth_challenges_nonce_shape" CHECK ("nonce_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "solana_auth_challenges_nonce_hash_unique" ON "solana_auth_challenges" ("nonce_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "solana_auth_challenges_wallet_idx" ON "solana_auth_challenges" ("wallet");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "solana_auth_challenges_user_idx" ON "solana_auth_challenges" ("user_id");
