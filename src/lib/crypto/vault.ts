/**
 * End-to-end vault crypto. Runs in the browser only.
 *
 * The model (see the "Recovery" section of the design):
 *
 *   vaultKey            AES-256-GCM. Encrypts every item. Never leaves the device
 *                       in the clear and is never sent to the server.
 *   deviceKey           Derived from the WebAuthn PRF output for this device's
 *                       Touch ID credential. Wraps vaultKey → `wrappedVaultKey`.
 *   recoveryKey         Derived from the printed 24-character recovery code.
 *                       Wraps vaultKey → `recoveryWrappedKey`.
 *   transfer keypair    ECDH P-256. A new device publishes the public half; an
 *                       already-enrolled device derives a shared secret and
 *                       re-wraps vaultKey for it. The server only ever relays
 *                       the sealed blob.
 *
 * Everything below is WebCrypto — no third-party crypto in the bundle.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export type Sealed = { cipher: string; iv: string };

// ------------------------------------------------------------- base64url

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64(value: string): Uint8Array {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

// ------------------------------------------------------------- vault key

export async function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function importVaultKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportVaultKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

// -------------------------------------------------------- seal / unseal

/** AES-256-GCM. `aad` binds the ciphertext to a record id where useful. */
export async function seal(
  key: CryptoKey,
  plaintext: string,
  aad?: string,
): Promise<Sealed> {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      ...(aad ? { additionalData: enc.encode(aad) } : {}),
    },
    key,
    enc.encode(plaintext),
  );
  return { cipher: toB64(cipher), iv: toB64(iv) };
}

export async function unseal(
  key: CryptoKey,
  sealed: Sealed,
  aad?: string,
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromB64(sealed.iv) as BufferSource,
      ...(aad ? { additionalData: enc.encode(aad) } : {}),
    },
    key,
    fromB64(sealed.cipher) as BufferSource,
  );
  return dec.decode(plain);
}

export async function sealJson<T>(key: CryptoKey, value: T, aad?: string) {
  return seal(key, JSON.stringify(value), aad);
}

export async function unsealJson<T>(
  key: CryptoKey,
  sealed: Sealed,
  aad?: string,
): Promise<T> {
  return JSON.parse(await unseal(key, sealed, aad)) as T;
}

// --------------------------------------------------------- key wrapping

/** Wraps the vault key with any AES key, producing one opaque string. */
export async function wrapVaultKey(
  wrapping: CryptoKey,
  vaultKey: CryptoKey,
): Promise<string> {
  const raw = await exportVaultKey(vaultKey);
  const { cipher, iv } = await seal(wrapping, toB64(raw));
  return `${iv}.${cipher}`;
}

export async function unwrapVaultKey(
  wrapping: CryptoKey,
  wrapped: string,
): Promise<CryptoKey> {
  const [iv, cipher] = wrapped.split(".");
  if (!iv || !cipher) throw new Error("Malformed wrapped key");
  const rawB64 = await unseal(wrapping, { cipher, iv });
  return importVaultKey(fromB64(rawB64));
}

// ----------------------------------------------------------- device key

/**
 * The WebAuthn PRF extension hands us 32 bytes that only this authenticator,
 * for this credential, can reproduce — and only after a successful user
 * verification (the Touch ID prompt). HKDF turns it into an AES key.
 */
export async function deviceKeyFromPrf(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("keys.device.v1"),
      info: enc.encode("vault-key-wrapping"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// --------------------------------------------------------- recovery code

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I O 0 1
const RECOVERY_GROUPS = 6;
const RECOVERY_GROUP_LEN = 4;

/** e.g. "K7QM-3XRD-98HT VN2P-LC6W-Q4BZ" — 24 characters, 120 bits. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_GROUPS * RECOVERY_GROUP_LEN);
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % 32]);
  const groups: string[] = [];
  for (let i = 0; i < RECOVERY_GROUPS; i++) {
    groups.push(chars.slice(i * 4, i * 4 + 4).join(""));
  }
  return `${groups.slice(0, 3).join("-")} ${groups.slice(3).join("-")}`;
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "K7QM-••••-••••  ••••-••••-Q4BZ" for the settings screen. */
export function recoveryHint(code: string): string {
  const flat = normalizeRecoveryCode(code);
  const first = flat.slice(0, 4);
  const last = flat.slice(-4);
  return `${first}-••••-••••  ••••-••••-${last}`;
}

/**
 * PBKDF2-SHA512, 600k iterations — the OWASP 2023 floor. The code carries
 * 120 bits of entropy on its own, so this is belt-and-braces against a
 * stolen database rather than the primary defence.
 */
export async function recoveryKeyFrom(
  code: string,
  saltB64: string,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(normalizeRecoveryCode(code)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromB64(saltB64) as BufferSource,
      iterations: 600_000,
      hash: "SHA-512",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function newRecoverySalt(): string {
  return toB64(randomBytes(16));
}

// ------------------------------------------------- device-to-device transfer

export type TransferKeypair = { publicJwk: JsonWebKey; privateKey: CryptoKey };

export async function generateTransferKeypair(): Promise<TransferKeypair> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  return {
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
    privateKey: pair.privateKey,
  };
}

async function sharedKey(
  privateKey: CryptoKey,
  publicJwk: JsonWebKey,
): Promise<CryptoKey> {
  const pub = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: pub },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Run on the *approving* device. Produces a blob only the requesting device
 * can open; the server relays it without being able to read it.
 */
export async function sealVaultKeyFor(
  vaultKey: CryptoKey,
  recipientPublicJwk: JsonWebKey,
): Promise<string> {
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  const shared = await sharedKey(ephemeral.privateKey, recipientPublicJwk);
  const wrapped = await wrapVaultKey(shared, vaultKey);
  const ephemeralJwk = await crypto.subtle.exportKey("jwk", ephemeral.publicKey);
  return JSON.stringify({ epk: ephemeralJwk, wrapped });
}

/** Run on the *new* device once the approval comes back. */
export async function openSealedVaultKey(
  sealedBlob: string,
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  const { epk, wrapped } = JSON.parse(sealedBlob) as {
    epk: JsonWebKey;
    wrapped: string;
  };
  const shared = await sharedKey(privateKey, epk);
  return unwrapVaultKey(shared, wrapped);
}

// -------------------------------------------------------------- reuse index

/**
 * A keyed digest under the vault key. Lets the server group equal values —
 * "reused on N sites", "one row per tag name" — without ever learning what
 * they are. Two users with the same value never collide, and the server has
 * no way to build a rainbow table.
 */
async function keyedDigest(
  vaultKey: CryptoKey,
  domain: string,
  value: string,
): Promise<string> {
  const raw = await exportVaultKey(vaultKey);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    enc.encode(`${domain}:${value}`),
  );
  return toB64(sig).slice(0, 32);
}

export function reuseIndex(vaultKey: CryptoKey, password: string) {
  return keyedDigest(vaultKey, "reuse", password);
}

export function tagIndex(vaultKey: CryptoKey, name: string) {
  return keyedDigest(vaultKey, "tag", name.trim().toLowerCase());
}
