import type { ProtocolSignedEvent } from "../schemas";
import { validateProtocolEvent, type ValidatedProtocolEvent } from "../validators";

export type GraphRejection = Readonly<{ eventId: string; reason: string }>;
export type ResolvedEventGraph = Readonly<{
  events: readonly ValidatedProtocolEvent[];
  byId: ReadonlyMap<string, ValidatedProtocolEvent>;
  rejected: readonly GraphRejection[];
}>;

function eventReferences(event: ProtocolSignedEvent) {
  return event.tags.filter((tag) => tag[0] === "e" && tag[1]).map((tag) => tag[1]!);
}

export function resolveEventGraph(inputs: readonly ProtocolSignedEvent[]): ResolvedEventGraph {
  const candidates = new Map<string, ValidatedProtocolEvent>();
  const rejected: GraphRejection[] = [];
  for (const input of inputs) {
    const result = validateProtocolEvent(input);
    if (!result.valid) {
      rejected.push({ eventId: typeof input.id === "string" ? input.id : "unknown", reason: result.reason });
      continue;
    }
    const existing = candidates.get(result.value.event.id);
    if (existing && JSON.stringify(existing.event) !== JSON.stringify(result.value.event)) {
      rejected.push({ eventId: result.value.event.id, reason: "EVENT_ID_CONFLICT" });
      candidates.delete(result.value.event.id);
      continue;
    }
    candidates.set(result.value.event.id, result.value);
  }

  const accepted = new Map(candidates);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, item] of accepted) {
      const missing = eventReferences(item.event).find((reference) => !accepted.has(reference));
      if (missing) {
        accepted.delete(id);
        rejected.push({ eventId: id, reason: `MISSING_REFERENCE:${missing}` });
        changed = true;
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) { cyclic.add(id); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const reference of eventReferences(accepted.get(id)!.event)) {
      if (accepted.has(reference)) visit(reference);
    }
    visiting.delete(id); visited.add(id);
  };
  for (const id of accepted.keys()) visit(id);
  for (const id of cyclic) { accepted.delete(id); rejected.push({ eventId: id, reason: "CYCLIC_REFERENCE" }); }

  const events = [...accepted.values()].sort((left, right) => left.event.created_at - right.event.created_at || left.event.id.localeCompare(right.event.id));
  return { events, byId: new Map(events.map((item) => [item.event.id, item])), rejected: rejected.sort((left, right) => left.eventId.localeCompare(right.eventId) || left.reason.localeCompare(right.reason)) };
}
