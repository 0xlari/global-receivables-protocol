const NWC_URI = /nostr\+walletconnect:\/\/[^\s"']+/gi;

export function sanitizeNwcLogValue(value: unknown): unknown {
  if (typeof value === "string") return value.replace(NWC_URI, "[REDACTED_NWC_URI]");
  if (Array.isArray(value)) return value.map(sanitizeNwcLogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /secret|preimage|nwcUri|connectionUri/i.test(key)
        ? "[REDACTED]"
        : sanitizeNwcLogValue(item),
    ]));
  }
  return value;
}
