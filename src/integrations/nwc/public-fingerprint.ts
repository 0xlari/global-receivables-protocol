import { createHmac } from "node:crypto";

export function publicNwcFingerprint(privateFingerprint: string) {
  const key = process.env.NWC_CONNECTION_ENCRYPTION_KEY;
  if (!key) throw new Error("NWC_ENCRYPTION_KEY_MISSING");
  return createHmac("sha256", Buffer.from(key, "base64"))
    .update(`lrp:nwc:0.1:${privateFingerprint}`)
    .digest("hex");
}
