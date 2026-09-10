import { z } from "zod";
import { fail, ok, route } from "@/lib/api";
import { db } from "@/lib/db";

const patchSchema = z.object({
  cipher: z.string().optional(),
  iv: z.string().optional(),
  color: z.string().optional(),
  position: z.number().int().optional(),
});

export const PATCH = route<z.infer<typeof patchSchema>>(
  async ({ user, body, params }) => {
    const folder = await db.folder.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!folder) return fail("That folder is gone.", 404);

    await db.folder.update({
      where: { id: folder.id },
      data: {
        ...(body.cipher ? { nameCipher: body.cipher } : {}),
        ...(body.iv ? { iv: body.iv } : {}),
        ...(body.color ? { color: body.color } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
      },
    });
    return ok({ id: folder.id });
  },
  { schema: patchSchema },
);

/** Deleting a folder moves its items to "No folder", never to trash. */
export const DELETE = route(async ({ user, params }) => {
  const folder = await db.folder.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!folder) return fail("That folder is gone.", 404);

  await db.$transaction([
    db.vaultItem.updateMany({
      where: { folderId: folder.id },
      data: { folderId: null },
    }),
    db.folder.delete({ where: { id: folder.id } }),
  ]);

  return ok({ deleted: true });
});
