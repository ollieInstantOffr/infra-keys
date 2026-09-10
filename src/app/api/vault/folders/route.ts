import { z } from "zod";
import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

const createSchema = z.object({
  cipher: z.string().min(1),
  iv: z.string().min(1),
  color: z.string().default("#78716c"),
});

export const POST = route<z.infer<typeof createSchema>>(
  async ({ user, body }) => {
    const count = await db.folder.count({ where: { userId: user.id } });
    const folder = await db.folder.create({
      data: {
        userId: user.id,
        nameCipher: body.cipher,
        iv: body.iv,
        color: body.color,
        position: count,
      },
    });
    return ok({ id: folder.id, position: folder.position });
  },
  { schema: createSchema },
);
