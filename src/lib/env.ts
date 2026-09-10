import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in ` +
        `(openssl rand -base64 32 for the key material).`,
    );
  }
  return v;
}

function key32(name: string): Buffer {
  const buf = Buffer.from(required(name), "base64");
  if (buf.length !== 32) {
    throw new Error(`${name} must be 32 bytes of base64 (got ${buf.length}).`);
  }
  return buf;
}

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Configuration mistakes that only show up as "sign-in silently loops" or
 * "Touch ID throws SecurityError" — the two failure modes that are hardest
 * to diagnose from the browser. Surfaced at boot and on /api/health.
 */
export function configWarnings(): string[] {
  const warnings: string[] = [];

  let url: URL | null = null;
  try {
    url = new URL(appUrl);
  } catch {
    warnings.push(`APP_URL is not a valid URL: ${appUrl}`);
    return warnings;
  }

  const rpId = process.env.RP_ID ?? "localhost";
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  // Cookies are marked Secure from the APP_URL scheme, so an APP_URL that
  // disagrees with what the browser actually typed breaks sign-in outright.
  if (url.protocol === "http:" && !isLocal) {
    warnings.push(
      `APP_URL is http:// on a non-localhost host (${url.hostname}). ` +
        `Session cookies will not be marked Secure, and WebAuthn will refuse ` +
        `to run at all. Terminate TLS in front of the app and set ` +
        `APP_URL=https://${url.hostname}.`,
    );
  }

  // WebAuthn is bound to the hostname the browser sees, which behind a
  // reverse proxy is the public one — never the container's.
  if (rpId !== url.hostname) {
    warnings.push(
      `RP_ID (${rpId}) does not match the APP_URL host (${url.hostname}). ` +
        `Touch ID will fail with a SecurityError. Set RP_ID=${url.hostname}.`,
    );
  }

  return warnings;
}

export const env = {
  appUrl,

  /**
   * Whether to mark cookies `Secure`.
   *
   * This follows the scheme the app is actually served on, NOT NODE_ENV. A
   * production build served over plain HTTP — which is every `docker compose
   * up` before a TLS terminator is in front of it — would otherwise send
   * `Secure` cookies that the browser throws away, and the user would bounce
   * back to the sign-in page forever. Chrome quietly forgives this on
   * localhost; Safari does not, and nothing forgives it on a LAN address.
   */
  secureCookies: (() => {
    try {
      return new URL(appUrl).protocol === "https:";
    } catch {
      return false;
    }
  })(),

  rpId: process.env.RP_ID ?? "localhost",
  get warnings() {
    return configWarnings();
  },
  rpName: process.env.RP_NAME ?? "keys",
  emailFrom: process.env.EMAIL_FROM ?? "keys <onboarding@resend.dev>",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  get encryptionKey() {
    return key32("APP_ENCRYPTION_KEY");
  },
  get indexKey() {
    return key32("APP_INDEX_KEY");
  },
  get sessionSecret() {
    return key32("SESSION_SECRET");
  },
};
