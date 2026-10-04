import { NextResponse } from "next/server";
import { z } from "zod";

import { protocolSignedEventSchema } from "@protocol/schemas";
import { validatePoolCreationGraph, validateProtocolEvent } from "@protocol/validators";
import { NostrToolsRelayClient, lrpRelaysFromEnvironment } from "@nostr/relays";
import { publishToRelaySet } from "@nostr/publisher";
import { subscribeProtocolEvents } from "@nostr/subscriber";
import { verifyProtocolEventForSubscription } from "@nostr/verification";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };
const publicHeaders = { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" };

function clients() { return lrpRelaysFromEnvironment().map((relay) => new NostrToolsRelayClient(relay)); }
function close(items: readonly NostrToolsRelayClient[]) { items.forEach((client) => client.close()); }

export async function POST(request: Request) {
  const relayClients = clients();
  try {
    assertSameOrigin(request); assertJsonPayloadSize(request);
    const event = protocolSignedEventSchema.parse(await request.json()); enforceRateLimit(`protocol:publish:${event.pubkey}`, 12);
    const verification = validateProtocolEvent(event);
    if (!verification.valid) return NextResponse.json({ error: verification.reason }, { status: 400, headers: privateHeaders });
    const content = JSON.parse(event.content) as { event_type?: string; receivable_event_id?: string; payer_commitment_event_id?: string; approval_event_id?: string; nwc_attestation_event_id?: string };
    if (content.event_type === "PoolCreated") {
      const referencedIds = [content.receivable_event_id, content.payer_commitment_event_id, content.approval_event_id, content.nwc_attestation_event_id].filter((id): id is string => Boolean(id));
      const prerequisites = await subscribeProtocolEvents(relayClients, { eventIds: referencedIds, limit: 20 }, verifyProtocolEventForSubscription);
      const graphValidation = validatePoolCreationGraph(event, prerequisites.events);
      if (!graphValidation.valid) return NextResponse.json({ error: graphValidation.reason }, { status: 409, headers: privateHeaders });
    }
    await withSessionProfile(request, async ({ profile }) => {
      if (profile.nostrPubkey !== event.pubkey) throw new Error("PROTOCOL_SIGNER_NOT_LINKED_TO_SESSION");
    });
    const publication = await publishToRelaySet(event, relayClients, 2);
    return NextResponse.json(publication, { status: publication.status === "CONFIRMED" ? 201 : 503, headers: privateHeaders });
  } catch (error) {
    const message = error instanceof z.ZodError ? "INVALID_EVENT_ENVELOPE" : error instanceof Error ? error.message : "PROTOCOL_PUBLICATION_FAILED";
    return NextResponse.json({ error: message }, { status: message === "PROTOCOL_SIGNER_NOT_LINKED_TO_SESSION" ? 403 : 400, headers: privateHeaders });
  } finally { close(relayClients); }
}

export async function GET(request: Request) {
  const relayClients = clients();
  try {
    const url = new URL(request.url); const number = (name: string) => url.searchParams.get(name) ? Number(url.searchParams.get(name)) : undefined;
    const result = await subscribeProtocolEvents(relayClients, {
      kinds: url.searchParams.getAll("kind").map(Number).filter(Number.isInteger),
      authors: url.searchParams.getAll("author"), eventIds: url.searchParams.getAll("event"),
      referencedEventIds: url.searchParams.getAll("ref"), poolIds: url.searchParams.getAll("pool"),
      receivableIds: url.searchParams.getAll("receivable"), originatorPubkeys: url.searchParams.getAll("originator"),
      since: number("since"), until: number("until"), limit: Math.min(number("limit") ?? 500, 500),
    }, verifyProtocolEventForSubscription);
    return NextResponse.json(result, { headers: publicHeaders });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar os relays." }, { status: 503, headers: publicHeaders });
  } finally { close(relayClients); }
}
