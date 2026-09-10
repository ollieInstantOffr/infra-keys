import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto/server";
import { createSession, ORIGIN_COOKIE } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function to(path: string) {
  return NextResponse.redirect(new URL(path, env.appUrl));
}

/**
 * The link in the email lands here. Three outcomes, each with a screen:
 * expired or already used, opened somewhere other than the browser that
 * asked for it, or a clean sign-in.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const adopt = url.searchParams.get("adopt") === "1";

  if (!token) return to("/signin");

  const link = await db.magicLink.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { devices: { where: { revokedAt: null } } } } },
  });

  if (!link || link.usedAt || link.expiresAt < new Date()) {
    return to("/signin/expired");
  }

  // The browser that asked for the link holds an opaque handle. A mismatch
  // means the link was opened elsewhere — show the match code rather than
  // signing in a device the user didn't start from.
  const handle = (await cookies()).get(ORIGIN_COOKIE)?.value;
  if (handle !== link.originHandle && !adopt) {
    const params = new URLSearchParams({
      code: link.code,
      from: link.originLabel ?? "the device you started from",
      token,
    });
    return to(`/signin/other-device?${params}`);
  }

  await db.magicLink.update({
    where: { id: link.id },
    data: { usedAt: new Date() },
  });

  // A cancel-erase link does one job and stops.
  if (link.purpose === "cancel-erase") {
    await db.accountDeletion.updateMany({
      where: { userId: link.userId, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    await createSession(link.userId);
    return to("/vault?erase=cancelled");
  }

  const enrolled = link.user.devices.filter((d) => d.credentialId);
  await createSession(link.userId, {
    deviceId: enrolled.length === 1 ? enrolled[0].id : undefined,
  });

  // Brand new account: make a vault and set up Touch ID.
  if (enrolled.length === 0 && !link.user.recoveryWrappedKey) {
    return to("/setup/touch-id");
  }

  // The vault exists; this browser may or may not hold a key for it. The
  // unlock screen sorts that out from the bootstrap payload.
  return to("/unlock");
}
