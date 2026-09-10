import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * At-rest encryption for the handful of fields the *server* must be able to
 * read — today that is only the email address, which we need in order to
 * send a sign-in link.
 *
 * Vault content never passes through here: it arrives already encrypted by
 * the browser and is stored verbatim. See src/lib/crypto/vault.ts.
 */

const ALG = "aes-256-gcm";

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, env.encryptionKey, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${body.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptField(payload: string): string {
  const [version, ivB64, bodyB64, tagB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !bodyB64 || !tagB64) {
    throw new Error("Unrecognised ciphertext");
  }
  const decipher = crypto.createDecipheriv(
    ALG,
    env.encryptionKey,
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Blind index. Lets us find a user by email without storing the email in a
 * queryable form. Deterministic, keyed, and useless without APP_INDEX_KEY.
 */
export function blindIndex(value: string): string {
  return crypto
    .createHmac("sha256", env.indexKey)
    .update(value.trim().toLowerCase())
    .digest("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Six digits, uniform, no modulo bias. */
export function numericCode(digits = 6): string {
  const max = 10 ** digits;
  const limit = Math.floor(0xffffffff / max) * max;
  let n: number;
  do {
    n = crypto.randomBytes(4).readUInt32BE(0);
  } while (n >= limit);
  return String(n % max).padStart(digits, "0");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
