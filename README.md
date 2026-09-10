# keys

A password manager built to the *keys* design: off-white ground, one faint
orange glow in the corner, frosted panels, mono type for secrets. No master
password — you sign in with a one-time link and unlock with Touch ID.

<!-- ------------------------------------------------------------------ -->

## The security model, in one screen

Three layers, in order. Email proves who you are; a device or a code proves
you own the vault.

```
vault key      AES-256-GCM. Encrypts every item. Generated in the browser,
               never sent to the server in any readable form.

  ├─ wrapped by the device key   ← WebAuthn PRF output (Touch ID / Face ID).
  │                                Stored server-side as an opaque blob only
  │                                that authenticator can open.
  │
  ├─ wrapped by the recovery key ← PBKDF2-SHA512(600k) over the printed
  │                                24-character recovery code.
  │
  └─ sealed to a new device      ← ECDH P-256 between two devices. The server
                                   relays a blob it cannot read.
```

What this buys you:

| Situation | What happens |
| --- | --- |
| New Mac, phone still enrolled | Layer 1 — approve on the phone |
| Browser data cleared, only device | Layer 2 — recovery code |
| Laptop stolen | Approve the new one, revoke the old |
| Email account compromised | Session only — the vault stays sealed |
| Lost every device *and* the code | Layer 3 — start over, after a 7-day notice |

The server holds ciphertext, wrapped keys, and the metadata it genuinely needs
to sort and page (item type, folder id, favourite flag, timestamps). It cannot
decrypt a single item, and neither can we.

Email addresses are the one piece of plaintext the server must act on, so they
are encrypted at rest with `APP_ENCRYPTION_KEY` and looked up through an HMAC
blind index keyed by `APP_INDEX_KEY`.

<!-- ------------------------------------------------------------------ -->

## Running it

Everything runs in Docker.

```bash
cp .env.example .env
```

Fill in the three keys — each is 32 bytes of base64:

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY
openssl rand -base64 32   # APP_INDEX_KEY
openssl rand -base64 32   # SESSION_SECRET
```

Add a `RESEND_API_KEY` if you want real email. Without one, sign-in links are
printed to the app container's logs instead — the whole flow still works:

```bash
docker compose up --build
docker compose logs -f app     # the magic link shows up here
```

Then open http://localhost:3000.

Migrations run automatically on container start (`prisma migrate deploy`), and
the app waits for Postgres to accept connections first.

### Without Docker

```bash
npm install
npx prisma migrate deploy
npm run dev
```

You still need a Postgres reachable at `DATABASE_URL`.

<!-- ------------------------------------------------------------------ -->

## Touch ID and PRF

Unlocking uses the WebAuthn **PRF extension**: the authenticator returns 32
bytes that only it can reproduce, and only after a real user-verification
gesture. Those bytes become the key that wraps the vault key, which is why the
vault key can live on the device without ever being written to disk in the
clear.

Browsers without PRF (older Safari, some Linux builds) fall back to a device
secret in IndexedDB behind the same ceremony. That is weaker — the secret is on
disk — and Settings → Sign-in says so on the affected device.

WebAuthn is bound to a hostname. `RP_ID` must match the host the app is served
from (`localhost` for local work, your domain in production), and everything
except `localhost` needs HTTPS.

<!-- ------------------------------------------------------------------ -->

## Offline and installing

The app is a PWA: install it from the browser's address bar or the in-app
banner and it opens in its own window with a Dock icon.

Offline splits in two:

- **`public/sw.js`** caches the shell — HTML, JS, CSS, fonts, icons — so the
  app boots with no connection.
- **IndexedDB** holds the vault as ciphertext, written by the app itself.
  Without the vault key it is inert, so a full local copy costs nothing in
  safety.

Writes made offline queue in IndexedDB and replay in order when you're back.
Nothing from `/api` is ever put in the Cache API.

<!-- ------------------------------------------------------------------ -->

## Layout

```
prisma/schema.prisma            data model — every *Cipher column is opaque
src/lib/crypto/vault.ts         the E2E crypto: wrap, unwrap, seal, transfer
src/lib/crypto/server.ts        at-rest encryption + blind index for email
src/lib/auth/                   magic links, sessions, WebAuthn ceremonies
src/lib/vault/                  strength, TOTP, generator, breach, import
src/components/vault/           the app shell, table, slide-over, editor
src/app/api/                    route handlers
public/sw.js                    shell caching
scripts/generate-icons.ts       renders the icon set from the mark
```

`npm run icons` regenerates every icon from the same geometry the `KeyMark`
component draws, so the 16px favicon and the 512px maskable icon are one
drawing.

<!-- ------------------------------------------------------------------ -->

## Things worth knowing

- **Breach checks are k-anonymous.** Only the first five characters of a
  password's SHA-1 hash reach the API; the comparison happens in the browser.
- **TOTP is computed locally.** 2FA secrets live inside the encrypted item, so
  the server has no material to generate a code with.
- **The clipboard clears itself** after the interval in Settings, and only if
  what it holds is still what we put there.
- **Auto-lock drops the key from memory.** It is held in a ref, never in React
  state, so it stays out of DevTools snapshots and serialised errors.
- **Rate limiting is in-process.** Fine for one container; move it to Redis
  before running more than one replica.
