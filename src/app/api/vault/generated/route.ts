import { z } from "zod";
import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

/** The generator keeps its last 20 outputs for 24h, encrypted like anything else. */
export const GET = route(async ({ user }) => {
  await db.generatedPassword.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } },
  });

  const rows = await db.generatedPassword.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return ok(
    rows.map((r) => ({
      id: r.id,
      cipher: r.cipher,
      iv: r.iv,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

const schema = z.object({ cipher: z.string(), iv: z.string() });

export const POST = route<z.infer<typeof schema>>(
  async ({ user, body }) => {
    const row = await db.generatedPassword.create({
      data: {
        userId: user.id,
        cipher: body.cipher,
        iv: body.iv,
        expiresAt: new Date(Date.now() + 24 * 3600_000),
      },
    });

    // keep only the newest 20
    const stale = await db.generatedPassword.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: 20,
      select: { id: true },
    });
    if (stale.length) {
      await db.generatedPassword.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
    }

    return ok({ id: row.id });
  },
  { schema },
);
