"use client";

import {
  startAuthentication,
  startRegistration,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import { deviceKeyFromPrf, fromB64, toB64 } from "@/lib/crypto/vault";

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
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
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

export function newPrfSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(32)));
}

// ------------------------------------------------------------ enrolment

export type Enrolment = {
  response: unknown;
  deviceKey: CryptoKey;
  prfSalt: string;
  usesPrf: boolean;
};

/**
 * Runs the create() ceremony, then immediately runs a get() to read the PRF
 * output for the credential we just made. Two prompts on some platforms, one
 * on most — and it is the only portable way to obtain PRF at enrolment.
 */
export async function enrolDevice(options: Parameters<typeof startRegistration>[0]["optionsJSON"]): Promise<Enrolment> {
  const prfSalt = newPrfSalt();

  const response = await startRegistration({
    optionsJSON: {
      ...options,
      extensions: prfExtensions({ ...options.extensions, prf: {} }),
    },
  });

  const prfEnabled = Boolean(
    (response.clientExtensionResults as PrfResults | undefined)?.prf?.enabled,
  );

  if (prfEnabled) {
    const prf = await evaluatePrf(response.id, prfSalt);
    if (prf) {
      return {
        response: stripExtensions(response),
        deviceKey: await deviceKeyFromPrf(prf),
        prfSalt,
        usesPrf: true,
      };
    }
  }

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
): Promise<ArrayBuffer | null> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        userVerification: "required",
        allowCredentials: [
          { id: fromB64(credentialId) as BufferSource, type: "public-key" },
        ],
        extensions: {
          prf: { eval: { first: fromB64(saltB64) as BufferSource } },
        } as AuthenticationExtensionsClientInputs,
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
