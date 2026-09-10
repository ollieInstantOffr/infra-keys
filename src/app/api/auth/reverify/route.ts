import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Touch ID sessions re-verify by magic link every 30 days. Once the fresh
 * link is consumed, the session's clock is pushed out again.
 */
export const POST = route(async ({ user }) => {
  const settings = await db.vaultSetting.findUnique({ where: { userId: user.id } });
  const days = settings?.reverifyDays ?? 30;

  await db.session.update({
    where: { id: user.sessionId },
    data: { reverifyAt: new Date(Date.now() + days * 864e5) },
  });

  return ok({ reverifyAt: new Date(Date.now() + days * 864e5).toISOString() });
});
