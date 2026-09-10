import { fail, ok, route } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(async ({ user, params }) => {
  const item = await db.vaultItem.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!item) return fail("That item is gone.", 404);

  const history = await db.passwordHistory.findMany({
    where: { itemId: item.id },
    orderBy: { usedUntil: "desc" },
    take: 20,
  });

  return ok(
    history.map((h) => ({
      id: h.id,
      cipher: h.cipher,
      iv: h.iv,
      usedFrom: h.usedFrom.toISOString(),
      usedUntil: h.usedUntil.toISOString(),
    })),
  );
});
