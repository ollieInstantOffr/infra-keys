import { fail, ok, route } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * Layer 2: hand back the recovery-wrapped vault key so the browser can try to
 * open it with a typed code. Rate-limited to 5 tries an hour, and only ever
 * reachable behind a fresh account session (i.e. a magic link), exactly as
 * the guardrails in the design require.
 */
export const GET = route(async ({ user }) => {
  const limited = rateLimit(`recovery:${user.id}`, 5, 3600_000);
  if (!limited.ok) {
    return fail(
      `Too many attempts. Try again in ${Math.ceil(limited.retryAfter / 60)} minutes.`,
      429,
      { retryAfter: limited.retryAfter },
    );
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { recoveryWrappedKey: true, recoverySalt: true },
  });

  if (!row?.recoveryWrappedKey || !row.recoverySalt) {
    return fail("No recovery code was ever saved for this account.", 404, {
      code: "NO_KIT",
    });
  }

  return ok({ wrappedKey: row.recoveryWrappedKey, salt: row.recoverySalt });
});
