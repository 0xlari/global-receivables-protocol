import { NextResponse } from "next/server";

import { reducePoolState } from "@protocol/reducers";
import type { PoolTransition, ProtocolSignedEvent } from "@protocol/schemas";
import { NostrToolsRelayClient, lrpRelaysFromEnvironment } from "@nostr/relays";
import { hasRelayObservationQuorum, subscribeProtocolEvents } from "@nostr/subscriber";
import { verifyProtocolEventForSubscription } from "@nostr/verification";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!/^[a-f0-9]{64}$/.test(id)) return NextResponse.json({ error: "POOL_EVENT_ID_INVALID" }, { status: 400, headers });
  const clients = lrpRelaysFromEnvironment().map((relay) => new NostrToolsRelayClient(relay));
  try {
    const rootResult = await subscribeProtocolEvents(clients, { eventIds: [id], limit: 10 }, verifyProtocolEventForSubscription); const root = rootResult.events.find((item) => item.id === id);
    if (!root) return NextResponse.json({ error: "POOL_NOT_FOUND" }, { status: 404, headers });
    if (!hasRelayObservationQuorum(rootResult, id, 2)) return NextResponse.json({ error: "POOL_RELAY_QUORUM_INSUFFICIENT", observedOn: rootResult.observedOn[id] ?? [], unavailableRelays: rootResult.unavailableRelays }, { status: 503, headers });
    const rootContent = JSON.parse(root.content) as { event_type?: string }; if (rootContent.event_type !== "PoolCreated") return NextResponse.json({ error: "EVENT_IS_NOT_POOL" }, { status: 400, headers });
    const references = root.tags.filter((tag) => tag[0] === "e").map((tag) => tag[1]).filter((value): value is string => Boolean(value));
    const [prerequisites, transitions] = await Promise.all([
      subscribeProtocolEvents(clients, { eventIds: references, limit: 50 }, verifyProtocolEventForSubscription),
      subscribeProtocolEvents(clients, { referencedEventIds: [id], poolIds: [id], limit: 500 }, verifyProtocolEventForSubscription),
    ]);
    const events = [...new Map< string, ProtocolSignedEvent>([root, ...prerequisites.events, ...transitions.events].map((event) => [event.id, event])).values()];
    const reduced = reducePoolState(events); const pool = reduced.pools.find((item) => item.poolEventId === id);
    if (!pool) return NextResponse.json({ error: "POOL_GRAPH_INVALID", rejected: reduced.rejected }, { status: 409, headers });
    const latest = events.find((item) => item.id === pool.latestEventId); const latestContent = latest && latest.id !== root.id ? JSON.parse(latest.content) as PoolTransition : undefined;
    const observedOn = { ...rootResult.observedOn, ...prerequisites.observedOn, ...transitions.observedOn };
    return NextResponse.json({ pool, progressBps: latestContent?.funded_bps ?? 0, events: events.map((event) => ({ ...event, observedOn: observedOn[event.id] ?? [] })), rejected: reduced.rejected, unavailableRelays: [...new Set([...rootResult.unavailableRelays, ...prerequisites.unavailableRelays, ...transitions.unavailableRelays])] }, { headers });
  } catch { return NextResponse.json({ error: "POOL_RELAY_QUERY_FAILED" }, { status: 503, headers }); }
  finally { clients.forEach((client) => client.close()); }
}
