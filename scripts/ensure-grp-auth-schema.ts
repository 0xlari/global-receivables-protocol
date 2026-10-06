import { existsSync } from "node:fs";
import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada em .env.local");
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
});

try {
  await sql`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "solana_wallet" text
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "users_solana_wallet_unique"
    ON "users" ("solana_wallet")
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "solana_auth_challenges" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text REFERENCES "users"("id") ON DELETE restrict,
      "wallet" text NOT NULL,
      "nonce_hash" text NOT NULL,
      "message" text NOT NULL,
      "expires_at" timestamp with time zone NOT NULL,
      "used_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "solana_auth_challenges_nonce_shape"
        CHECK ("nonce_hash" ~ '^[a-f0-9]{64}$')
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "solana_auth_challenges_nonce_hash_unique"
    ON "solana_auth_challenges" ("nonce_hash")
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "solana_auth_challenges_wallet_idx"
    ON "solana_auth_challenges" ("wallet")
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "solana_auth_challenges_user_idx"
    ON "solana_auth_challenges" ("user_id")
  `;

  const [table] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'solana_auth_challenges'
    ) AS "exists"
  `;

  const [column] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'solana_wallet'
    ) AS "exists"
  `;

  if (!table?.exists || !column?.exists) {
    throw new Error("GRP auth schema verification failed");
  }

  console.log("GRP auth schema ready.");
  console.log("- users.solana_wallet: OK");
  console.log("- solana_auth_challenges: OK");
} finally {
  await sql.end();
}
