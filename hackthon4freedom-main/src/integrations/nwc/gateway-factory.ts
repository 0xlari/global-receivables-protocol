import { FakeNwcGateway } from "./fake-gateway";
import { RelayNwcGateway } from "./relay-gateway";
import type { NwcGateway } from "./types";

export function nwcValidationGatewayFromEnvironment(): NwcGateway {
  return process.env.NWC_ENABLE_LIVE === "true"
    ? new RelayNwcGateway()
    : new FakeNwcGateway();
}
