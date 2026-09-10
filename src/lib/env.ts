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

export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  rpId: process.env.RP_ID ?? "localhost",
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
