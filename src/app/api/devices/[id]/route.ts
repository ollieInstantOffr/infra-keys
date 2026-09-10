import { fail, ok, route } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Revoke a device. Its sessions die and its copy of the wrapped vault key is
 * destroyed, so it can neither unlock nor approve anything.
 */
export const DELETE = route(async ({ user, params }) => {
  const device = await db.device.findFirst({
    where: { id: params.id, userId: user.id, revokedAt: null },
  });
  if (!device) return fail("That device is already gone.", 404);

  const remaining = await db.device.count({
    where: { userId: user.id, revokedAt: null, wrappedVaultKey: { not: null } },
  });
  if (remaining <= 1 && device.wrappedVaultKey) {
    return fail(
      "That's your last enrolled device. Save your recovery code first, or enrol another device.",
      409,
      { code: "LAST_DEVICE" },
    );
  }

  await db.$transaction([
    db.device.update({
      where: { id: device.id },
      data: {
        revokedAt: new Date(),
        wrappedVaultKey: null,
        transferPublicKey: null,
      },
    }),
    db.session.updateMany({
      where: { deviceId: device.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    db.securityEvent.create({
      data: {
        userId: user.id,
        kind: "device.revoked",
        detail: `${device.name} · ${device.browser}`,
      },
    }),
  ]);

  return ok({ revoked: true });
});
