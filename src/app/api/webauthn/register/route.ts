import { z } from "zod";
import { ok, route } from "@/lib/api";
import { db } from "@/lib/db";
import { describeClient, clientIp } from "@/lib/auth/session";
import { startDeviceEnrolment, finishDeviceEnrolment } from "@/lib/auth/webauthn";
import { sendEmail } from "@/lib/email/send";
import { newDeviceEmail } from "@/lib/email/templates";
import { headers } from "next/headers";

/** Step 1 — hand the browser a challenge. */
export const GET = route(async ({ user }) => {
  const options = await startDeviceEnrolment(user.id, user.email);
  return ok(options);
});

const schema = z.object({
  response: z.any(),
  prfSalt: z.string().min(8),
  usesPrf: z.boolean(),
  /** vaultKey wrapped by this device's key — the server can't open it */
  wrappedVaultKey: z.string().nullable(),
  transferPublicKey: z.string().nullable(),
  /** set when this browser already has a device row from the approval flow */
  deviceId: z.string().nullish(),
  /** set when this is the very first device and the vault was just created */
  recovery: z
    .object({
      wrappedKey: z.string(),
      salt: z.string(),
      hint: z.string(),
    })
    .nullish(),
});

type Body = z.infer<typeof schema>;

/** Step 2 — verify the attestation and store the wrapped key. */
export const POST = route<Body>(
  async ({ user, body }) => {
    const ua = (await headers()).get("user-agent");
    const client = describeClient(ua);

    const existing = await db.device.count({
      where: { userId: user.id, revokedAt: null, credentialId: { not: null } },
    });
    const isFirstDevice = existing === 0;

    const device = await finishDeviceEnrolment({
      userId: user.id,
      response: body.response,
      device: {
        name: client.name,
        browser: client.browser,
        platform: client.platform,
      },
      prfSalt: body.prfSalt,
      usesPrf: body.usesPrf,
      wrappedVaultKey: body.wrappedVaultKey,
      transferPublicKey: body.transferPublicKey,
      addedFrom: (await clientIp()) ?? undefined,
      existingDeviceId: body.deviceId ?? user.deviceId,
    });

    if (body.recovery) {
      await db.user.update({
        where: { id: user.id },
        data: {
          recoveryWrappedKey: body.recovery.wrappedKey,
          recoverySalt: body.recovery.salt,
          recoveryHint: body.recovery.hint,
          recoveryCreatedAt: new Date(),
          vaultCreatedAt: new Date(),
        },
      });
    }

    // bind the current session to the device it just enrolled
    await db.session.update({
      where: { id: user.sessionId },
      data: { deviceId: device.id },
    });

    await db.securityEvent.create({
      data: {
        userId: user.id,
        kind: "device.enrolled",
        detail: `${client.label}${body.usesPrf ? "" : " (no PRF — device secret fallback)"}`,
      },
    });

    // Every device addition emails the account; any device can undo it
    // within 24 hours.
    if (!isFirstDevice) {
      await db.device.update({
        where: { id: device.id },
        data: { undoUntil: new Date(Date.now() + 24 * 3600_000) },
      });

      await sendEmail(
        newDeviceEmail({
          to: user.email,
          approvedFrom: client.name,
          deviceId: device.id,
          facts: [
            { k: "Device", v: client.label },
            { k: "Near", v: device.addedFrom ?? "unknown location" },
            { k: "When", v: new Date().toUTCString() },
          ],
        }),
      ).catch(() => {});
    }

    return ok({ deviceId: device.id, isFirstDevice });
  },
  { schema },
);
