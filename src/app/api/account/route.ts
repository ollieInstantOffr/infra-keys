import { z } from "zod";
import { fail, ok, route } from "@/lib/api";
import { db } from "@/lib/db";
import { destroySession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/send";
import { accountDeletedEmail } from "@/lib/email/templates";

/**
 * Delete the account, immediately and for good.
 *
 * This is not the same action as "start over". That one runs on a 7-day
 * notice because email access is the *only* thing proving who you are, so a
 * stolen inbox must not be able to wipe someone instantly. Here the caller is
 * already signed in, has already unlocked the vault, and has typed their own
 * address to confirm — three proofs, not one. Making them wait a week after
 * that protects nobody.
 *
 * Every relation cascades from the user row, so one delete takes the vault,
 * its history, devices, sessions, folders, tags and audit trail with it.
 * Nothing is recoverable afterwards, by anyone, including us — the keys were
 * never on this side to begin with.
 */
const schema = z.object({
  /** The account's own email address, typed out, as the confirmation. */
  confirm: z.string().min(3),
});

export const DELETE = route<z.infer<typeof schema>>(
  async ({ user, body }) => {
    if (body.confirm.trim().toLowerCase() !== user.email.toLowerCase()) {
      return fail("That doesn't match the email on this account.", 422, {
        code: "CONFIRM_MISMATCH",
      });
    }

    // Best-effort, and before the delete — afterwards there is no address to
    // send to. If someone else did this, that mail is the only warning.
    await sendEmail(accountDeletedEmail({ to: user.email })).catch(() => {});

    await db.user.delete({ where: { id: user.id } });
    await destroySession();

    return ok({ deleted: true });
  },
  { schema },
);
