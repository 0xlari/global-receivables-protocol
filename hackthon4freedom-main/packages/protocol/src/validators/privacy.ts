const forbiddenKeys = new Set([
  "civil_name", "legal_name", "cpf", "contract", "document", "email", "phone",
  "address", "payer_data", "invoice", "preimage", "nsec", "seed", "mnemonic",
  "nwc_uri", "secret", "balance", "private_relay", "relay_secret",
]);

const forbiddenValuePatterns = [
  /nostr\+walletconnect:\/\//i,
  /\bnsec1[023456789acdefghjklmnpqrstuvwxyz]{20,}\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b(?:lnbc|lntb|lnbcrt)[0-9a-z]{20,}\b/i,
];

export function findForbiddenPublicData(value: unknown, path = "$", issues: string[] = []): readonly string[] {
  if (typeof value === "string") {
    if (forbiddenValuePatterns.some((pattern) => pattern.test(value))) issues.push(`${path}:FORBIDDEN_VALUE`);
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenPublicData(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenKeys.has(key.toLowerCase())) issues.push(`${path}.${key}:FORBIDDEN_KEY`);
      findForbiddenPublicData(item, `${path}.${key}`, issues);
    }
  }
  return issues;
}

export function assertPublicDataSafe(value: unknown) {
  const issues = findForbiddenPublicData(value);
  if (issues.length > 0) throw Object.assign(new Error("PROTOCOL_PUBLIC_DATA_FORBIDDEN"), { issues });
}
