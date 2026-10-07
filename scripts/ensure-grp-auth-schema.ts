import { existsSync } from "node:fs";
import postgres from "postgres";

async function main() {
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

    await sql`
      INSERT INTO "markets"
        ("id", "slug", "name", "geography_code", "status", "operator_name", "settlement_asset", "rules_version", "protocol_fee_bps")
      VALUES
        ('market_erh_br_v1', 'elas-recebem-hoje', 'Elas Recebem Hoje', 'BR', 'ACTIVE', 'Elas Recebem Hoje', 'USDC', 'erh-v1', 50),
        ('market_grp_direct_v1', 'grp-direct', 'GRP Direct', 'GLOBAL', 'SANDBOX', 'GRP', 'USDC', 'grp-v1', 50)
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "status" = EXCLUDED."status",
        "protocol_fee_bps" = EXCLUDED."protocol_fee_bps",
        "updated_at" = now()
    `;

    await sql`
      UPDATE "receivables"
      SET "market_id" = 'market_erh_br_v1'
      WHERE "market_id" IS NULL
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
    console.log("- markets: ERH + GRP Direct seeded");
    console.log("- receivables.market_id: backfilled");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
