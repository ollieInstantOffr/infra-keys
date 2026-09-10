import { z } from "zod";
import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({
  vault: z
    .object({
      autoLockSeconds: z.number().int().min(0).max(86400).optional(),
      clipboardSeconds: z.number().int().min(0).max(600).optional(),
      lockOnBlur: z.boolean().optional(),
      breachMonitoring: z.boolean().optional(),
      reverifyDays: z.number().int().min(1).max(365).optional(),
      offlineEnabled: z.boolean().optional(),
      weeklyBackup: z.boolean().optional(),
    })
    .optional(),
  notifications: z
    .object({
      breachEmail: z.boolean().optional(),
      breachInApp: z.boolean().optional(),
      digestEmail: z.boolean().optional(),
      trashEmail: z.boolean().optional(),
      nativeNotifs: z.boolean().optional(),
    })
    .optional(),
  profile: z
    .object({
      displayName: z.string().max(80).nullable().optional(),
      locale: z.string().max(12).optional(),
      appearance: z.enum(["light", "dark", "system"]).optional(),
    })
    .optional(),
});

export const PATCH = route<z.infer<typeof schema>>(
  async ({ user, body }) => {
    if (body.vault) {
      await db.vaultSetting.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...body.vault },
        update: body.vault,
      });
    }
    if (body.notifications) {
      await db.notificationPref.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...body.notifications },
        update: body.notifications,
      });
    }
    if (body.profile) {
      await db.user.update({ where: { id: user.id }, data: body.profile });
    }
    return ok({ saved: true });
  },
  { schema },
);
