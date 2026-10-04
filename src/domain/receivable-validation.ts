export const RECEIVABLE_RULES_VERSION = "receivable-validation-v1";

export type RuleResult = Readonly<{
  rule: string;
  passed: boolean;
  reason: string;
}>;

export type AutomaticValidationDecision = Readonly<{
  outcome: "PASSED" | "FAILED" | "NEEDS_REVIEW";
  reason: string;
  results: readonly RuleResult[];
}>;

export function evaluateReceivable(input: {
  requesterCountryCode: string;
  clientCountryCode: string;
  identityVerified: boolean;
  identityConsentActive: boolean;
  evidenceClean: boolean;
  clientAcceptedBtc: boolean;
  confirmationMatches: boolean;
  duplicateEvidence: boolean;
  clientHasDefault: boolean;
  availableLimitUsdCents: bigint;
  nominalUsdCents: bigint;
}): AutomaticValidationDecision {
  const results: RuleResult[] = [
    { rule: "requester_country", passed: input.requesterCountryCode === "BR", reason: "solicitante do piloto Brasil" },
    { rule: "client_country", passed: input.clientCountryCode !== "BR", reason: "pagador precisa estar no exterior" },
    { rule: "identity", passed: input.identityVerified && input.identityConsentActive, reason: "identidade e consentimento válidos" },
    { rule: "evidence", passed: input.evidenceClean, reason: "documento íntegro e livre de malware" },
    { rule: "btc_acceptance", passed: input.clientAcceptedBtc, reason: "pagador aceita liquidação em BTC" },
    { rule: "confirmation_match", passed: input.confirmationMatches, reason: "valor e vencimento correspondem" },
    { rule: "duplicate", passed: !input.duplicateEvidence, reason: "evidência não reutilizada" },
    { rule: "credit_limit", passed: input.availableLimitUsdCents >= input.nominalUsdCents, reason: "limite disponível suficiente" },
  ];

  const failed = results.find((result) => !result.passed);
  if (failed) {
    return { outcome: "FAILED", reason: failed.rule, results };
  }
  if (input.clientHasDefault) {
    return {
      outcome: "NEEDS_REVIEW",
      reason: "client_default_history",
      results: [
        ...results,
        { rule: "client_history", passed: false, reason: "histórico de inadimplência exige revisão excepcional" },
      ],
    };
  }
  return { outcome: "PASSED", reason: "all_rules_passed", results };
}
