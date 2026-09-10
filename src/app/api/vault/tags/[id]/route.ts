import { fail, ok, route } from "@/lib/api";
import { db } from "@/lib/db";

export const DELETE = route(async ({ user, params }) => {
  const tag = await db.tag.findFirst({ where: { id: params.id, userId: user.id } });
  if (!tag) return fail("That tag is gone.", 404);
  await db.tag.delete({ where: { id: tag.id } });
  return ok({ deleted: true });
});
