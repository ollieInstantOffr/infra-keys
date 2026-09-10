"use client";

/**
 * RFC 6238 TOTP, on WebCrypto. 2FA secrets are part of the encrypted item
 * payload, so codes are always generated locally — the server never has the
 * material to compute one.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decodeBase32(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error("That doesn't look like a 2FA setup key.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export type TotpConfig = {
  secret: string;
  digits?: number;
  period?: number;
  algorithm?: "SHA-1" | "SHA-256" | "SHA-512";
};

/** Accepts a raw base32 secret or a full otpauth:// URI. */
export function parseTotp(input: string): TotpConfig {
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith("otpauth://")) {
    return { secret: trimmed.replace(/\s/g, "") };
  }

  const url = new URL(trimmed);
  const secret = url.searchParams.get("secret");
  if (!secret) throw new Error("That otpauth link has no secret.");

  const algo = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
  return {
    secret,
    digits: Number(url.searchParams.get("digits") ?? 6),
    period: Number(url.searchParams.get("period") ?? 30),
    algorithm:
      algo === "SHA256" ? "SHA-256" : algo === "SHA512" ? "SHA-512" : "SHA-1",
  };
}

export async function totpCode(
  config: TotpConfig,
  atMs = Date.now(),
): Promise<{ code: string; secondsLeft: number; period: number }> {
  const period = config.period ?? 30;
  const digits = config.digits ?? 6;
  const counter = Math.floor(atMs / 1000 / period);

  const counterBytes = new Uint8Array(8);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter), false);

  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase32(config.secret) as BufferSource,
    { name: "HMAC", hash: config.algorithm ?? "SHA-1" },
    false,
    ["sign"],
  );

  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, counterBytes as BufferSource),
  );

  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];

  const code = String(binary % 10 ** digits).padStart(digits, "0");
  const secondsLeft = period - Math.floor(atMs / 1000) % period;

  return { code, secondsLeft, period };
}

/** "739 104" — the design groups six digits in threes. */
export function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}
