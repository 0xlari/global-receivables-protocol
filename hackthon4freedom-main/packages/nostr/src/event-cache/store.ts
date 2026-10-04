import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ProtocolSignedEvent } from "../../../protocol/src/schemas";

export type CachedProtocolEvent = Readonly<{
  eventId: string;
  kind: number;
  pubkey: string;
  createdAt: number;
  tags: readonly string[][];
  content: string;
  signature: string;
  relays: readonly string[];
  lastSyncedAt: string;
}>;

export interface ProtocolEventCache {
  clear(): Promise<void>;
  put(event: ProtocolSignedEvent, relays: readonly string[], syncedAt: Date): Promise<void>;
  all(): Promise<readonly CachedProtocolEvent[]>;
}

function toRecord(event: ProtocolSignedEvent, relays: readonly string[], syncedAt: Date): CachedProtocolEvent {
  return { eventId: event.id, kind: event.kind, pubkey: event.pubkey, createdAt: event.created_at, tags: event.tags, content: event.content, signature: event.sig, relays: [...new Set(relays)].sort(), lastSyncedAt: syncedAt.toISOString() };
}

export function cachedRecordToEvent(record: CachedProtocolEvent): ProtocolSignedEvent {
  return { id: record.eventId, kind: record.kind, pubkey: record.pubkey, created_at: record.createdAt, tags: record.tags.map((tag) => [...tag]), content: record.content, sig: record.signature };
}

export class InMemoryProtocolEventCache implements ProtocolEventCache {
  private readonly records = new Map<string, CachedProtocolEvent>();
  async clear() { this.records.clear(); }
  async put(event: ProtocolSignedEvent, relays: readonly string[], syncedAt: Date) { this.records.set(event.id, toRecord(event, relays, syncedAt)); }
  async all() { return [...this.records.values()].sort((left, right) => left.createdAt - right.createdAt || left.eventId.localeCompare(right.eventId)); }
}

export class FileProtocolEventCache implements ProtocolEventCache {
  constructor(private readonly path: string) {}
  private async read(): Promise<CachedProtocolEvent[]> {
    try { return JSON.parse(await readFile(this.path, "utf8")) as CachedProtocolEvent[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  async clear() { await mkdir(dirname(this.path), { recursive: true }); await writeFile(this.path, "[]\n", { encoding: "utf8", mode: 0o600 }); }
  async put(event: ProtocolSignedEvent, relays: readonly string[], syncedAt: Date) {
    const records = await this.read(); const next = records.filter((item) => item.eventId !== event.id); next.push(toRecord(event, relays, syncedAt));
    next.sort((left, right) => left.createdAt - right.createdAt || left.eventId.localeCompare(right.eventId));
    await writeFile(this.path, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }
  async all() { return this.read(); }
}
