import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM at-rest encryption for OAuth refresh tokens (see DoctorCalendarAccount).
 * CALENDAR_TOKEN_KEY must be a base64-encoded 32-byte key, e.g. generated with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function getKey(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_KEY;
  if (!raw) {
    throw new Error("CALENDAR_TOKEN_KEY environment variable is required to store calendar tokens.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CALENDAR_TOKEN_KEY must decode to exactly 32 bytes (a base64-encoded AES-256 key).");
  }
  return key;
}

/** Encodes as base64(iv).base64(authTag).base64(ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
