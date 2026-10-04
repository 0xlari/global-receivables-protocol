import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { assets } from "@/domain/money";
import { paymentPurposes } from "@/domain/receivable";
import {
  contributionStatuses,
  poolStatuses,
  receivableStatuses,
  validationStatuses,
} from "@/domain/state-machine";
import {
  nwcConnectionStatuses,
  payerPaymentAuthorizationStatuses,
  payerPaymentMethods,
  scheduledPaymentAttemptStatuses,
} from "@/domain/payer-payment";

export const assetCode = pgEnum("asset_code", assets);
export const receivableStatus = pgEnum(
  "receivable_status",
  receivableStatuses,
);
export const poolStatus = pgEnum("pool_status", poolStatuses);
export const contributionStatus = pgEnum(
  "contribution_status",
  contributionStatuses,
);
export const validationStatus = pgEnum("validation_status", validationStatuses);
export const poolMode = pgEnum("pool_mode", ["FULL_BTC", "USD_PAIRED"]);
export const paymentPurpose = pgEnum("payment_purpose", paymentPurposes);
export const poolRiskBand = pgEnum("pool_risk_band", ["LOW", "MEDIUM", "HIGH"]);
export const financialEnvironment = pgEnum("financial_environment", ["SIMULATION", "TESTNET", "MAINNET"]);
export const externalPaymentPurpose = pgEnum("external_payment_purpose", [
  "CONTRIBUTION",
  "PAYER_SETTLEMENT",
  "REQUESTER_DISBURSEMENT",
  "REFUND",
]);
export const externalPaymentStatus = pgEnum("external_payment_status", [
  "PREPARING",
  "PENDING",
  "SETTLED",
  "EXPIRED",
  "FAILED",
  "UNKNOWN",
]);
export const externalSwapDirection = pgEnum("external_swap_direction", [
  "L_BTC_TO_USDT",
  "USDT_TO_L_BTC",
]);
export const externalSwapStatus = pgEnum("external_swap_status", [
  "PREPARED",
  "EXECUTING",
  "COMPLETE",
  "FAILED",
  "UNKNOWN",
]);
export const reconciliationStatus = pgEnum("reconciliation_status", [
  "MATCHED",
  "DIVERGED",
  "FAILED",
]);
export const mainnetReadinessStatus = pgEnum("mainnet_readiness_status", [
  "GO",
  "NO_GO",
]);
export const mainnetDemoStatus = pgEnum("mainnet_demo_status", [
  "DRAFT",
  "ARMED",
  "ACTIVE",
  "COMPLETED",
  "STOPPED",
  "ABORTED",
]);
export const partialPoolDecision = pgEnum("partial_pool_decision", [
  "ACCEPT_PARTIAL",
  "REFUND",
]);
export const userStatus = pgEnum("user_status", [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
]);
export const ledgerTransactionStatus = pgEnum("ledger_transaction_status", [
  "PENDING",
  "POSTED",
  "REVERSED",
]);
export const identityEvidenceType = pgEnum("identity_evidence_type", [
  "IDENTITY",
  "PROFESSIONAL_ACCOUNT",
]);
export const evidenceStatus = pgEnum("evidence_status", [
  "PENDING",
  "VERIFIED",
  "REVOKED",
  "EXPIRED",
]);
export const consentType = pgEnum("consent_type", [
  "IDENTITY_PROCESSING",
  "PROFESSIONAL_ACCOUNT",
]);
export const collateralStatus = pgEnum("collateral_status", [
  "PROPOSED",
  "ACTIVE",
  "RELEASED",
  "REVOKED",
  "EXPIRED",
]);
export const collateralEnvironment = pgEnum("collateral_environment", [
  "SIMULATION",
]);
export const reputationSubjectType = pgEnum("reputation_subject_type", [
  "USER",
  "CLIENT",
]);
export const reputationFactType = pgEnum("reputation_fact_type", [
  "RECEIVABLE_PAID",
  "RECEIVABLE_DEFAULTED",
  "CLIENT_PAID",
  "CLIENT_DEFAULTED",
]);
export const reputationFactStatus = pgEnum("reputation_fact_status", [
  "ACTIVE",
  "REVOKED",
  "EXPIRED",
]);
export const receivableEvidenceScanStatus = pgEnum(
  "receivable_evidence_scan_status",
  ["PENDING", "CLEAN", "INFECTED", "UNSUPPORTED"],
);
export const clientConfirmationStatus = pgEnum("client_confirmation_status", [
  "PENDING",
  "ACCEPTED",
  "DIVERGED",
  "BTC_REFUSED",
  "EXPIRED",
]);
export const adminReviewDecision = pgEnum("admin_review_decision", [
  "PASSED",
  "FAILED",
]);
export const nostrAttestationStatus = pgEnum("nostr_attestation_status", [
  "SIGNED",
  "PUBLISHED",
  "CORRECTED",
]);
export const nostrRelayStatus = pgEnum("nostr_relay_status", [
  "PENDING",
  "ACKNOWLEDGED",
  "FAILED",
]);
export const payerPaymentMethod = pgEnum("payer_payment_method", payerPaymentMethods);
export const payerPaymentAuthorizationStatus = pgEnum(
  "payer_payment_authorization_status",
  payerPaymentAuthorizationStatuses,
);
export const nwcConnectionStatus = pgEnum("nwc_connection_status", nwcConnectionStatuses);
export const scheduledPaymentAttemptStatus = pgEnum(
  "scheduled_payment_attempt_status",
  scheduledPaymentAttemptStatuses,
);
export const lrpCanonicalSource = pgEnum("lrp_canonical_source", ["LEGACY", "LRP"]);
export const lrpPublicationStatus = pgEnum("lrp_publication_status", [
  "PENDING",
  "CONFIRMED",
  "INSUFFICIENT_ACKS",
  "REJECTED",
]);
export const lrpProjectionRunStatus = pgEnum("lrp_projection_run_status", [
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

const createdAt = timestamp("created_at", {
  mode: "date",
  withTimezone: true,
})
  .notNull()
  .defaultNow();

const updatedAt = timestamp("updated_at", {
  mode: "date",
  withTimezone: true,
})
  .notNull()
  .defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  supabaseAuthUserId: uuid("supabase_auth_user_id").unique(),
  reputationId: uuid("reputation_id").unique(),
  countryCode: text("country_code").notNull(),
  status: userStatus("status").notNull().default("PENDING"),
  nostrPubkey: text("nostr_pubkey").unique(),
  createdAt,
  updatedAt,
});

export const walletAuthenticators = pgTable(
  "wallet_authenticators",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    domain: text("domain").notNull(),
    linkingKeyHash: text("linking_key_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { mode: "date", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("wallet_authenticators_domain_key_unique").on(table.domain, table.linkingKeyHash),
    index("wallet_authenticators_user_idx").on(table.userId),
    check("wallet_authenticators_key_hash_shape", sql`${table.linkingKeyHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const lnurlAuthChallenges = pgTable(
  "lnurl_auth_challenges",
  {
    id: text("id").primaryKey(),
    k1Hash: text("k1_hash").notNull().unique(),
    pollTokenHash: text("poll_token_hash").notNull().unique(),
    callbackUrl: text("callback_url").notNull(),
    callbackDomain: text("callback_domain").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
    linkingKeyHash: text("linking_key_hash"),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    authenticatedAt: timestamp("authenticated_at", { mode: "date", withTimezone: true }),
    completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
    createdAt,
  },
  (table) => [
    index("lnurl_auth_challenges_expiry_idx").on(table.expiresAt),
    check("lnurl_auth_challenges_k1_hash_shape", sql`${table.k1Hash} ~ '^[a-f0-9]{64}$'`),
    check("lnurl_auth_challenges_poll_hash_shape", sql`${table.pollTokenHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const appSessions = pgTable(
  "app_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [
    index("app_sessions_user_idx").on(table.userId),
    check("app_sessions_token_hash_shape", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const nostrAuthChallenges = pgTable(
  "nostr_auth_challenges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
    pubkey: text("pubkey").notNull(),
    nonceHash: text("nonce_hash").notNull().unique(),
    requestUrl: text("request_url").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { mode: "date", withTimezone: true }),
    createdAt,
  },
  (table) => [
    index("nostr_auth_challenges_pubkey_idx").on(table.pubkey),
    index("nostr_auth_challenges_user_idx").on(table.userId),
    check("nostr_auth_challenges_pubkey_shape", sql`${table.pubkey} ~ '^[a-f0-9]{64}$'`),
    check("nostr_auth_challenges_nonce_shape", sql`${table.nonceHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const nostrSessions = pgTable(
  "nostr_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    createdAt,
  },
  (table) => [
    index("nostr_sessions_user_idx").on(table.userId),
    check("nostr_sessions_token_shape", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const nostrAttestations = pgTable(
  "nostr_attestations",
  {
    id: text("id").primaryKey(),
    subjectUserId: text("subject_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    semanticKey: text("semantic_key").notNull().unique(),
    assertion: text("assertion").notNull(),
    operationRef: text("operation_ref").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    eventId: text("event_id").notNull().unique(),
    signedEvent: jsonb("signed_event").notNull(),
    correctionOfId: text("correction_of_id"),
    status: nostrAttestationStatus("status").notNull().default("SIGNED"),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { mode: "date", withTimezone: true }),
    createdAt,
  },
  (table) => [
    index("nostr_attestations_subject_idx").on(table.subjectUserId, table.occurredAt),
    check("nostr_attestations_operation_ref_shape", sql`${table.operationRef} ~ '^[a-f0-9]{64}$'`),
    check("nostr_attestations_evidence_hash_shape", sql`${table.evidenceHash} ~ '^[a-f0-9]{64}$'`),
    check("nostr_attestations_event_id_shape", sql`${table.eventId} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const nostrRelayPublications = pgTable(
  "nostr_relay_publications",
  {
    id: text("id").primaryKey(),
    attestationId: text("attestation_id").notNull().references(() => nostrAttestations.id, { onDelete: "restrict" }),
    relayUrl: text("relay_url").notNull(),
    status: nostrRelayStatus("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    acknowledgedAt: timestamp("acknowledged_at", { mode: "date", withTimezone: true }),
    observedEventHash: text("observed_event_hash"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("nostr_relay_publications_target_unique").on(table.attestationId, table.relayUrl),
    check("nostr_relay_publications_attempts_non_negative", sql`${table.attempts} >= 0`),
    check("nostr_relay_publications_observed_hash_shape", sql`${table.observedEventHash} is null or ${table.observedEventHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  countryCode: text("country_code").notNull(),
  protectedContactRef: text("protected_contact_ref"),
  createdAt,
  updatedAt,
});

export const identityEvidences = pgTable(
  "identity_evidences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: identityEvidenceType("type").notNull(),
    provider: text("provider").notNull(),
    protectedReference: text("protected_reference").notNull(),
    status: evidenceStatus("status").notNull().default("PENDING"),
    verifiedAt: timestamp("verified_at", {
      mode: "date",
      withTimezone: true,
    }),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    revokedAt: timestamp("revoked_at", {
      mode: "date",
      withTimezone: true,
    }),
    details: jsonb("details").notNull().default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("identity_evidences_active_provider_unique")
      .on(table.userId, table.type, table.provider)
      .where(
        sql`${table.status} in ('PENDING'::evidence_status, 'VERIFIED'::evidence_status)`,
      ),
    uniqueIndex("identity_evidences_protected_reference_unique").on(
      table.protectedReference,
    ),
    check(
      "identity_evidences_verified_timestamp",
      sql`${table.status} <> 'VERIFIED'::evidence_status or ${table.verifiedAt} is not null`,
    ),
    check(
      "identity_evidences_revoked_timestamp",
      sql`${table.status} <> 'REVOKED'::evidence_status or ${table.revokedAt} is not null`,
    ),
    index("identity_evidences_user_idx").on(table.userId),
  ],
);

export const consents = pgTable(
  "consents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: consentType("type").notNull(),
    policyVersion: text("policy_version").notNull(),
    grantedAt: timestamp("granted_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp("revoked_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt,
  },
  (table) => [
    uniqueIndex("consents_one_active_per_type")
      .on(table.userId, table.type)
      .where(sql`${table.revokedAt} is null`),
    index("consents_user_idx").on(table.userId),
  ],
);

export const creditLimits = pgTable(
  "credit_limits",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    asset: assetCode("asset").notNull().default("USD_REFERENCE"),
    totalAmount: bigint("total_amount", { mode: "bigint" })
      .notNull()
      .default(sql`10000`),
    usedAmount: bigint("used_amount", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    ruleVersion: text("rule_version").notNull(),
    breakdown: jsonb("breakdown").notNull().default({}),
    version: integer("version").notNull().default(1),
    updatedAt,
  },
  (table) => [
    check(
      "credit_limits_asset_usd_reference",
      sql`${table.asset} = 'USD_REFERENCE'::asset_code`,
    ),
    check("credit_limits_total_non_negative", sql`${table.totalAmount} >= 0`),
    check("credit_limits_used_non_negative", sql`${table.usedAmount} >= 0`),
    check("credit_limits_version_positive", sql`${table.version} > 0`),
  ],
);

export const creditLimitEvents = pgTable(
  "credit_limit_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    ruleVersion: text("rule_version").notNull(),
    reason: text("reason").notNull(),
    previousTotalAmount: bigint("previous_total_amount", {
      mode: "bigint",
    }).notNull(),
    newTotalAmount: bigint("new_total_amount", { mode: "bigint" }).notNull(),
    previousUsedAmount: bigint("previous_used_amount", {
      mode: "bigint",
    }).notNull(),
    newUsedAmount: bigint("new_used_amount", { mode: "bigint" }).notNull(),
    breakdown: jsonb("breakdown").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("credit_limit_events_idempotency_unique").on(
      table.idempotencyKey,
    ),
    index("credit_limit_events_user_idx").on(table.userId, table.createdAt),
    check(
      "credit_limit_events_amounts_non_negative",
      sql`${table.previousTotalAmount} >= 0 and ${table.newTotalAmount} >= 0 and ${table.previousUsedAmount} >= 0 and ${table.newUsedAmount} >= 0`,
    ),
  ],
);

export const collaterals = pgTable(
  "collaterals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    asset: assetCode("asset").notNull(),
    nominalAmount: bigint("nominal_amount", { mode: "bigint" }).notNull(),
    eligibleUsdCents: bigint("eligible_usd_cents", { mode: "bigint" }).notNull(),
    status: collateralStatus("status").notNull().default("PROPOSED"),
    environment: collateralEnvironment("environment")
      .notNull()
      .default("SIMULATION"),
    reference: text("reference").notNull().unique(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    releasedAt: timestamp("released_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("collaterals_nominal_positive", sql`${table.nominalAmount} > 0`),
    check(
      "collaterals_eligible_usd_positive",
      sql`${table.eligibleUsdCents} > 0`,
    ),
    check(
      "collaterals_simulation_only",
      sql`${table.environment} = 'SIMULATION'::collateral_environment`,
    ),
    index("collaterals_user_idx").on(table.userId),
  ],
);

export const reputationFacts = pgTable(
  "reputation_facts",
  {
    id: text("id").primaryKey(),
    subjectType: reputationSubjectType("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    type: reputationFactType("type").notNull(),
    status: reputationFactStatus("status").notNull().default("ACTIVE"),
    evidenceReference: text("evidence_reference").notNull(),
    occurredAt: timestamp("occurred_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    details: jsonb("details").notNull().default({}),
    createdAt,
  },
  (table) => [
    uniqueIndex("reputation_facts_evidence_unique").on(table.evidenceReference),
    index("reputation_facts_subject_idx").on(
      table.subjectType,
      table.subjectId,
      table.type,
    ),
  ],
);

export const receivables = pgTable(
  "receivables",
  {
    id: text("id").primaryKey(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    contractAsset: assetCode("contract_asset")
      .notNull()
      .default("USD_REFERENCE"),
    nominalAmount: bigint("nominal_amount", { mode: "bigint" }).notNull(),
    dueAt: timestamp("due_at", { mode: "date", withTimezone: true }).notNull(),
    status: receivableStatus("status").notNull().default("DRAFT"),
    evidenceHash: text("evidence_hash"),
    version: integer("version").notNull().default(1),
    clientAcceptedBtc: boolean("client_accepted_btc"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("receivables_nominal_amount_positive", sql`${table.nominalAmount} > 0`),
    check("receivables_version_positive", sql`${table.version} > 0`),
    check(
      "receivables_approved_requires_btc_acceptance",
      sql`${table.status} not in ('APPROVED'::receivable_status, 'POOLED'::receivable_status, 'ADVANCED'::receivable_status, 'DUE'::receivable_status, 'PAID'::receivable_status, 'DEFAULTED'::receivable_status, 'CLOSED'::receivable_status) or ${table.clientAcceptedBtc} is true`,
    ),
    check(
      "receivables_pilot_contract_asset",
      sql`${table.contractAsset} = 'USD_REFERENCE'::asset_code`,
    ),
    index("receivables_requester_idx").on(table.requesterId),
  ],
);

export const receivableVersions = pgTable(
  "receivable_versions",
  {
    id: text("id").primaryKey(),
    receivableId: text("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    paymentDescription: text("service_description").notNull(),
    paymentPurpose: paymentPurpose("payment_purpose").notNull().default("SERVICE"),
    contractAsset: assetCode("contract_asset")
      .notNull()
      .default("USD_REFERENCE"),
    nominalAmount: bigint("nominal_amount", { mode: "bigint" }).notNull(),
    dueAt: timestamp("due_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("receivable_versions_number_unique").on(
      table.receivableId,
      table.version,
    ),
    check("receivable_versions_version_positive", sql`${table.version} > 0`),
    check(
      "receivable_versions_nominal_positive",
      sql`${table.nominalAmount} > 0`,
    ),
    check(
      "receivable_versions_asset_usd_reference",
      sql`${table.contractAsset} = 'USD_REFERENCE'::asset_code`,
    ),
  ],
);

export const receivableEvidences = pgTable(
  "receivable_evidences",
  {
    id: text("id").primaryKey(),
    receivableId: text("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    receivableVersion: integer("receivable_version").notNull(),
    privateObjectReference: text("private_object_reference").notNull(),
    sha256: text("sha256").notNull(),
    extension: text("extension").notNull(),
    declaredMimeType: text("declared_mime_type").notNull(),
    detectedMimeType: text("detected_mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    scanStatus: receivableEvidenceScanStatus("scan_status")
      .notNull()
      .default("PENDING"),
    scannedAt: timestamp("scanned_at", { mode: "date", withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("receivable_evidences_private_reference_unique").on(
      table.privateObjectReference,
    ),
    index("receivable_evidences_hash_idx").on(table.sha256),
    check("receivable_evidences_size_positive", sql`${table.byteSize} > 0`),
    check(
      "receivable_evidences_clean_scanned",
      sql`${table.scanStatus} <> 'CLEAN'::receivable_evidence_scan_status or ${table.scannedAt} is not null`,
    ),
  ],
);

export const clientConfirmations = pgTable(
  "client_confirmations",
  {
    id: text("id").primaryKey(),
    receivableId: text("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    receivableVersion: integer("receivable_version").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: clientConfirmationStatus("status").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { mode: "date", withTimezone: true }),
    clientAcceptsBtc: boolean("client_accepts_btc"),
    confirmsDescription: boolean("confirms_description"),
    confirmedAmount: bigint("confirmed_amount", { mode: "bigint" }),
    confirmedDueAt: timestamp("confirmed_due_at", {
      mode: "date",
      withTimezone: true,
    }),
    termsVersion: text("terms_version"),
    divergences: jsonb("divergences").notNull().default([]),
    createdAt,
  },
  (table) => [
    uniqueIndex("client_confirmations_token_hash_unique").on(table.tokenHash),
    uniqueIndex("client_confirmations_one_pending_unique")
      .on(table.receivableId)
      .where(sql`${table.status} = 'PENDING'::client_confirmation_status`),
    index("client_confirmations_receivable_idx").on(table.receivableId),
    check(
      "client_confirmations_used_terminal",
      sql`${table.status} = 'PENDING'::client_confirmation_status or ${table.usedAt} is not null`,
    ),
    check(
      "client_confirmations_accepted_matches_all_terms",
      sql`${table.status} <> 'ACCEPTED'::client_confirmation_status or (${table.clientAcceptsBtc} is true and ${table.confirmsDescription} is true and ${table.confirmedAmount} is not null and ${table.confirmedDueAt} is not null and ${table.termsVersion} is not null)`,
    ),
  ],
);

export const payerPaymentAuthorizations = pgTable(
  "payer_payment_authorizations",
  {
    id: text("id").primaryKey(),
    publicId: uuid("public_id").notNull().unique(),
    receivableId: text("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    payerId: text("payer_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    confirmationId: text("confirmation_id")
      .notNull()
      .references(() => clientConfirmations.id, { onDelete: "restrict" }),
    managementTokenHash: text("management_token_hash").notNull().unique(),
    method: payerPaymentMethod("method").notNull(),
    status: payerPaymentAuthorizationStatus("status").notNull(),
    maxAmountMsat: bigint("max_amount_msat", { mode: "bigint" }).notNull(),
    maxFeeMsat: bigint("max_fee_msat", { mode: "bigint" }).notNull(),
    scheduledFor: timestamp("scheduled_for", { mode: "date", withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    singleUse: boolean("single_use").notNull().default(true),
    usedAt: timestamp("used_at", { mode: "date", withTimezone: true }),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("payer_payment_authorizations_one_per_receivable").on(table.receivableId),
    index("payer_payment_authorizations_due_idx").on(table.status, table.scheduledFor),
    check("payer_payment_authorizations_amount_positive", sql`${table.maxAmountMsat} > 0`),
    check("payer_payment_authorizations_fee_non_negative", sql`${table.maxFeeMsat} >= 0`),
    check("payer_payment_authorizations_expiry", sql`${table.expiresAt} > ${table.scheduledFor}`),
    check("payer_payment_authorizations_single_use", sql`${table.singleUse} is true`),
    check("payer_payment_authorizations_token_hash", sql`${table.managementTokenHash} ~ '^[a-f0-9]{64}$'`),
    check("payer_payment_authorizations_manual_state", sql`${table.method} <> 'MANUAL'::payer_payment_method or ${table.status} = 'MANUAL_PAYMENT_REQUIRED'::payer_payment_authorization_status`),
  ],
);

export const nwcConnections = pgTable(
  "nwc_connections",
  {
    id: text("id").primaryKey(),
    authorizationId: text("authorization_id")
      .notNull()
      .unique()
      .references(() => payerPaymentAuthorizations.id, { onDelete: "restrict" }),
    walletServicePubkey: text("wallet_service_pubkey").notNull(),
    relayUrls: jsonb("relay_urls").notNull(),
    encryptedConnectionSecret: text("encrypted_connection_secret").notNull(),
    encryptedConnectionMetadata: text("encrypted_connection_metadata"),
    connectionFingerprint: text("connection_fingerprint").notNull().unique(),
    supportedMethods: jsonb("supported_methods").notNull(),
    lastCheckedAt: timestamp("last_checked_at", { mode: "date", withTimezone: true }).notNull(),
    status: nwcConnectionStatus("connection_status").notNull().default("ACTIVE"),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("nwc_connections_pubkey_shape", sql`${table.walletServicePubkey} ~ '^[a-f0-9]{64}$'`),
    check("nwc_connections_fingerprint_shape", sql`${table.connectionFingerprint} ~ '^[a-f0-9]{64}$'`),
  ],
);

// Private operational storage for the LRP v0.1 originator. Public LRP state is
// reconstructed from relays and never from this table.
export const protocolNwcAuthorizations = pgTable(
  "protocol_nwc_authorizations",
  {
    id: text("id").primaryKey(),
    receivableEventId: text("receivable_event_id").notNull(),
    clientPubkey: text("client_pubkey").notNull(),
    walletServicePubkey: text("wallet_service_pubkey").notNull(),
    encryptedConnectionUri: text("encrypted_connection_uri").notNull(),
    safeFingerprint: text("safe_fingerprint").notNull(),
    maxAmountMsat: bigint("max_amount_msat", { mode: "bigint" }).notNull(),
    dueAt: timestamp("due_at", { mode: "date", withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    lastValidatedAt: timestamp("last_validated_at", { mode: "date", withTimezone: true }).notNull(),
    attestationEventId: text("attestation_event_id"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("protocol_nwc_authorizations_receivable_client_unique").on(table.receivableEventId, table.clientPubkey),
    uniqueIndex("protocol_nwc_authorizations_attestation_unique").on(table.attestationEventId),
    check("protocol_nwc_authorizations_receivable_shape", sql`${table.receivableEventId} ~ '^[a-f0-9]{64}$'`),
    check("protocol_nwc_authorizations_client_shape", sql`${table.clientPubkey} ~ '^[a-f0-9]{64}$'`),
    check("protocol_nwc_authorizations_wallet_shape", sql`${table.walletServicePubkey} ~ '^[a-f0-9]{64}$'`),
    check("protocol_nwc_authorizations_fingerprint_shape", sql`${table.safeFingerprint} ~ '^[a-f0-9]{64}$'`),
    check("protocol_nwc_authorizations_amount_positive", sql`${table.maxAmountMsat} > 0`),
    check("protocol_nwc_authorizations_expiry", sql`${table.expiresAt} > ${table.dueAt}`),
  ],
);

export const lrpPublicEvents = pgTable(
  "lrp_public_events",
  {
    eventId: text("event_id").primaryKey(),
    kind: integer("kind").notNull(),
    pubkey: text("pubkey").notNull(),
    eventCreatedAt: integer("event_created_at").notNull(),
    tags: jsonb("tags").notNull(),
    content: text("content").notNull(),
    signature: text("signature").notNull(),
    observedRelays: jsonb("observed_relays").notNull().default([]),
    firstSeenAt: timestamp("first_seen_at", { mode: "date", withTimezone: true }).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    check("lrp_public_events_id_shape", sql`${table.eventId} ~ '^[a-f0-9]{64}$'`),
    check("lrp_public_events_pubkey_shape", sql`${table.pubkey} ~ '^[a-f0-9]{64}$'`),
    check("lrp_public_events_signature_shape", sql`${table.signature} ~ '^[a-f0-9]{128}$'`),
    check("lrp_public_events_kind_range", sql`${table.kind} between 8100 and 8114`),
    index("lrp_public_events_kind_created_idx").on(table.kind, table.eventCreatedAt),
  ],
);

export const lrpPublicationAttempts = pgTable(
  "lrp_publication_attempts",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    entityType: text("entity_type").notNull(),
    privateEntityId: text("private_entity_id").notNull(),
    eventId: text("event_id").notNull().references(() => lrpPublicEvents.eventId, { onDelete: "restrict" }),
    status: lrpPublicationStatus("status").notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    acknowledgedRelays: jsonb("acknowledged_relays").notNull().default([]),
    rejectedRelays: jsonb("rejected_relays").notNull().default([]),
    timedOutRelays: jsonb("timed_out_relays").notNull().default([]),
    lastErrorCode: text("last_error_code"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("lrp_publication_attempts_entity_type", sql`${table.entityType} in ('RECEIVABLE', 'POOL', 'ORIGINATOR_FACT')`),
    check("lrp_publication_attempts_count_non_negative", sql`${table.attemptCount} >= 0`),
    index("lrp_publication_attempts_entity_idx").on(table.entityType, table.privateEntityId),
  ],
);

// Private preparation state for the real receivable creation flow. Only the
// signed event and its derived projection become public LRP state.
export const lrpReceivableOriginations = pgTable(
  "lrp_receivable_originations",
  {
    id: text("id").primaryKey(),
    requestKey: text("request_key").notNull().unique(),
    receivableId: text("receivable_id").notNull().unique()
      .references(() => receivables.id, { onDelete: "restrict" }),
    requesterId: text("requester_id").notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("PRIVATE_DRAFT"),
    providerPubkey: text("provider_pubkey"),
    publicPseudonym: text("public_pseudonym").notNull(),
    privatePayload: jsonb("private_payload").notNull(),
    candidateEvent: jsonb("candidate_event"),
    signedEvent: jsonb("signed_event"),
    publicEventId: text("public_event_id").unique()
      .references(() => lrpPublicEvents.eventId, { onDelete: "restrict" }),
    divergences: jsonb("divergences").notNull().default([]),
    canonicalSource: lrpCanonicalSource("canonical_source").notNull().default("LEGACY"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("lrp_receivable_originations_requester_idx").on(table.requesterId, table.status),
    check("lrp_receivable_originations_mode", sql`${table.mode} in ('SHADOW', 'LRP')`),
    check("lrp_receivable_originations_status", sql`${table.status} in ('PRIVATE_DRAFT', 'CANDIDATE_READY', 'SHADOW_VALIDATED', 'PUBLICATION_PENDING', 'PUBLISHED', 'PROJECTION_PENDING')`),
    check("lrp_receivable_originations_pubkey_shape", sql`${table.providerPubkey} is null or ${table.providerPubkey} ~ '^[a-f0-9]{64}$'`),
    check("lrp_receivable_originations_event_shape", sql`${table.publicEventId} is null or ${table.publicEventId} ~ '^[a-f0-9]{64}$'`),
  ],
);

// Private preparation and publication state for originator-signed facts. The
// private hash commits to PostgreSQL data; only the signed LRP event is public.
export const lrpOriginatorEvents = pgTable(
  "lrp_originator_events",
  {
    id: text("id").primaryKey(),
    receivableId: text("receivable_id").notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("PRIVATE_RECORDED"),
    originatorPubkey: text("originator_pubkey"),
    privateRecordId: text("private_record_id").notNull(),
    privatePayloadHash: text("private_payload_hash").notNull(),
    candidateEvent: jsonb("candidate_event"),
    signedEvent: jsonb("signed_event"),
    publicEventId: text("public_event_id").unique()
      .references(() => lrpPublicEvents.eventId, { onDelete: "restrict" }),
    divergences: jsonb("divergences").notNull().default([]),
    canonicalSource: lrpCanonicalSource("canonical_source").notNull().default("LEGACY"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("lrp_originator_events_receivable_type_unique").on(table.receivableId, table.eventType),
    index("lrp_originator_events_status_idx").on(table.eventType, table.status),
    check("lrp_originator_events_type", sql`${table.eventType} in ('PayerCommitmentProof', 'ClientValidationDecision', 'NwcAuthorizationAttestation')`),
    check("lrp_originator_events_mode", sql`${table.mode} in ('SHADOW', 'LRP')`),
    check("lrp_originator_events_status", sql`${table.status} in ('PRIVATE_RECORDED', 'CANDIDATE_READY', 'SHADOW_VALIDATED', 'PUBLICATION_PENDING', 'PUBLISHED', 'PROJECTION_PENDING')`),
    check("lrp_originator_events_pubkey_shape", sql`${table.originatorPubkey} is null or ${table.originatorPubkey} ~ '^[a-f0-9]{64}$'`),
    check("lrp_originator_events_private_hash_shape", sql`${table.privatePayloadHash} ~ '^[a-f0-9]{64}$'`),
    check("lrp_originator_events_public_event_shape", sql`${table.publicEventId} is null or ${table.publicEventId} ~ '^[a-f0-9]{64}$'`),
  ],
);

// Private preparation state for a provider-approved PoolCreated event. Financial
// terms remain private until the provider explicitly accepts the public payload.
export const lrpPoolOriginations = pgTable(
  "lrp_pool_originations",
  {
    id: text("id").primaryKey(),
    receivableId: text("receivable_id").notNull().unique()
      .references(() => receivables.id, { onDelete: "restrict" }),
    poolId: text("pool_id").notNull().unique(),
    requesterId: text("requester_id").notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("TERMS_READY"),
    providerPubkey: text("provider_pubkey"),
    termsPayload: jsonb("terms_payload").notNull(),
    termsHash: text("terms_hash").notNull(),
    consentedAt: timestamp("consented_at", { mode: "date", withTimezone: true }),
    candidateEvent: jsonb("candidate_event"),
    signedEvent: jsonb("signed_event"),
    publicEventId: text("public_event_id").unique()
      .references(() => lrpPublicEvents.eventId, { onDelete: "restrict" }),
    divergences: jsonb("divergences").notNull().default([]),
    canonicalSource: lrpCanonicalSource("canonical_source").notNull().default("LEGACY"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("lrp_pool_originations_requester_idx").on(table.requesterId, table.status),
    check("lrp_pool_originations_mode", sql`${table.mode} in ('SHADOW', 'LRP')`),
    check("lrp_pool_originations_status", sql`${table.status} in ('TERMS_READY', 'CANDIDATE_READY', 'SHADOW_VALIDATED', 'PUBLICATION_PENDING', 'PUBLISHED', 'PROJECTION_PENDING')`),
    check("lrp_pool_originations_pubkey_shape", sql`${table.providerPubkey} is null or ${table.providerPubkey} ~ '^[a-f0-9]{64}$'`),
    check("lrp_pool_originations_terms_hash_shape", sql`${table.termsHash} ~ '^[a-f0-9]{64}$'`),
    check("lrp_pool_originations_event_shape", sql`${table.publicEventId} is null or ${table.publicEventId} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const lrpEntityLinks = pgTable(
  "lrp_entity_links",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    privateEntityId: text("private_entity_id").notNull(),
    eventType: text("event_type").notNull(),
    eventId: text("event_id").notNull().references(() => lrpPublicEvents.eventId, { onDelete: "restrict" }),
    canonicalSource: lrpCanonicalSource("canonical_source").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("lrp_entity_links_private_event_type_unique").on(table.entityType, table.privateEntityId, table.eventType),
    uniqueIndex("lrp_entity_links_event_unique").on(table.eventId),
    check("lrp_entity_links_entity_type", sql`${table.entityType} in ('RECEIVABLE', 'POOL')`),
  ],
);

export const lrpReceivableProjections = pgTable(
  "lrp_receivable_projections",
  {
    receivableEventId: text("receivable_event_id").primaryKey().references(() => lrpPublicEvents.eventId, { onDelete: "restrict" }),
    receivableId: text("receivable_id").notNull(),
    providerPubkey: text("provider_pubkey").notNull(),
    projection: jsonb("projection").notNull(),
    projectedAt: timestamp("projected_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("lrp_receivable_projections_public_id_unique").on(table.receivableId),
    check("lrp_receivable_projections_provider_shape", sql`${table.providerPubkey} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const lrpPoolProjections = pgTable(
  "lrp_pool_projections",
  {
    poolEventId: text("pool_event_id").primaryKey().references(() => lrpPublicEvents.eventId, { onDelete: "restrict" }),
    poolId: text("pool_id").notNull(),
    providerPubkey: text("provider_pubkey").notNull(),
    originatorPubkey: text("originator_pubkey").notNull(),
    state: text("state").notNull(),
    latestEventId: text("latest_event_id").notNull(),
    progressBps: integer("progress_bps").notNull().default(0),
    projection: jsonb("projection").notNull(),
    projectedAt: timestamp("projected_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("lrp_pool_projections_public_id_unique").on(table.poolId),
    check("lrp_pool_projections_provider_shape", sql`${table.providerPubkey} ~ '^[a-f0-9]{64}$'`),
    check("lrp_pool_projections_originator_shape", sql`${table.originatorPubkey} ~ '^[a-f0-9]{64}$'`),
    check("lrp_pool_projections_latest_event_shape", sql`${table.latestEventId} ~ '^[a-f0-9]{64}$'`),
    check("lrp_pool_projections_progress_range", sql`${table.progressBps} between 0 and 10000`),
    index("lrp_pool_projections_state_idx").on(table.state),
  ],
);

export const lrpProjectionRuns = pgTable(
  "lrp_projection_runs",
  {
    id: text("id").primaryKey(),
    status: lrpProjectionRunStatus("status").notNull().default("RUNNING"),
    eventCount: integer("event_count").notNull().default(0),
    receivableCount: integer("receivable_count").notNull().default(0),
    poolCount: integer("pool_count").notNull().default(0),
    inconsistencies: jsonb("inconsistencies").notNull().default([]),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    check("lrp_projection_runs_counts_non_negative", sql`${table.eventCount} >= 0 and ${table.receivableCount} >= 0 and ${table.poolCount} >= 0`),
  ],
);

export const scheduledPaymentAttempts = pgTable(
  "scheduled_payment_attempts",
  {
    id: text("id").primaryKey(),
    authorizationId: text("authorization_id")
      .notNull()
      .references(() => payerPaymentAuthorizations.id, { onDelete: "restrict" }),
    invoiceId: text("invoice_id"),
    invoiceReference: text("invoice_reference"),
    invoicePaymentHash: text("invoice_payment_hash"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    scheduledFor: timestamp("scheduled_for", { mode: "date", withTimezone: true }).notNull(),
    attemptedAt: timestamp("attempted_at", { mode: "date", withTimezone: true }),
    status: scheduledPaymentAttemptStatus("status").notNull().default("SCHEDULED"),
    nwcRequestEventId: text("nwc_request_event_id"),
    nwcResponseEventId: text("nwc_response_event_id"),
    failureCode: text("failure_code"),
    failureReasonSafe: text("failure_reason_safe"),
    feesPaidMsat: bigint("fees_paid_msat", { mode: "bigint" }),
    preimageHash: text("preimage_hash"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("scheduled_payment_attempts_one_per_authorization").on(table.authorizationId),
    index("scheduled_payment_attempts_due_idx").on(table.status, table.scheduledFor),
    check("scheduled_payment_attempts_fees_non_negative", sql`${table.feesPaidMsat} is null or ${table.feesPaidMsat} >= 0`),
    check("scheduled_payment_attempts_preimage_hash", sql`${table.preimageHash} is null or ${table.preimageHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const receivableFingerprints = pgTable(
  "receivable_fingerprints",
  {
    sha256: text("sha256").primaryKey(),
    receivableId: text("receivable_id")
      .notNull()
      .unique()
      .references(() => receivables.id, { onDelete: "restrict" }),
    claimedAt: timestamp("claimed_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
);

export const validations = pgTable(
  "validations",
  {
    id: text("id").primaryKey(),
    receivableId: text("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "cascade" }),
    receivableVersion: integer("receivable_version").notNull().default(1),
    status: validationStatus("status").notNull().default("PENDING"),
    rulesVersion: text("rules_version").notNull(),
    results: jsonb("results").notNull().default({}),
    decisionReason: text("decision_reason"),
    reviewedBy: text("reviewed_by"),
    createdAt,
    updatedAt,
  },
  (table) => [index("validations_receivable_idx").on(table.receivableId)],
);

export const adminReviews = pgTable(
  "admin_reviews",
  {
    id: text("id").primaryKey(),
    validationId: text("validation_id")
      .notNull()
      .unique()
      .references(() => validations.id, { onDelete: "restrict" }),
    reviewerId: text("reviewer_id").notNull(),
    decision: adminReviewDecision("decision").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt,
  },
  (table) => [check("admin_reviews_reason_present", sql`length(${table.reason}) >= 10`)],
);

export const poolQuotes = pgTable(
  "pool_quotes",
  {
    id: text("id").primaryKey(),
    btcPriceUsdCents: bigint("btc_price_usd_cents", { mode: "bigint" }).notNull(),
    source: text("source").notNull(),
    sourceReference: text("source_reference").notNull(),
    spreadBps: integer("spread_bps").notNull().default(0),
    lightningFeeSats: bigint("lightning_fee_sats", { mode: "bigint" }).notNull().default(sql`0`),
    swapFeeUsdCents: bigint("swap_fee_usd_cents", { mode: "bigint" }).notNull().default(sql`0`),
    environment: financialEnvironment("environment").notNull().default("SIMULATION"),
    quotedAt: timestamp("quoted_at", { mode: "date", withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("pool_quotes_source_reference_unique").on(table.sourceReference),
    check("pool_quotes_price_positive", sql`${table.btcPriceUsdCents} > 0`),
    check("pool_quotes_spread_non_negative", sql`${table.spreadBps} >= 0`),
    check("pool_quotes_fees_non_negative", sql`${table.lightningFeeSats} >= 0 and ${table.swapFeeUsdCents} >= 0`),
    check("pool_quotes_expiry_after_quote", sql`${table.expiresAt} > ${table.quotedAt}`),
  ],
);

export const pools = pgTable(
  "pools",
  {
    id: text("id").primaryKey(),
    receivableId: text("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    quoteId: text("quote_id").references(() => poolQuotes.id, { onDelete: "restrict" }),
    mode: poolMode("mode").notNull(),
    riskBand: poolRiskBand("risk_band").notNull().default("LOW"),
    environment: financialEnvironment("environment").notNull().default("SIMULATION"),
    rulesVersion: text("rules_version").notNull().default("pool-financial-v0.2"),
    fundingAsset: assetCode("funding_asset").notNull().default("BTC"),
    settlementAsset: assetCode("settlement_asset").notNull(),
    nominalUsdCents: bigint("nominal_usd_cents", { mode: "bigint" }).notNull().default(sql`1`),
    advanceUsdCents: bigint("advance_usd_cents", { mode: "bigint" }).notNull().default(sql`1`),
    discountBps: integer("discount_bps").notNull().default(0),
    targetAmount: bigint("target_amount", { mode: "bigint" }).notNull(),
    fundedAmount: bigint("funded_amount", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    reservedAmount: bigint("reserved_amount", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    pairedObligationUsdtUnits: bigint("paired_obligation_usdt_units", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    treasuryBtcReservedSats: bigint("treasury_btc_reserved_sats", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    externalCostsUsdCents: bigint("external_costs_usd_cents", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    status: poolStatus("status").notNull().default("DRAFT"),
    closesAt: timestamp("closes_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("pools_target_amount_positive", sql`${table.targetAmount} > 0`),
    check("pools_nominal_advance_positive", sql`${table.nominalUsdCents} > 0 and ${table.advanceUsdCents} > 0 and ${table.advanceUsdCents} <= ${table.nominalUsdCents}`),
    check("pools_discount_bps_range", sql`${table.discountBps} >= 0 and ${table.discountBps} <= 500`),
    check(
      "pools_funding_asset_btc_only",
      sql`${table.fundingAsset} = 'BTC'::asset_code`,
    ),
    check(
      "pools_mode_settlement_asset",
      sql`(${table.mode} = 'FULL_BTC'::pool_mode and ${table.settlementAsset} = 'BTC'::asset_code) or (${table.mode} = 'USD_PAIRED'::pool_mode and ${table.settlementAsset} = 'USDT'::asset_code)`,
    ),
    check(
      "pools_funded_amount_within_target",
      sql`${table.fundedAmount} >= 0 and ${table.fundedAmount} <= ${table.targetAmount}`,
    ),
    check(
      "pools_reserved_capacity_within_target",
      sql`${table.reservedAmount} >= 0 and ${table.fundedAmount} + ${table.reservedAmount} <= ${table.targetAmount}`,
    ),
    check(
      "pools_full_matches_target",
      sql`${table.status} <> 'FULL'::pool_status or (${table.fundedAmount} = ${table.targetAmount} and ${table.reservedAmount} = 0)`,
    ),
    check(
      "pools_paired_segregation",
      sql`(${table.mode} = 'FULL_BTC'::pool_mode and ${table.pairedObligationUsdtUnits} = 0 and ${table.treasuryBtcReservedSats} = 0) or (${table.mode} = 'USD_PAIRED'::pool_mode and ${table.pairedObligationUsdtUnits} > 0 and ${table.treasuryBtcReservedSats} >= ${table.targetAmount})`,
    ),
    check("pools_external_costs_non_negative", sql`${table.externalCostsUsdCents} >= 0`),
    uniqueIndex("pools_one_active_per_receivable")
      .on(table.receivableId)
      .where(
        sql`${table.status} not in ('CANCELLED'::pool_status, 'SETTLED'::pool_status)`,
      ),
  ],
);

export const partialPoolDecisions = pgTable(
  "partial_pool_decisions",
  {
    id: text("id").primaryKey(),
    poolId: text("pool_id")
      .notNull()
      .unique()
      .references(() => pools.id, { onDelete: "restrict" }),
    decision: partialPoolDecision("decision").notNull(),
    actorId: text("actor_id").notNull(),
    fundedAmount: bigint("funded_amount", { mode: "bigint" }).notNull(),
    reason: text("reason").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt,
  },
  (table) => [
    check("partial_pool_decisions_funded_positive", sql`${table.fundedAmount} > 0`),
    check("partial_pool_decisions_reason_present", sql`length(${table.reason}) >= 5`),
  ],
);

export const poolSettlementSimulations = pgTable(
  "pool_settlement_simulations",
  {
    id: text("id").primaryKey(),
    poolId: text("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    paymentUsdCents: bigint("payment_usd_cents", { mode: "bigint" }).notNull(),
    principalUsdCents: bigint("principal_usd_cents", { mode: "bigint" }).notNull(),
    externalCostsUsdCents: bigint("external_costs_usd_cents", { mode: "bigint" }).notNull(),
    applicableLossesUsdCents: bigint("applicable_losses_usd_cents", { mode: "bigint" }).notNull(),
    netResultUsdCents: bigint("net_result_usd_cents", { mode: "bigint" }).notNull(),
    platformResultUsdCents: bigint("platform_result_usd_cents", { mode: "bigint" }).notNull(),
    contributorsResultUsdCents: bigint("contributors_result_usd_cents", { mode: "bigint" }).notNull(),
    rulesVersion: text("rules_version").notNull(),
    createdAt,
  },
  (table) => [
    check("pool_settlement_simulations_values_non_negative", sql`${table.paymentUsdCents} >= 0 and ${table.principalUsdCents} >= 0 and ${table.externalCostsUsdCents} >= 0 and ${table.applicableLossesUsdCents} >= 0 and ${table.netResultUsdCents} >= 0 and ${table.platformResultUsdCents} >= 0 and ${table.contributorsResultUsdCents} >= 0`),
    check("pool_settlement_simulations_split", sql`${table.platformResultUsdCents} + ${table.contributorsResultUsdCents} = ${table.netResultUsdCents}`),
  ],
);

export const contributionIntents = pgTable(
  "contribution_intents",
  {
    id: text("id").primaryKey(),
    poolId: text("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "restrict" }),
    contributorId: text("contributor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    asset: assetCode("asset").notNull(),
    status: contributionStatus("status").notNull().default("CREATED"),
    capacityReserved: boolean("capacity_reserved").notNull().default(false),
    invoiceReference: text("invoice_reference").unique(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("contribution_intents_amount_positive", sql`${table.amount} > 0`),
    check(
      "contribution_intents_asset_btc_only",
      sql`${table.asset} = 'BTC'::asset_code`,
    ),
    index("contribution_intents_pool_idx").on(table.poolId),
  ],
);

export const contributions = pgTable(
  "contributions",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id")
      .notNull()
      .references(() => contributionIntents.id, { onDelete: "restrict" }),
    externalPaymentReference: text("external_payment_reference").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    asset: assetCode("asset").notNull(),
    status: contributionStatus("status").notNull().default("SETTLED"),
    settledAt: timestamp("settled_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("contributions_external_payment_unique").on(
      table.externalPaymentReference,
    ),
    check("contributions_amount_positive", sql`${table.amount} > 0`),
    check(
      "contributions_asset_btc_only",
      sql`${table.asset} = 'BTC'::asset_code`,
    ),
  ],
);

export const mainnetSessions = pgTable(
  "mainnet_sessions",
  {
    id: text("id").primaryKey(),
    requestedAmountSats: bigint("requested_amount_sats", { mode: "bigint" }).notNull().default(sql`0`),
    maxAmountSats: bigint("max_amount_sats", { mode: "bigint" }).notNull().default(sql`5000`),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("mainnet_sessions_fixed_max", sql`${table.maxAmountSats} = 5000`),
    check("mainnet_sessions_amount_within_limit", sql`${table.requestedAmountSats} >= 0 and ${table.requestedAmountSats} <= ${table.maxAmountSats}`),
  ],
);

export const externalPaymentRequests = pgTable(
  "external_payment_requests",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id")
      .references(() => contributionIntents.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => mainnetSessions.id, { onDelete: "restrict" }),
    environment: financialEnvironment("environment").notNull().default("MAINNET"),
    purpose: externalPaymentPurpose("purpose").notNull(),
    expectedAsset: assetCode("expected_asset").notNull(),
    expectedAmount: bigint("expected_amount", { mode: "bigint" }).notNull(),
    destination: text("destination"),
    externalReference: text("external_reference"),
    status: externalPaymentStatus("status").notNull().default("PREPARING"),
    feesSat: bigint("fees_sat", { mode: "bigint" }).notNull().default(sql`0`),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    settledAt: timestamp("settled_at", { mode: "date", withTimezone: true }),
    errorCode: text("error_code"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("external_payment_requests_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("external_payment_requests_external_reference_unique").on(table.externalReference),
    uniqueIndex("external_payment_requests_single_active_mainnet_unique")
      .on(table.environment)
      .where(sql`${table.environment} = 'MAINNET'::financial_environment and ${table.status} in ('PREPARING'::external_payment_status, 'PENDING'::external_payment_status)`),
    index("external_payment_requests_pending_idx").on(table.status, table.expiresAt),
    index("external_payment_requests_session_idx").on(table.sessionId),
    check("external_payment_requests_mainnet_only", sql`${table.environment} = 'MAINNET'::financial_environment`),
    check("external_payment_requests_amount_positive", sql`${table.expectedAmount} > 0 and ${table.expectedAmount} <= 1000`),
    check("external_payment_requests_fees_non_negative", sql`${table.feesSat} >= 0`),
    check("external_payment_requests_contribution_intent", sql`${table.purpose} <> 'CONTRIBUTION'::external_payment_purpose or ${table.intentId} is not null`),
  ],
);

export const externalPaymentEvents = pgTable(
  "external_payment_events",
  {
    id: text("id").primaryKey(),
    paymentRequestId: text("payment_request_id")
      .notNull()
      .references(() => externalPaymentRequests.id, { onDelete: "restrict" }),
    deduplicationKey: text("deduplication_key").notNull(),
    eventType: text("event_type").notNull(),
    externalReference: text("external_reference").notNull(),
    amountSat: bigint("amount_sat", { mode: "bigint" }),
    payloadHash: text("payload_hash").notNull(),
    receivedAt: timestamp("received_at", { mode: "date", withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { mode: "date", withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("external_payment_events_deduplication_unique").on(table.deduplicationKey),
    index("external_payment_events_request_idx").on(table.paymentRequestId),
    check("external_payment_events_hash_shape", sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
    check("external_payment_events_amount_non_negative", sql`${table.amountSat} is null or ${table.amountSat} >= 0`),
  ],
);

export const externalSwapAttempts = pgTable(
  "external_swap_attempts",
  {
    id: text("id").primaryKey(),
    poolId: text("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    environment: financialEnvironment("environment").notNull().default("MAINNET"),
    direction: externalSwapDirection("direction").notNull(),
    fromAssetId: text("from_asset_id").notNull(),
    toAssetId: text("to_asset_id").notNull(),
    receiverAmountUnits: bigint("receiver_amount_units", { mode: "bigint" }).notNull(),
    feesSat: bigint("fees_sat", { mode: "bigint" }).notNull().default(sql`0`),
    estimatedAssetFeesUnits: bigint("estimated_asset_fees_units", { mode: "bigint" }).notNull().default(sql`0`),
    maxSlippageBps: integer("max_slippage_bps").notNull(),
    status: externalSwapStatus("status").notNull().default("PREPARED"),
    externalReference: text("external_reference"),
    errorCode: text("error_code"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("external_swap_attempts_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("external_swap_attempts_external_reference_unique").on(table.externalReference),
    check("external_swap_attempts_mainnet_only", sql`${table.environment} = 'MAINNET'::financial_environment`),
    check("external_swap_attempts_assets_distinct", sql`${table.fromAssetId} <> ${table.toAssetId}`),
    check("external_swap_attempts_amount_positive", sql`${table.receiverAmountUnits} > 0`),
    check("external_swap_attempts_fees_non_negative", sql`${table.feesSat} >= 0 and ${table.estimatedAssetFeesUnits} >= 0`),
    check("external_swap_attempts_slippage_range", sql`${table.maxSlippageBps} >= 0 and ${table.maxSlippageBps} <= 500`),
  ],
);

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    environment: financialEnvironment("environment").notNull().default("MAINNET"),
    status: reconciliationStatus("status").notNull(),
    externalBtcSats: bigint("external_btc_sats", { mode: "bigint" }).notNull(),
    ledgerBtcSats: bigint("ledger_btc_sats", { mode: "bigint" }).notNull(),
    btcDifferenceSats: bigint("btc_difference_sats", { mode: "bigint" }).notNull(),
    externalUsdtUnits: bigint("external_usdt_units", { mode: "bigint" }).notNull(),
    ledgerUsdtUnits: bigint("ledger_usdt_units", { mode: "bigint" }).notNull(),
    usdtDifferenceUnits: bigint("usdt_difference_units", { mode: "bigint" }).notNull(),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("reconciliation_runs_idempotency_unique").on(table.idempotencyKey),
    check("reconciliation_runs_mainnet_only", sql`${table.environment} = 'MAINNET'::financial_environment`),
    check("reconciliation_runs_external_non_negative", sql`${table.externalBtcSats} >= 0 and ${table.externalUsdtUnits} >= 0`),
  ],
);

export const mainnetReadinessAudits = pgTable(
  "mainnet_readiness_audits",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    reportHash: text("report_hash").notNull(),
    status: mainnetReadinessStatus("status").notNull(),
    allChecksPassed: boolean("all_checks_passed").notNull(),
    sdkVersion: text("sdk_version").notNull(),
    network: text("network").notNull(),
    lbtcAssetId: text("lbtc_asset_id").notNull(),
    usdtAssetId: text("usdt_asset_id").notNull(),
    usdtPrecision: integer("usdt_precision").notNull(),
    usdcConfigured: boolean("usdc_configured").notNull(),
    workingDirPersistent: boolean("working_dir_persistent").notNull(),
    operatorNamed: boolean("operator_named").notNull(),
    maxSlippageBps: integer("max_slippage_bps").notNull(),
    externalProbeEnabled: boolean("external_probe_enabled").notNull(),
    externalExecutionAttempted: boolean("external_execution_attempted").notNull(),
    routePrepared: boolean("route_prepared").notNull(),
    receiverAmountUnits: bigint("receiver_amount_units", { mode: "bigint" }),
    estimatedAssetFeesUnits: bigint("estimated_asset_fees_units", { mode: "bigint" }),
    quotePreparedAt: timestamp("quote_prepared_at", { mode: "date", withTimezone: true }),
    quoteExpiresAt: timestamp("quote_expires_at", { mode: "date", withTimezone: true }),
    walletBtcSats: bigint("wallet_btc_sats", { mode: "bigint" }).notNull(),
    refundableCount: integer("refundable_count").notNull(),
    unknownPaymentCount: integer("unknown_payment_count").notNull(),
    reconciliationMatched: boolean("reconciliation_matched").notNull(),
    backupRestoreVerified: boolean("backup_restore_verified").notNull(),
    backupProofHash: text("backup_proof_hash"),
    checks: jsonb("checks").notNull(),
    completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [
    check("mainnet_readiness_status_consistent", sql`(${table.status} = 'GO'::mainnet_readiness_status) = ${table.allChecksPassed}`),
    check("mainnet_readiness_report_hash_shape", sql`${table.reportHash} ~ '^[a-f0-9]{64}$'`),
    check("mainnet_readiness_mainnet_only", sql`${table.network} = 'mainnet'`),
    check("mainnet_readiness_asset_allowlist", sql`${table.lbtcAssetId} = '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d' and ${table.usdtAssetId} = 'ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2' and ${table.usdtPrecision} = 8 and ${table.usdcConfigured} is false`),
    check("mainnet_readiness_no_execution", sql`${table.externalExecutionAttempted} is false`),
    check("mainnet_readiness_ranges", sql`${table.walletBtcSats} >= 0 and ${table.walletBtcSats} <= 10000 and ${table.refundableCount} >= 0 and ${table.unknownPaymentCount} >= 0 and ${table.maxSlippageBps} >= 0 and ${table.maxSlippageBps} <= 100`),
    check("mainnet_readiness_route_values", sql`(${table.routePrepared} is false and ${table.receiverAmountUnits} is null and ${table.estimatedAssetFeesUnits} is null and ${table.quotePreparedAt} is null and ${table.quoteExpiresAt} is null) or (${table.routePrepared} is true and ${table.receiverAmountUnits} > 0 and ${table.estimatedAssetFeesUnits} >= 0 and ${table.quotePreparedAt} is not null and ${table.quoteExpiresAt} > ${table.quotePreparedAt} and ${table.quoteExpiresAt} <= ${table.quotePreparedAt} + interval '60 seconds' and ${table.estimatedAssetFeesUnits} * 10000 <= ${table.receiverAmountUnits} * ${table.maxSlippageBps})`),
    check("mainnet_readiness_go_requires_operational_proofs", sql`${table.status} <> 'GO'::mainnet_readiness_status or (${table.workingDirPersistent} is true and ${table.operatorNamed} is true and ${table.externalProbeEnabled} is true and ${table.externalExecutionAttempted} is false and ${table.routePrepared} is true and ${table.quotePreparedAt} <= ${table.completedAt} and ${table.quoteExpiresAt} > ${table.completedAt} and ${table.reconciliationMatched} is true and ${table.backupRestoreVerified} is true and ${table.backupProofHash} ~ '^[a-f0-9]{64}$' and ${table.refundableCount} = 0 and ${table.unknownPaymentCount} = 0)`),
  ],
);

export const mainnetDemoRuns = pgTable(
  "mainnet_demo_runs",
  {
    id: text("id").primaryKey().references(() => mainnetSessions.id, { onDelete: "restrict" }),
    readinessAuditId: text("readiness_audit_id").notNull().references(() => mainnetReadinessAudits.id, { onDelete: "restrict" }),
    status: mainnetDemoStatus("status").notNull().default("DRAFT"),
    operatorRefHash: text("operator_ref_hash").notNull(),
    maxInvoiceSats: bigint("max_invoice_sats", { mode: "bigint" }).notNull().default(sql`1000`),
    maxSessionSats: bigint("max_session_sats", { mode: "bigint" }).notNull().default(sql`5000`),
    maxHotWalletSats: bigint("max_hot_wallet_sats", { mode: "bigint" }).notNull().default(sql`10000`),
    offlineFallbackReady: boolean("offline_fallback_ready").notNull().default(false),
    armedAt: timestamp("armed_at", { mode: "date", withTimezone: true }),
    activatedAt: timestamp("activated_at", { mode: "date", withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { mode: "date", withTimezone: true }),
    stopReason: text("stop_reason"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("mainnet_demo_operator_hash_shape", sql`${table.operatorRefHash} ~ '^[a-f0-9]{64}$'`),
    check("mainnet_demo_fixed_limits", sql`${table.maxInvoiceSats} = 1000 and ${table.maxSessionSats} = 5000 and ${table.maxHotWalletSats} = 10000`),
    check("mainnet_demo_armed_timestamp", sql`${table.status} not in ('ARMED'::mainnet_demo_status, 'ACTIVE'::mainnet_demo_status, 'COMPLETED'::mainnet_demo_status) or ${table.armedAt} is not null`),
    check("mainnet_demo_active_timestamp", sql`${table.status} not in ('ACTIVE'::mainnet_demo_status, 'COMPLETED'::mainnet_demo_status) or ${table.activatedAt} is not null`),
    check("mainnet_demo_terminal_timestamp", sql`${table.status} not in ('COMPLETED'::mainnet_demo_status, 'STOPPED'::mainnet_demo_status, 'ABORTED'::mainnet_demo_status) or (${table.stoppedAt} is not null and length(${table.stopReason}) >= 5)`),
  ],
);

export const mainnetDemoApprovals = pgTable(
  "mainnet_demo_approvals",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id").notNull().unique().references(() => mainnetDemoRuns.id, { onDelete: "restrict" }),
    approverRefHash: text("approver_ref_hash").notNull(),
    checklistHash: text("checklist_hash").notNull(),
    approvedAt: timestamp("approved_at", { mode: "date", withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    createdAt,
  },
  (table) => [
    check("mainnet_demo_approval_hashes", sql`${table.approverRefHash} ~ '^[a-f0-9]{64}$' and ${table.checklistHash} ~ '^[a-f0-9]{64}$'`),
    check("mainnet_demo_approval_window", sql`${table.expiresAt} > ${table.approvedAt} and ${table.expiresAt} <= ${table.approvedAt} + interval '2 hours'`),
    check("mainnet_demo_approval_revocation", sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.approvedAt}`),
  ],
);

export const mainnetCircuitBreakerEvents = pgTable(
  "mainnet_circuit_breaker_events",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id").notNull().references(() => mainnetDemoRuns.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    reason: text("reason").notNull(),
    detailsHash: text("details_hash").notNull(),
    triggeredAt: timestamp("triggered_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [
    index("mainnet_circuit_breaker_run_idx").on(table.demoRunId, table.triggeredAt),
    check("mainnet_circuit_breaker_reason_present", sql`length(${table.reason}) >= 5`),
    check("mainnet_circuit_breaker_details_hash", sql`${table.detailsHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const poolAllocations = pgTable(
  "pool_allocations",
  {
    poolId: text("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "restrict" }),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.poolId, table.contributionId] }),
    uniqueIndex("pool_allocations_contribution_unique").on(table.contributionId),
    check("pool_allocations_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    asset: assetCode("asset").notNull(),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id"),
    createdAt,
  },
  (table) => [
    uniqueIndex("ledger_accounts_code_asset_unique").on(table.code, table.asset),
    uniqueIndex("ledger_accounts_id_asset_unique").on(table.id, table.asset),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    description: text("description").notNull(),
    status: ledgerTransactionStatus("status").notNull().default("PENDING"),
    correlationId: text("correlation_id").notNull(),
    postedAt: timestamp("posted_at", { mode: "date", withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("ledger_transactions_idempotency_unique").on(
      table.idempotencyKey,
    ),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    accountId: text("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    asset: assetCode("asset").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    createdAt,
  },
  (table) => [
    check("ledger_entries_amount_non_zero", sql`${table.amount} <> 0`),
    index("ledger_entries_transaction_idx").on(table.transactionId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt,
  },
  (table) => [index("audit_events_target_idx").on(table.targetType, table.targetId)],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    topic: text("topic").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt,
  },
  (table) => [
    check("outbox_events_attempts_non_negative", sql`${table.attempts} >= 0`),
    index("outbox_events_pending_idx").on(table.processedAt, table.availableAt),
  ],
);

export type AppSchema = typeof import("./schema");
