import { z } from "zod";
import { ok, route, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { blindIndex } from "@/lib/crypto/server";
import { startDeviceAuth, finishDeviceAuth } from "@/lib/auth/webauthn";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * Options for an unlock ceremony. Works signed in (unlocking a locked vault)
 * and signed out (Touch ID sign-in from the welcome-back screen), in which
 * case the browser picks a discoverable credential.
 */
export const POST = route(
  async ({ user }) => {
    const options = await startDeviceAuth(user?.id);

    // If we know the user we can tell the browser which salt to evaluate.
    const device = user?.deviceId
      ? await db.device.findUnique({
          where: { id: user.deviceId },
          select: { prfSalt: true, usesPrf: true },
        })
      : null;

    return ok({ options, prfSalt: device?.prfSalt ?? null });
  },
  { auth: false },
);

const verifySchema = z.object({ response: z.any() });

export const PUT = route<{ response: unknown }>(
  async ({ body }) => {
    const limited = rateLimit(
      `unlock:${(body.response as { id?: string })?.id ?? "unknown"}`,
      10,
      10 * 60_000,
    );
    if (!limited.ok) {
      return fail("Too many attempts. Sign in with a link instead.", 429, {
        code: "TOUCH_ID_PAUSED",
      });
    }

    const device = await finishDeviceAuth(body.response as never);

    // sign-in-with-Touch-ID: mint a session if there isn't one
    const current = await getCurrentUser();
    if (!current) {
      await createSession(device.userId, { deviceId: device.id });
    } else if (current.deviceId !== device.id) {
      await db.session.update({
        where: { id: current.sessionId },
        data: { deviceId: device.id },
      });
    }

    return ok({
      deviceId: device.id,
      prfSalt: device.prfSalt,
      usesPrf: device.usesPrf,
      wrappedVaultKey: device.wrappedVaultKey,
    });
  },
  { schema: verifySchema, auth: false },
);
