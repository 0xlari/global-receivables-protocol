import { z } from "zod";

export const hex64Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const nostrSignatureSchema = z.string().regex(/^[a-f0-9]{128}$/);
export const opaqueIdSchema = z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const unixTimestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const unsignedIntegerStringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const positiveIntegerStringSchema = unsignedIntegerStringSchema.refine((value) => BigInt(value) > 0n, "must be positive");
export const basisPointsSchema = z.number().int().min(0).max(10_000);
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
export const currencyCodeSchema = z.string().regex(/^[A-Z0-9]{3,12}$/);
export const safePublicTextSchema = z.string().trim().min(1).max(160);
export const wssRelaySchema = z.string().url().refine((value) => value.startsWith("wss://"), "relay must use wss");

export const protocolEventTypes = [
  "ProtocolDefinition",
  "ReceivableCreated",
  "PayerCommitmentProof",
  "ClientValidationDecision",
  "NwcAuthorizationAttestation",
  "PoolCreated",
  "PoolTransition",
] as const;

export const protocolEventTypeSchema = z.enum(protocolEventTypes);

export const protocolUnsignedEventSchema = z.object({
  kind: z.number().int(),
  created_at: unixTimestampSchema,
  tags: z.array(z.array(z.string().max(512)).min(2).max(8)).max(64),
  content: z.string().max(32_768),
}).strict();

export const protocolSignedEventSchema = protocolUnsignedEventSchema.extend({
  id: hex64Schema,
  pubkey: hex64Schema,
  sig: nostrSignatureSchema,
}).strict();

export type ProtocolUnsignedEvent = z.infer<typeof protocolUnsignedEventSchema>;
export type ProtocolSignedEvent = z.infer<typeof protocolSignedEventSchema>;
