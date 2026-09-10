import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Everything the client needs to bring the vault up: which device this is,
 * the wrapped key it should try to open, and the encrypted rows themselves.
 * Nothing here is readable without the vault key.
 */
export const GET = route(async ({ user }) => {
  const [device, items, folders, tags, settings, prefs, deletion, pendingApprovals] =
    await Promise.all([
      user.deviceId
        ? db.device.findUnique({
            where: { id: user.deviceId },
            select: {
              id: true,
              name: true,
              browser: true,
              prfSalt: true,
              usesPrf: true,
              wrappedVaultKey: true,
              enrolledAt: true,
            },
          })
        : null,
      db.vaultItem.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: { tags: { select: { tagId: true } } },
      }),
      db.folder.findMany({ where: { userId: user.id }, orderBy: { position: "asc" } }),
      db.tag.findMany({
        where: { userId: user.id },
        include: { _count: { select: { items: true } } },
      }),
      db.vaultSetting.findUnique({ where: { userId: user.id } }),
      db.notificationPref.findUnique({ where: { userId: user.id } }),
      db.accountDeletion.findUnique({ where: { userId: user.id } }),
      db.deviceApproval.findMany({
        where: { userId: user.id, status: "PENDING", expiresAt: { gt: new Date() } },
        include: { newDevice: { select: { transferPublicKey: true } } },
      }),
    ]);

  const recentlyAdded = await db.device.findMany({
    where: { userId: user.id, revokedAt: null, undoUntil: { gt: new Date() } },
    select: { id: true, name: true, browser: true, undoUntil: true, addedFrom: true },
  });

  return ok({
    user: {
      email: user.email,
      displayName: user.displayName,
      hasRecoveryKit: user.hasRecoveryKit,
      recoverySavedAt: user.recoverySavedAt,
      reverifyAt: user.reverifyAt,
    },
    device,
    items: items.map((i) => ({
      id: i.id,
      type: i.type,
      cipher: i.cipher,
      iv: i.iv,
      folderId: i.folderId,
      favorite: i.favorite,
      hasTotp: i.hasTotp,
      strength: i.strength,
      breached: i.breached,
      reusedKey: i.reusedKey,
      pwChangedAt: i.pwChangedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
      deletedAt: i.deletedAt?.toISOString() ?? null,
      eraseAt: i.eraseAt?.toISOString() ?? null,
      tagIds: i.tags.map((t) => t.tagId),
    })),
    folders: folders.map((f) => ({
      id: f.id,
      cipher: f.nameCipher,
      iv: f.iv,
      color: f.color,
      position: f.position,
    })),
    tags: tags.map((t) => ({
      id: t.id,
      cipher: t.nameCipher,
      iv: t.iv,
      count: t._count.items,
    })),
    settings,
    prefs,
    deletion,
    pendingApprovals: pendingApprovals.map((a) => ({
      id: a.id,
      newDeviceId: a.newDeviceId,
      matchCode: a.matchCode,
      deviceLabel: a.deviceLabel,
      location: a.location,
      requestedAt: a.requestedAt.toISOString(),
      expiresAt: a.expiresAt.toISOString(),
      recipientPublicKey: a.newDevice.transferPublicKey,
    })),
    recentlyAdded: recentlyAdded.map((d) => ({
      ...d,
      undoUntil: d.undoUntil?.toISOString() ?? null,
    })),
  });
});
