import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto/server";
import { decryptField } from "@/lib/crypto/server";

export const SESSION_COOKIE = "keys_session";
export const ORIGIN_COOKIE = "keys_origin";
const SESSION_DAYS = 90;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.secureCookies,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(
  userId: string,
  opts: { deviceId?: string | null; reverifyDays?: number } = {},
) {
  const token = randomToken(32);
  const now = Date.now();
  const reverifyDays = opts.reverifyDays ?? 30;

  const session = await db.session.create({
    data: {
      userId,
      deviceId: opts.deviceId ?? null,
      tokenHash: sha256(token),
      expiresAt: new Date(now + SESSION_DAYS * 864e5),
      reverifyAt: new Date(now + reverifyDays * 864e5),
      ua: (await headers()).get("user-agent") ?? undefined,
      ip: await clientIp(),
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86400));
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session
      .updateMany({
        where: { tokenHash: sha256(token) },
        data: { revokedAt: new Date() },
      })
      .catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string | null;
  sessionId: string;
  deviceId: string | null;
  reverifyAt: Date;
  hasRecoveryKit: boolean;
  recoverySavedAt: Date | null;
};

/**
 * Cached per request. Returns null rather than throwing so layouts can
 * decide between redirecting and rendering a public shell.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  // best-effort liveness; never blocks the response on a write failure
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    void db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return {
    id: session.user.id,
    email: decryptField(session.user.emailCipher),
    displayName: session.user.displayName,
    sessionId: session.id,
    deviceId: session.deviceId,
    reverifyAt: session.reverifyAt,
    hasRecoveryKit: Boolean(session.user.recoveryWrappedKey),
    recoverySavedAt: session.user.recoverySavedAt,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
}

/** "Chrome on MacBook Pro" — good enough to show in an approval prompt. */
export function describeClient(ua: string | null | undefined) {
  const s = ua ?? "";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\//.test(s)
      ? "Opera"
      : /Firefox\//.test(s)
        ? "Firefox"
        : /Chrome\//.test(s)
          ? "Chrome"
          : /Safari\//.test(s)
            ? "Safari"
            : "Browser";

  const platform = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s)
      ? "iPad"
      : /Android/.test(s)
        ? "Android"
        : /Mac OS X/.test(s)
          ? "Mac"
          : /Windows/.test(s)
            ? "Windows PC"
            : /Linux/.test(s)
              ? "Linux"
              : "Device";

  const name = platform === "Mac" ? "MacBook" : platform;
  return { browser, platform, name, label: `${browser} on ${name}` };
}
