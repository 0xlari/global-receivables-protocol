import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

import * as schema from "./schema";

const databaseUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => url.startsWith("postgres://") || url.startsWith("postgresql://"),
    "DATABASE_URL precisa usar postgres:// ou postgresql://.",
  );

export type AppDatabase = ReturnType<typeof createDatabase>["db"];

export function createDatabase(databaseUrl: string) {
  const url = databaseUrlSchema.parse(databaseUrl);
  const client = postgres(url, {
    max: 10,
    prepare: false,
  });
  const db = drizzle({ client, schema });

  return {
    client,
    db,
    close: () => client.end(),
  };
}

export function databaseFromEnvironment() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL não configurada.");
  }

  return createDatabase(databaseUrl);
}
