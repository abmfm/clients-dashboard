import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM envelope encryption for anything we must persist but never want
 * sitting in the database as readable text (currently the one-time password
 * handed to a new client).
 *
 * Stored format:  v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>
 *
 * The key lives only in CREDENTIALS_ENCRYPTION_KEY on the server, so a database
 * dump - or anyone with direct Postgres access - reveals nothing.
 */

const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is missing. Generate one with: openssl rand -base64 32"
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(".");
    if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;

    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key, tampered ciphertext, or legacy format.
    return null;
  }
}
