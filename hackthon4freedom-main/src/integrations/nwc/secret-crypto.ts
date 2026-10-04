import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function getEncryptionKey(): Buffer {
  const encoded = process.env.NWC_CONNECTION_ENCRYPTION_KEY;
  if (!encoded) throw new Error("NWC_ENCRYPTION_KEY_MISSING");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("NWC_ENCRYPTION_KEY_INVALID");
  return key;
}

export function encryptNwcSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from("elas-recebem-hoje:nwc:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptNwcSecret(envelope: string): string {
  const [version, ivRaw, tagRaw, ciphertextRaw, extra] = envelope.split(".");
  if (version !== VERSION || !ivRaw || !tagRaw || !ciphertextRaw || extra) {
    throw new Error("NWC_ENCRYPTED_SECRET_INVALID");
  }
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(Buffer.from("elas-recebem-hoje:nwc:v1", "utf8"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
