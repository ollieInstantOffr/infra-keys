"use client";

/**
 * Breach checking by k-anonymity, exactly as the design promises: only the
 * first five characters of the SHA-1 hash ever leave the device, and the
 * comparison against the returned range happens here.
 */

const cache = new Map<string, number>();

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Returns how many breaches the password appears in — 0 means clean. */
export async function breachCount(password: string): Promise<number> {
  if (!password) return 0;

  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const cached = cache.get(hash);
  if (cached !== undefined) return cached;

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
  });
  if (!res.ok) throw new Error("Breach service unavailable");

  const body = await res.text();
  let count = 0;
  for (const line of body.split("\n")) {
    const [candidate, hits] = line.trim().split(":");
    if (candidate === suffix) {
      count = Number(hits) || 0;
      break;
    }
  }

  cache.set(hash, count);
  return count;
}
