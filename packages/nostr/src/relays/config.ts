const DEFAULT_RELAYS = [
  "wss://relay.damus.io/",
  "wss://nos.lol/",
  "wss://relay.primal.net/",
  "wss://relay.nostr.band/",
  "wss://offchain.pub/",
] as const;

function normalizeRelay(value: string) {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "wss:" || parsed.username || parsed.password || parsed.hash) {
    throw new Error("LRP_RELAY_INVALID");
  }
  return parsed.toString();
}

export function lrpRelaysFromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const configured = environment.NOSTR_RELAYS?.split(",").filter(Boolean) ?? environment.NOSTR_LRP_RELAYS?.split(",").filter(Boolean) ?? DEFAULT_RELAYS;
  const relays = [...new Set(configured.map(normalizeRelay))];
  if (relays.length < 3) throw new Error("THREE_DISTINCT_LRP_RELAYS_REQUIRED");
  return relays;
}
