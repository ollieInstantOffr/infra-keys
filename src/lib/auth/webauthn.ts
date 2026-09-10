import "server-only";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

const CHALLENGE_COOKIE = "keys_challenge";

/**
 * Challenges live in a short-lived httpOnly cookie rather than a table —
 * they are single-use, per-browser and expire in two minutes, so a row
 * would only add cleanup work.
 */
async function stashChallenge(challenge: string) {
  (await cookies()).set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 120,
  });
}

async function takeChallenge(): Promise<string> {
  const jar = await cookies();
  const value = jar.get(CHALLENGE_COOKIE)?.value;
  if (!value) throw new Error("That request timed out — try again.");
  jar.delete(CHALLENGE_COOKIE);
  return value;
}

/**
 * SimpleWebAuthn types its `extensions` field with its own copy of the DOM
 * types, which predate the PRF extension. One cast, named, rather than an
 * `any` at every call site.
 */
function prfExtensions<T extends PrfExtensionInput>(value: T) {
  return value as unknown as Record<string, unknown>;
}

function expectedOrigin(): string {
  return new URL(env.appUrl).origin;
}

// ------------------------------------------------------------ enrolment

export async function startDeviceEnrolment(userId: string, email: string) {
  const existing = await db.device.findMany({
    where: { userId, revokedAt: null, credentialId: { not: null } },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: env.rpName,
    rpID: env.rpId,
    userName: email,
    userDisplayName: email,
    attestationType: "none",
    authenticatorSelection: {
      // platform authenticator == Touch ID / Face ID / Windows Hello
      authenticatorAttachment: "platform",
      residentKey: "required",
      userVerification: "required",
    },
    excludeCredentials: existing
      .filter((d): d is { credentialId: string; transports: string | null } =>
        Boolean(d.credentialId),
      )
      .map((d) => ({
        id: d.credentialId,
        transports: d.transports
          ? (JSON.parse(d.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
    // PRF gives us 32 deterministic bytes to derive this device's wrapping key
    extensions: prfExtensions({ prf: {} }),
  });

  await stashChallenge(options.challenge);
  return options;
}

export async function finishDeviceEnrolment(args: {
  userId: string;
  response: RegistrationResponseJSON;
  device: { name: string; browser: string; platform: string };
  prfSalt: string;
  usesPrf: boolean;
  wrappedVaultKey: string | null;
  transferPublicKey: string | null;
  addedFrom?: string;
  /**
   * A device row already exists when this browser came in through the
   * approval flow — enrol into it rather than leaving a duplicate behind.
   */
  existingDeviceId?: string | null;
}) {
  const verification = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: await takeChallenge(),
    expectedOrigin: expectedOrigin(),
    expectedRPID: env.rpId,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("That Touch ID enrolment could not be verified.");
  }

  const { credential } = verification.registrationInfo;

  const shared = {
    name: args.device.name,
    browser: args.device.browser,
    platform: args.device.platform,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports
      ? JSON.stringify(credential.transports)
      : null,
    prfSalt: args.prfSalt,
    usesPrf: args.usesPrf,
    wrappedVaultKey: args.wrappedVaultKey,
    transferPublicKey: args.transferPublicKey,
  };

  if (args.existingDeviceId) {
    const owned = await db.device.findFirst({
      where: { id: args.existingDeviceId, userId: args.userId },
      select: { id: true },
    });
    if (owned) {
      return db.device.update({ where: { id: owned.id }, data: shared });
    }
  }

  return db.device.create({
    data: { userId: args.userId, ...shared, addedFrom: args.addedFrom },
  });
}

// -------------------------------------------------------------- unlock

export async function startDeviceAuth(userId?: string) {
  const devices = userId
    ? await db.device.findMany({
        where: { userId, revokedAt: null, credentialId: { not: null } },
        select: { credentialId: true, transports: true },
      })
    : [];

  const options = await generateAuthenticationOptions({
    rpID: env.rpId,
    userVerification: "required",
    allowCredentials: devices
      .filter((d): d is { credentialId: string; transports: string | null } =>
        Boolean(d.credentialId),
      )
      .map((d) => ({
        id: d.credentialId,
        transports: d.transports
          ? (JSON.parse(d.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
  });

  await stashChallenge(options.challenge);
  return options;
}

export async function finishDeviceAuth(response: AuthenticationResponseJSON) {
  const device = await db.device.findUnique({
    where: { credentialId: response.id },
    include: { user: true },
  });

  if (!device || device.revokedAt || !device.publicKey || !device.credentialId) {
    throw new Error("This device is not enrolled.");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: await takeChallenge(),
    expectedOrigin: expectedOrigin(),
    expectedRPID: env.rpId,
    requireUserVerification: true,
    credential: {
      id: device.credentialId,
      publicKey: Buffer.from(device.publicKey, "base64url"),
      counter: device.counter,
      transports: device.transports
        ? (JSON.parse(device.transports) as AuthenticatorTransportFuture[])
        : undefined,
    },
  });

  if (!verification.verified) {
    throw new Error("Touch ID didn't match.");
  }

  await db.device.update({
    where: { id: device.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastSeenAt: new Date(),
    },
  });

  return device;
}
