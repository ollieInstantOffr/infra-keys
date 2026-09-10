import { z } from "zod";
import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

const createSchema = z.object({
  cipher: z.string().min(1),
  iv: z.string().min(1),
  /** blind index so the same tag name collapses to one row */
  nameHash: z.string().min(8),
});

export const POST = route<z.infer<typeof createSchema>>(
  async ({ user, body }) => {
    const tag = await db.tag.upsert({
      where: { userId_nameHash: { userId: user.id, nameHash: body.nameHash } },
      create: {
        userId: user.id,
        nameCipher: body.cipher,
        iv: body.iv,
        nameHash: body.nameHash,
      },
      update: {},
    });
    return ok({ id: tag.id });
  },
  { schema: createSchema },
);
