import { z } from "zod";
import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto/server";
import { sendEmail } from "@/lib/email/send";
import { eraseNoticeEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";

const COOLING_OFF_DAYS = 7;

/**
 * Layer 3. No device and no code means the vault genuinely cannot be
 * decrypted — by anyone, us included. The account survives; the encrypted
 * vault is erased after a 7-day notice so a stolen inbox alone can't wipe
 * someone instantly.
 */
const schema = z.object({
  reason: z.enum(["START_OVER", "DELETE_ACCOUNT"]).default("START_OVER"),
});

export const POST = route<z.infer<typeof schema>>(
  async ({ user, body }) => {
    const scheduledAt = new Date(Date.now() + COOLING_OFF_DAYS * 864e5);
    const token = randomToken(24);

    await db.accountDeletion.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        reason: body.reason,
        scheduledAt,
        cancelledAt: null,
      },
      update: {
        reason: body.reason,
        scheduledAt,
        requestedAt: new Date(),
        cancelledAt: null,
        remindedDay: 0,
      },
    });

    // the cancel link is a fresh single-use magic link scoped to cancelling
    await db.magicLink.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        code: "000000",
        purpose: "cancel-erase",
        expiresAt: scheduledAt,
        originHandle: randomToken(16),
      },
    });

    await sendEmail(
      eraseNoticeEmail({
        to: user.email,
        eraseOn: scheduledAt.toDateString(),
        requestedOn: new Date().toDateString(),
        token,
      }),
    ).catch(() => {});

    await db.securityEvent.create({
      data: { userId: user.id, kind: "account.erase-scheduled" },
    });

    return ok({ scheduledAt: scheduledAt.toISOString() });
  },
  { schema },
);

/** Cancel — reachable from the emailed link or from inside the app. */
export const DELETE = route(async ({ user }) => {
  await db.accountDeletion.updateMany({
    where: { userId: user.id, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
  await db.securityEvent.create({
    data: { userId: user.id, kind: "account.erase-cancelled" },
  });
  return ok({ cancelled: true });
});
