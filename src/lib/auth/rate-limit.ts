import "server-only";
import { db } from "@/lib/db";

export type RateLimitResult = { ok: boolean; retryAfter: number };

/**
 * Fixed-window rate limiting, counted in Postgres.
 *
 * Deliberately not in memory: the design treats "5 recovery attempts an
 * hour" as a security property, and an in-process counter resets whenever
 * the container restarts — which is exactly the moment an attacker would
 * pick. Keeping it in the database also means a second replica shares the
 * same budget, so no Redis is needed to scale out.
 *
 * The whole check is one statement, so concurrent requests can't both read
 * a stale count and slip past the limit.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + windowMs);

  try {
    const [row] = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."resetAt" < now() THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimit"."resetAt" < now() THEN ${resetAt}
          ELSE "RateLimit"."resetAt"
        END
      RETURNING "count", "resetAt"
    `;

    if (!row || row.count <= limit) return { ok: true, retryAfter: 0 };

    return {
      ok: false,
      retryAfter: Math.max(
        1,
        Math.ceil((row.resetAt.getTime() - Date.now()) / 1000),
      ),
    };
  } catch (error) {
    // A limiter that fails open is worse than a request that fails closed
    // on anything guarding a secret, so refuse rather than wave it through.
    console.error("keys · rate limiter unavailable", error);
    return { ok: false, retryAfter: 60 };
  }
}

/** Housekeeping for expired windows. Safe to call from anywhere. */
export async function pruneRateLimits(): Promise<number> {
  const { count } = await db.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date() } },
  });
  return count;
}
