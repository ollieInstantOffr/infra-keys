import { fail, ok, route } from "@/lib/api";
import { db } from "@/lib/db";

export const POST = route(async ({ user, params }) => {
  const item = await db.vaultItem.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!item) return fail("That item is gone.", 404);

  await db.vaultItem.update({
    where: { id: item.id },
    data: { deletedAt: null, eraseAt: null },
  });
  return ok({ restored: true });
});
