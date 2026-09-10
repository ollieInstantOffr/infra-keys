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

The evaluation is requested during `create()`, so enrolment is a single Touch
ID prompt on Chrome 132+ and Safari 18+. Browsers that report PRF support but
don't evaluate at creation get one extra prompt. Browsers with no PRF at all
fall back to a device secret in IndexedDB behind the same ceremony — weaker,
because the secret is on disk, and Settings → Sign-in says so on the affected
device.

### Verifying it

A real Touch ID sensor can't be scripted, so the test drives Chrome's virtual
authenticator over CDP with PRF enabled — the same extension the real flow
depends on:

```bash
npm run test:touch-id
```

It runs the whole path twice, once with PRF and once without: enrol, write an
item, reload (which drops the in-memory key), unlock with Touch ID, and assert
the item still decrypts. That last step is the one that matters — it proves the
authenticator re-derived the same wrapping key. It also flips the authenticator
to "not verified" and checks the unlock is refused rather than waved through.

Needs the stack running and `RESEND_API_KEY` unset, since it reads sign-in
links out of the app container's log.

### Hostnames

WebAuthn is bound to a hostname, and so is the cookie's `Secure` flag. Both
follow `APP_URL` — the address the **browser** uses, which behind a proxy is
the public one, never the container's.

| Browser opens | `APP_URL` | `RP_ID` | |
| --- | --- | --- | --- |
| `http://localhost:3000` | same | `localhost` | works — localhost is exempt from HTTPS |
| `http://192.168.1.x:3000` | same | anything | no: not a secure context, WebAuthn refuses |
| `https://keys.example.com` | same | `keys.example.com` | works |

Get `RP_ID` wrong and the browser throws a `SecurityError`; the app catches it
and says so in plain words. Get `APP_URL`'s *scheme* wrong and sign-in loops
back to the login page, because a `Secure` cookie sent over plain HTTP is
thrown away by the browser — Chrome forgives this on localhost, Safari does
not, and nothing forgives it on a LAN address.

`/api/health` reports both mistakes, and they are logged once at boot:

```bash
curl -s http://localhost:3000/api/health
# {"ok":true,"db":true,"warnings":[]}
```

### Behind a reverse proxy

TLS terminating at Nginx (or Nginx Proxy Manager) is the expected setup — the
app speaks plain HTTP on the inside and that is fine, because `Secure` is about
the browser-to-proxy leg. Point the proxy at the app container and set:

```ini
APP_URL=https://keys.example.com
RP_ID=keys.example.com
```

In Nginx Proxy Manager: a Proxy Host for `keys.example.com` forwarding to the
`app` container on port `3000`, with **Websockets Support** on and an SSL
certificate attached. Put the app on the proxy's Docker network (or forward to
the host's published `3000`), and drop the `ports:` mapping from
`docker-compose.yml` once you do, so the app is only reachable through the
proxy.

#### Client addresses

Per-IP rate limits key on the address the proxy reports, and the order the
headers are read in matters. Nginx sets `X-Real-IP` from `$remote_addr`, which
a client cannot influence, so that wins. `X-Forwarded-For` is built with
`$proxy_add_x_forwarded_for`, which *appends* the real address to whatever the
client sent — so the rightmost entry is the proxy's observation and the
leftmost is attacker-controlled. Reading the leftmost would let anyone mint a
fresh identity per request and walk straight past the limiter.

Exposed directly with no proxy, neither header exists and every request shares
one bucket. The per-account limits still hold, but put a proxy in front.

#### Restricting access to your own IP

An Access List in Nginx Proxy Manager (Access Lists → new list → Access rules →
`allow <your ip>`, `deny all`, then attach it to the Proxy Host) keeps the app
off the public internet entirely. Worth doing, with two caveats:

- **It is a second lock, not the only one.** Everything the app does — the
  magic link, Touch ID, the encrypted vault — still applies behind it. An
  allowlist that fails open should not hand anyone your passwords.
- **A changing home IP locks you out.** Most residential connections renew, and
  CGNAT can move you without warning. Nothing is lost — the vault is encrypted
  with keys the server never had, so you edit the allow rule and carry on — but
  you cannot fix it from your phone on mobile data unless you allow that range
  too. Keep a way back into the proxy admin.

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
- **Deleting an account is immediate.** It is a different action from "start
  over": that one waits seven days because email access is the only proof of
  identity, so a stolen inbox must not be able to wipe someone instantly. A
  delete from Settings happens with the vault already unlocked and the address
  typed out, so the wait buys nothing. Every relation cascades from the user
  row, so one delete takes the vault, its history, devices, sessions, folders,
  tags and audit trail with it.
- **The unlock screen starts a ceremony on arrival, but doesn't count it.**
  Safari and an installed app launched from the Dock require a transient user
  activation, so that unprompted attempt is refused before any prompt is drawn.
  Only click-initiated attempts count towards the three strikes — otherwise
  three cold launches of the installed app would lock you out of your vault.
- **Rate limiting lives in Postgres, not Redis.** One `INSERT … ON CONFLICT`
  per check, so concurrent requests can't both read a stale count. Keeping it
  in the database means the limits survive a restart — an in-memory counter
  would reset at exactly the moment an attacker would want it to — and a second
  replica shares the same budget, so scaling out needs no extra infrastructure.
  If the limiter itself errors, the request is refused rather than waved
  through.
