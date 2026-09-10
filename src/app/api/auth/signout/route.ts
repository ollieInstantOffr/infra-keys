import { z } from "zod";
import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";
import { destroySession } from "@/lib/auth/session";

const schema = z.object({
  /** "keep" leaves the vault key enrolled; "remove" wipes this device. */
  mode: z.enum(["keep", "remove"]).default("keep"),
  everywhere: z.boolean().default(false),
});

export const POST = route<{ mode: "keep" | "remove"; everywhere: boolean }>(
  async ({ user, body }) => {
    if (body.everywhere) {
      await db.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    if (body.mode === "remove" && user.deviceId) {
      // destroy the device's copy of the wrapped vault key — it can no
      // longer unlock or approve anything
      await db.device.update({
        where: { id: user.deviceId },
        data: {
          revokedAt: new Date(),
          wrappedVaultKey: null,
          transferPublicKey: null,
        },
      });
      await db.securityEvent.create({
        data: { userId: user.id, kind: "device.removed", detail: "signed out and removed" },
      });
    }

    await destroySession();
    return ok({ removed: body.mode === "remove" });
  },
  { schema },
);
