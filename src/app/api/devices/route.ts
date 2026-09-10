import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(async ({ user }) => {
  const devices = await db.device.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { enrolledAt: "asc" },
    select: {
      id: true,
      name: true,
      browser: true,
      platform: true,
      usesPrf: true,
      enrolledAt: true,
      lastSeenAt: true,
      undoUntil: true,
      addedFrom: true,
      credentialId: true,
      wrappedVaultKey: true,
    },
  });

  return ok(
    devices.map((d) => ({
      id: d.id,
      name: d.name,
      browser: d.browser,
      platform: d.platform,
      usesPrf: d.usesPrf,
      enrolled: Boolean(d.credentialId),
      canApprove: Boolean(d.wrappedVaultKey),
      isThisDevice: d.id === user.deviceId,
      enrolledAt: d.enrolledAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
      undoUntil: d.undoUntil?.toISOString() ?? null,
      addedFrom: d.addedFrom,
    })),
  );
});
