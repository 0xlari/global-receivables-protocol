import type { ProtocolSignedEvent } from "../../../protocol/src/schemas";

export type RelayFilter = Readonly<{
  kinds?: readonly number[];
  authors?: readonly string[];
  eventIds?: readonly string[];
  referencedEventIds?: readonly string[];
  poolIds?: readonly string[];
  receivableIds?: readonly string[];
  originatorPubkeys?: readonly string[];
  since?: number;
  until?: number;
  limit?: number;
}>;

export type RelayPublishAck = Readonly<{ accepted: boolean; message?: string }>;

export interface ProtocolRelayClient {
  readonly relayUrl: string;
  publish(event: ProtocolSignedEvent): Promise<RelayPublishAck>;
  query(filter: RelayFilter): Promise<readonly ProtocolSignedEvent[]>;
  close?(): void;
}

export type RelayClientFactory = (relayUrl: string) => ProtocolRelayClient;
