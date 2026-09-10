import { z } from "zod";
import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Store (or replace) the recovery kit. The server only ever sees the vault
 * key already wrapped by the code, the salt used to derive it, and a masked
 * hint for the settings screen. Regenerating invalidates the old code by
 * simply overwriting the wrapped copy.
 */
const saveSchema = z.object({
  wrappedKey: z.string().min(10),
  salt: z.string().min(8),
  hint: z.string().min(4),
});

export const POST = route<z.infer<typeof saveSchema>>(
  async ({ user, body }) => {
    const existing = await db.user.findUnique({
      where: { id: user.id },
      select: { recoveryCreatedAt: true },
    });

    await db.user.update({
      where: { id: user.id },
      data: {
        recoveryWrappedKey: body.wrappedKey,
        recoverySalt: body.salt,
        recoveryHint: body.hint,
        recoveryCreatedAt: new Date(),
        recoverySavedAt: null,
      },
    });

    await db.securityEvent.create({
      data: {
        userId: user.id,
        kind: existing?.recoveryCreatedAt ? "recovery.regenerated" : "recovery.created",
      },
    });

    return ok({ hint: body.hint });
  },
  { schema: saveSchema },
);

/** "I've stored this somewhere safe and offline." */
export const PUT = route(async ({ user }) => {
  await db.user.update({
    where: { id: user.id },
    data: { recoverySavedAt: new Date() },
  });
  return ok({ savedAt: new Date().toISOString() });
});
