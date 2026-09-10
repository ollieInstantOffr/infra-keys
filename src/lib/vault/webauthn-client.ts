"use client";

import {
  startAuthentication,
  startRegistration,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import { deviceKeyFromPrf, fromB64 } from "@/lib/crypto/vault";

/**
 * Touch ID plumbing.
 *
 * The interesting part is the PRF extension: it hands back 32 bytes that only
 * this authenticator can reproduce, and only after the user actually touches
 * the sensor. That becomes the key that wraps the vault key, which is why the
 * vault key can live on the device without ever being written down.
 *
 * Browsers without PRF (older Safari, some Linux builds) fall back to a
 * device secret held in IndexedDB and gated behind the same user-verification
 * ceremony. That is weaker — the secret is on disk — so the UI says so.
 */

const FALLBACK_DB = "keys-device";
const FALLBACK_STORE = "secret";

export async function touchIdAvailable(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false;
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/**
 * WebAuthn throws bare DOMExceptions whose messages are useless to a person
 * ("The operation either timed out or was not allowed"). Translate the ones
 * that actually happen into something a user can act on.
 */
export function describeWebAuthnError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  const message = error instanceof Error ? error.message : "";

  switch (name) {
    case "NotAllowedError":
      return "Touch ID was cancelled or timed out. Try again when you're ready.";
    case "InvalidStateError":
      return "This device is already enrolled. Sign in with Touch ID instead.";
    case "NotSupportedError":
      return "This browser can't use Touch ID for keys.";
    case "SecurityError":
      return (
        "The site's address doesn't match what Touch ID expects. " +
        "keys must be served over HTTPS on the host set as RP_ID."
      );
    case "AbortError":
      return "That Touch ID request was interrupted.";
    case "ConstraintError":
      return "This device can't satisfy the security requirements keys asks for.";
    default:
      return message || "Touch ID didn't finish.";
  }
}

// ------------------------------------------------------- fallback secret

function fallbackStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FALLBACK_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FALLBACK_STORE);
    req.onsuccess = () =>
      resolve(req.result.transaction(FALLBACK_STORE, mode).objectStore(FALLBACK_STORE));
    req.onerror = () => reject(req.error);
  });
}

async function fallbackSecret(credentialId: string, create: boolean): Promise<Uint8Array> {
  const store = await fallbackStore(create ? "readwrite" : "readonly");
  const existing = await new Promise<Uint8Array | undefined>((resolve, reject) => {
    const req = store.get(credentialId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (existing) return existing;
  if (!create) throw new Error("This browser has no key for that credential.");

  const secret = crypto.getRandomValues(new Uint8Array(32));
  const writable = await fallbackStore("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = writable.put(secret, credentialId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return secret;
}

export async function forgetFallbackSecrets(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(FALLBACK_DB);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

// --------------------------------------------------------------- helpers

type PrfResults = {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
};

function readPrf(results: unknown): ArrayBuffer | null {
  const prf = (results as PrfResults | undefined)?.prf;
  const first = prf?.results?.first;
  return first instanceof ArrayBuffer ? first : null;
}

/** Extension results contain ArrayBuffers that must not reach the server. */
function stripExtensions<T extends { clientExtensionResults?: unknown }>(response: T): T {
  return { ...response, clientExtensionResults: {} };
}

/** See the note in src/types/webauthn-prf.d.ts. */
function prfExtensions<T extends PrfExtensionInput>(value: T) {
  return value as unknown as Record<string, unknown>;
}

// ------------------------------------------------------------ enrolment

export type Enrolment = {
  response: unknown;
  deviceKey: CryptoKey;
  prfSalt: string;
  usesPrf: boolean;
};

/** What the server hands back from GET /api/webauthn/register. */
export type EnrolmentOptions = Parameters<
  typeof startRegistration
>[0]["optionsJSON"] & { prfSalt: string; rpId: string };

/**
 * The Touch ID enrolment ceremony.
 *
 * Modern browsers evaluate PRF during create() and hand the output straight
 * back, which is one prompt. Older ones only report `prf.enabled` and need a
 * second, immediate get() to actually produce the bytes. Both paths end with
 * the same 32 bytes; only the prompt count differs.
 */
export async function enrolDevice(options: EnrolmentOptions): Promise<Enrolment> {
  const { prfSalt, rpId, ...rest } = options;

  const response = await startRegistration({
    optionsJSON: {
      ...rest,
      extensions: prfExtensions({
        ...rest.extensions,
        prf: { eval: { first: fromB64(prfSalt) as BufferSource } },
      }),
    },
  });

  const results = response.clientExtensionResults as PrfResults | undefined;

  // Path 1 — the output came back with the credential.
  const direct = readPrf(results);
  if (direct) {
    return {
      response: stripExtensions(response),
      deviceKey: await deviceKeyFromPrf(direct),
      prfSalt,
      usesPrf: true,
    };
  }

  // Path 2 — PRF is supported but wasn't evaluated at creation.
  if (results?.prf?.enabled) {
    const prf = await evaluatePrf(response.id, prfSalt, rpId);
    if (prf) {
      return {
        response: stripExtensions(response),
        deviceKey: await deviceKeyFromPrf(prf),
        prfSalt,
        usesPrf: true,
      };
    }
  }

  // Path 3 — no PRF at all. Weaker, and the UI says so.
  const secret = await fallbackSecret(response.id, true);
  return {
    response: stripExtensions(response),
    deviceKey: await deviceKeyFromPrf(secret.buffer as ArrayBuffer),
    prfSalt,
    usesPrf: false,
  };
}

/** A bare get() whose only purpose is to read the PRF output. */
async function evaluatePrf(
  credentialId: string,
  saltB64: string,
  rpId: string,
): Promise<ArrayBuffer | null> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        userVerification: "required",
        allowCredentials: [
          { id: fromB64(credentialId) as BufferSource, type: "public-key" },
        ],
        extensions: prfExtensions({
          prf: { eval: { first: fromB64(saltB64) as BufferSource } },
        }) as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    return credential ? readPrf(credential.getClientExtensionResults()) : null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- unlock

export type UnlockCeremony = {
  response: unknown;
  credentialId: string;
  /** Present once the server tells us which salt this credential uses. */
  deviceKeyFor: (prfSalt: string, usesPrf: boolean) => Promise<CryptoKey>;
};

/**
 * Touch ID for unlock. Runs the assertion with a PRF evaluation attached so a
 * single prompt both proves presence and yields the wrapping key.
 */
export async function unlockCeremony(
  options: Parameters<typeof startAuthentication>[0]["optionsJSON"],
  prfSalt: string,
): Promise<{ response: unknown; credentialId: string; prf: ArrayBuffer | null }> {
  const response = await startAuthentication({
    optionsJSON: {
      ...options,
      extensions: prfExtensions({
        ...options.extensions,
        prf: { eval: { first: fromB64(prfSalt) as BufferSource } },
      }),
    },
  });

  return {
    response: stripExtensions(response),
    credentialId: response.id,
    prf: readPrf(response.clientExtensionResults),
  };
}

export async function deviceKeyFor(
  credentialId: string,
  prf: ArrayBuffer | null,
): Promise<CryptoKey> {
  if (prf) return deviceKeyFromPrf(prf);
  const secret = await fallbackSecret(credentialId, false);
  return deviceKeyFromPrf(secret.buffer as ArrayBuffer);
}
