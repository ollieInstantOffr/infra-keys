import { z } from "zod";
import { headers } from "next/headers";
import { fail, ok, route } from "@/lib/api";
import { db } from "@/lib/db";
import { numericCode } from "@/lib/crypto/server";
import { clientIp, describeClient } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/send";
import { approvalRequestEmail } from "@/lib/email/templates";

const APPROVAL_TTL_MINUTES = 15;

const requestSchema = z.object({
  /** the new device's ECDH public key, so the approver can seal the vault key */
  transferPublicKey: z.string().min(10),
});

/**
 * Layer 1 of recovery: this device has an account session but no vault key.
 * It publishes a transfer key and waits for an enrolled device to hand the
 * vault key over, end-to-end encrypted.
 */
export const POST = route<z.infer<typeof requestSchema>>(
  async ({ user, body }) => {
    const ua = (await headers()).get("user-agent");
    const client = describeClient(ua);
    const ip = await clientIp();

    // reuse the device row bound to this session if there is one
    let device = user.deviceId
      ? await db.device.findUnique({ where: { id: user.deviceId } })
      : null;

    if (device) {
      device = await db.device.update({
        where: { id: device.id },
        data: { transferPublicKey: body.transferPublicKey },
      });
    } else {
      device = await db.device.create({
        data: {
          userId: user.id,
          name: client.name,
          browser: client.browser,
          platform: client.platform,
          transferPublicKey: body.transferPublicKey,
          addedFrom: ip,
        },
      });
      await db.session.update({
        where: { id: user.sessionId },
        data: { deviceId: device.id },
      });
    }

    const existing = await db.deviceApproval.findFirst({
      where: {
        userId: user.id,
        newDeviceId: device.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      return ok({
        id: existing.id,
        matchCode: existing.matchCode,
        expiresAt: existing.expiresAt.toISOString(),
      });
    }

    const approval = await db.deviceApproval.create({
      data: {
        userId: user.id,
        newDeviceId: device.id,
        matchCode: numericCode(6),
        deviceLabel: client.label,
        location: ip ?? null,
        expiresAt: new Date(Date.now() + APPROVAL_TTL_MINUTES * 60_000),
      },
    });

    await sendEmail(
      approvalRequestEmail({
        to: user.email,
        deviceLabel: client.label,
        location: ip ?? "an unknown location",
        code: approval.matchCode,
      }),
    ).catch(() => {});

    return ok({
      id: approval.id,
      matchCode: approval.matchCode,
      expiresAt: approval.expiresAt.toISOString(),
    });
  },
  { schema: requestSchema },
);

/** The new device polls this until an approver seals the key for it. */
export const GET = route(async ({ user, req }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Missing approval id.", 400);

  const approval = await db.deviceApproval.findFirst({
    where: { id, userId: user.id },
  });
  if (!approval) return fail("That request is gone.", 404);

  if (approval.status === "PENDING" && approval.expiresAt < new Date()) {
    await db.deviceApproval.update({
      where: { id: approval.id },
      data: { status: "EXPIRED" },
    });
    return ok({ status: "EXPIRED", sealedKey: null });
  }

  return ok({ status: approval.status, sealedKey: approval.sealedKey });
});

const resolveSchema = z.object({
  id: z.string(),
  decision: z.enum(["approve", "block"]),
  /** vaultKey sealed to the requesting device's transfer key */
  sealedKey: z.string().nullish(),
});

/** Run on an already-enrolled device, after Touch ID and code comparison. */
export const PUT = route<z.infer<typeof resolveSchema>>(
  async ({ user, body }) => {
    const approval = await db.deviceApproval.findFirst({
      where: { id: body.id, userId: user.id, status: "PENDING" },
      include: { newDevice: true },
    });
    if (!approval) return fail("That request is no longer waiting.", 404);
    if (approval.expiresAt < new Date()) return fail("That request expired.", 410);

    if (body.decision === "block") {
      await db.$transaction([
        db.deviceApproval.update({
          where: { id: approval.id },
          data: { status: "BLOCKED", resolvedAt: new Date(), approverId: user.deviceId },
        }),
        db.device.update({
          where: { id: approval.newDeviceId },
          data: { revokedAt: new Date(), transferPublicKey: null },
        }),
        db.session.updateMany({
          where: { deviceId: approval.newDeviceId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        db.securityEvent.create({
          data: {
            userId: user.id,
            kind: "device.blocked",
            detail: approval.deviceLabel,
          },
        }),
      ]);
      return ok({ status: "BLOCKED" });
    }

    if (!body.sealedKey) return fail("Nothing to hand over.", 400);

    await db.$transaction([
      db.deviceApproval.update({
        where: { id: approval.id },
        data: {
          status: "APPROVED",
          sealedKey: body.sealedKey,
          resolvedAt: new Date(),
          approverId: user.deviceId,
        },
      }),
      db.device.update({
        where: { id: approval.newDeviceId },
        data: { undoUntil: new Date(Date.now() + 24 * 3600_000) },
      }),
      db.securityEvent.create({
        data: {
          userId: user.id,
          kind: "device.approved",
          detail: approval.deviceLabel,
        },
      }),
    ]);

    return ok({ status: "APPROVED" });
  },
  { schema: resolveSchema },
);
