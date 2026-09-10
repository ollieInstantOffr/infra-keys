import { z } from "zod";
import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

const createSchema = z.object({
  type: z.enum(["PASSWORD", "NOTE"]),
  cipher: z.string().min(1),
  iv: z.string().min(1),
  folderId: z.string().nullable().default(null),
  favorite: z.boolean().default(false),
  hasTotp: z.boolean().default(false),
  strength: z.number().int().min(0).max(100).nullable().default(null),
  breached: z.boolean().default(false),
  reusedKey: z.string().nullable().default(null),
  tagIds: z.array(z.string()).default([]),
});

type CreateBody = z.infer<typeof createSchema>;

export const POST = route<CreateBody>(
  async ({ user, body }) => {
    const item = await db.vaultItem.create({
      data: {
        userId: user.id,
        type: body.type,
        cipher: body.cipher,
        iv: body.iv,
        folderId: body.folderId,
        favorite: body.favorite,
        hasTotp: body.hasTotp,
        strength: body.strength,
        breached: body.breached,
        reusedKey: body.reusedKey,
        pwChangedAt: body.type === "PASSWORD" ? new Date() : null,
        tags: { create: body.tagIds.map((tagId) => ({ tagId })) },
      },
      include: { tags: { select: { tagId: true } } },
    });

    return ok({
      id: item.id,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      pwChangedAt: item.pwChangedAt?.toISOString() ?? null,
      tagIds: item.tags.map((t) => t.tagId),
    });
  },
  { schema: createSchema },
);
