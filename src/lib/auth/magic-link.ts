import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import {
  blindIndex,
  encryptField,
  numericCode,
  randomToken,
  sha256,
} from "@/lib/crypto/server";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { magicLinkEmail, welcomeEmail } from "@/lib/email/templates";
import { clientIp, describeClient, ORIGIN_COOKIE } from "./session";
import { rateLimit } from "./rate-limit";

export const LINK_TTL_MINUTES = 10;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryAfter = 0,
  ) {
    super(message);
  }
}

/**
 * Creates (or finds) the account and emails a one-time link.
 *
 * The same link signs in and signs up — the design is explicit that there is
 * no separate registration step.
 */
export async function requestMagicLink(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("That doesn't look like an email address.", "INVALID_EMAIL");
  }

  const ip = await clientIp();
  const byIp = await rateLimit(`link:ip:${ip ?? "unknown"}`, 10, 15 * 60_000);
  if (!byIp.ok) {
    throw new AuthError(
      "Too many links requested. Try again in a few minutes.",
      "RATE_LIMITED",
      byIp.retryAfter,
    );
  }
  const byEmail = await rateLimit(`link:email:${blindIndex(email)}`, 5, 15 * 60_000);
  if (!byEmail.ok) {
    throw new AuthError(
      "Too many links requested for that address.",
      "RATE_LIMITED",
      byEmail.retryAfter,
    );
  }

  const emailHash = blindIndex(email);
  let user = await db.user.findUnique({ where: { emailHash } });
  const isNewAccount = !user;

  if (!user) {
    user = await db.user.create({
      data: {
        emailHash,
        emailCipher: encryptField(email),
        prefs: { create: {} },
        settings: { create: {} },
      },
    });
  }

  const ua = (await headers()).get("user-agent");
  const client = describeClient(ua);

  const token = randomToken(32);
  const code = numericCode(6);
  const originHandle = randomToken(16);

  await db.magicLink.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      code,
      expiresAt: new Date(Date.now() + LINK_TTL_MINUTES * 60_000),
      originUa: ua ?? undefined,
      originIp: ip,
      originLabel: client.label,
      originHandle,
    },
  });

  // The asking browser gets an opaque handle. When the link is opened
  // somewhere else, the handle won't match and we show the match code
  // instead of silently signing in the wrong device.
  (await cookies()).set(ORIGIN_COOKIE, originHandle, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.secureCookies,
    path: "/",
    maxAge: LINK_TTL_MINUTES * 60,
  });

  await sendEmail(
    magicLinkEmail({
      to: email,
      href: `${env.appUrl}/auth/verify?token=${token}`,
      code,
      clientLabel: client.label,
    }),
  );

  if (isNewAccount) {
    await sendEmail(welcomeEmail({ to: email })).catch(() => {
      // welcome mail is nice-to-have; never block sign-in on it
    });
  }

  return { email, expiresAt: Date.now() + LINK_TTL_MINUTES * 60_000 };
}

/**
 * The cross-device path: the user typed the 6-digit code back on the browser
 * that asked for the link.
 */
export async function verifyCrossDeviceCode(code: string) {
  const handle = (await cookies()).get(ORIGIN_COOKIE)?.value;
  if (!handle) throw new AuthError("Start again from this device.", "NO_ORIGIN");

  const limited = await rateLimit(`code:${handle}`, 5, 15 * 60_000);
  if (!limited.ok) {
    throw new AuthError("Too many tries. Request a new link.", "RATE_LIMITED", limited.retryAfter);
  }

  const link = await db.magicLink.findUnique({
    where: { originHandle: handle },
    include: { user: { include: { devices: true } } },
  });

  if (!link || link.usedAt || link.expiresAt < new Date()) {
    throw new AuthError("That code has expired.", "EXPIRED");
  }
  if (link.code !== code.replace(/\D/g, "")) {
    throw new AuthError("That code doesn't match.", "BAD_CODE");
  }

  await db.magicLink.update({
    where: { id: link.id },
    data: { usedAt: new Date() },
  });

  return {
    userId: link.userId,
    isFirstDevice: link.user.devices.filter((d) => !d.revokedAt).length === 0,
  };
}
