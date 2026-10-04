import type { PoolCreated, PoolState, PoolTransition, ProtocolSignedEvent } from "../schemas";
import { resolveEventGraph, type GraphRejection } from "../references";
import { validatePoolCreationGraph } from "../validators";
import { validateTransition } from "./transition";

export type PoolProjection = Readonly<{
  poolEventId: string;
  poolId: string;
  providerPubkey: string;
  originatorPubkey: string;
  state: PoolState;
  latestEventId: string;
  transitions: readonly string[];
  terms: PoolCreated;
}>;

export function reducePoolState(inputs: readonly ProtocolSignedEvent[]) {
  const graph = resolveEventGraph(inputs);
  const rejected: GraphRejection[] = [...graph.rejected];
  const pools: PoolProjection[] = [];
  for (const root of graph.events.filter((item) => item.content.event_type === "PoolCreated")) {
    if (root.content.event_type !== "PoolCreated") continue;
    const prerequisite = validatePoolCreationGraph(root.event, graph.events.map((item) => item.event));
    if (!prerequisite.valid) { rejected.push({ eventId: root.event.id, reason: prerequisite.reason }); continue; }
    const terms = root.content;
    let state: PoolState = "PUBLISHED";
    let latestEventId = root.event.id;
    let latestAt = root.event.created_at;
    const applied: string[] = [];
    const remaining = new Map(graph.events.filter((item) => item.content.event_type === "PoolTransition" && item.content.pool_event_id === root.event.id).map((item) => [item.event.id, item]));
    while (true) {
      const candidates = [...remaining.values()].filter((item) => item.content.event_type === "PoolTransition" && item.content.previous_event_id === latestEventId);
      if (candidates.length === 0) break;
      if (candidates.length > 1) {
        for (const candidate of candidates) rejected.push({ eventId: candidate.event.id, reason: "AMBIGUOUS_TRANSITION_BRANCH" });
        break;
      }
      const candidate = candidates[0]!;
      const transition = candidate.content as PoolTransition;
      const validation = validateTransition(state, transition, { pool: terms, providerPubkey: root.event.pubkey, previousTransitionAt: latestAt });
      remaining.delete(candidate.event.id);
      if (!validation.valid) { rejected.push({ eventId: candidate.event.id, reason: validation.reason }); continue; }
      state = transition.new_state; latestEventId = candidate.event.id; latestAt = transition.transitioned_at; applied.push(candidate.event.id);
    }
    for (const item of remaining.values()) rejected.push({ eventId: item.event.id, reason: "UNREACHABLE_TRANSITION" });
    pools.push({ poolEventId: root.event.id, poolId: terms.pool_id, providerPubkey: root.event.pubkey, originatorPubkey: terms.originator_pubkey, state, latestEventId, transitions: applied, terms });
  }
  return { pools: pools.sort((left, right) => left.poolId.localeCompare(right.poolId)), rejected: rejected.sort((left, right) => left.eventId.localeCompare(right.eventId) || left.reason.localeCompare(right.reason)) };
}
