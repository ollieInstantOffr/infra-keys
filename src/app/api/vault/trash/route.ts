import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

/** Empty trash. Irreversible — the dialog makes the user type DELETE. */
export const DELETE = route(async ({ user }) => {
  const { count } = await db.vaultItem.deleteMany({
    where: { userId: user.id, deletedAt: { not: null } },
  });
  await db.securityEvent.create({
    data: { userId: user.id, kind: "trash.emptied", detail: `${count} items` },
  });
  return ok({ purged: count });
});
