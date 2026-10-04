import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

const confirmationTokenSchema = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export function generateConfirmationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashConfirmationToken(rawToken: string) {
  const token = confirmationTokenSchema.parse(rawToken);
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildConfirmationUrl(baseUrl: string, rawToken: string) {
  const url = new URL("/confirmar", baseUrl);
  url.hash = confirmationTokenSchema.parse(rawToken);
  return url.toString();
}

export function isConfirmationTokenShape(value: unknown): value is string {
  return confirmationTokenSchema.safeParse(value).success;
}
