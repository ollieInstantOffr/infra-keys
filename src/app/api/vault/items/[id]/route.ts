import { z } from "zod";
import { fail, ok, route } from "@/lib/api";
import { db } from "@/lib/db";

const patchSchema = z.object({
  cipher: z.string().min(1).optional(),
  iv: z.string().min(1).optional(),
  folderId: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
  hasTotp: z.boolean().optional(),
  strength: z.number().int().min(0).max(100).nullable().optional(),
  breached: z.boolean().optional(),
  reusedKey: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  /** set when the password itself changed, so history gets a row */
  previous: z.object({ cipher: z.string(), iv: z.string() }).nullish(),
  passwordChanged: z.boolean().optional(),
});

type PatchBody = z.infer<typeof patchSchema>;

export const PATCH = route<PatchBody>(
  async ({ user, body, params }) => {
    const existing = await db.vaultItem.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) return fail("That item is gone.", 404);

    // Keep the previous secret so a bad change can be undone. History is
    // encrypted with the item and dies with it.
    if (body.previous) {
      await db.passwordHistory.create({
        data: {
          itemId: existing.id,
          cipher: body.previous.cipher,
          iv: body.previous.iv,
          usedFrom: existing.pwChangedAt ?? existing.createdAt,
        },
      });
    }

    const { tagIds, previous, passwordChanged, ...rest } = body;

    const item = await db.vaultItem.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(passwordChanged ? { pwChangedAt: new Date() } : {}),
        ...(tagIds
          ? {
              tags: {
                deleteMany: {},
                create: tagIds.map((tagId) => ({ tagId })),
              },
            }
          : {}),
      },
      include: { tags: { select: { tagId: true } } },
    });

    return ok({
      id: item.id,
      updatedAt: item.updatedAt.toISOString(),
      pwChangedAt: item.pwChangedAt?.toISOString() ?? null,
      tagIds: item.tags.map((t) => t.tagId),
    });
  },
  { schema: patchSchema },
);

/** Soft delete — the design keeps trashed items for 30 days. */
export const DELETE = route(async ({ user, params, req }) => {
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";
  const existing = await db.vaultItem.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!existing) return fail("That item is gone.", 404);

  if (permanent) {
    await db.vaultItem.delete({ where: { id: existing.id } });
    return ok({ purged: true });
  }

  const now = new Date();
  await db.vaultItem.update({
    where: { id: existing.id },
    data: { deletedAt: now, eraseAt: new Date(now.getTime() + 30 * 864e5) },
  });

  return ok({
    deletedAt: now.toISOString(),
    eraseAt: new Date(now.getTime() + 30 * 864e5).toISOString(),
  });
});
