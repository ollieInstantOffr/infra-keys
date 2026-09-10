/**
 * End-to-end proof that the Touch ID path really works.
 *
 * A platform authenticator can't be scripted, so this drives Chrome's virtual
 * one over CDP with the PRF extension enabled — the same extension the real
 * Touch ID flow depends on. If this passes, the plumbing that matters is
 * sound: enrolment derives a key from PRF, that key wraps the vault key, and
 * a later unlock re-derives the same key and opens the vault.
 *
 *   node tests/touch-id.mjs [baseUrl]
 *
 * Needs the stack running (docker compose up) and RESEND_API_KEY unset, so
 * sign-in links land in the app container's logs.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3000";

let passed = 0;
function step(name) {
  passed += 1;
  console.log(`  ${String(passed).padStart(2)}. ${name}`);
}

/**
 * Clear throttling counters between runs. The limits are real and shared, so
 * repeated test runs would otherwise trip the "10 links per IP per 15
 * minutes" rule — which is the limiter working, not a bug.
 */
function resetRateLimits() {
  const password = execFileSync("sh", [
    "-c",
    "grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2",
  ], { encoding: "utf8" }).trim();

  execFileSync(
    "docker",
    [
      "compose", "exec", "-T",
      "-e", `PGPASSWORD=${password}`,
      "db", "psql", "-U", "keys", "-d", "keys",
      "-c", 'DELETE FROM "RateLimit";',
    ],
    { stdio: "ignore" },
  );
}

/** The magic link is printed to the container log when Resend isn't configured. */
function magicLinkFor(email) {
  const logs = execFileSync(
    "docker",
    ["compose", "logs", "--no-log-prefix", "--tail", "400", "app"],
    { encoding: "utf8" },
  );

  const blocks = logs.split("── keys · email not sent").reverse();
  for (const block of blocks) {
    if (!block.includes(`To:      ${email}`)) continue;
    if (!block.includes("Subject: Your sign-in link")) continue;
    const match = block.match(/Link:\s+(\S+)/);
    if (match) return match[1];
  }
  throw new Error(`No sign-in link found in the app log for ${email}`);
}

/**
 * @param hasPrf  false simulates the browsers that have Touch ID but no PRF
 *                extension (older Safari, some Linux builds), where keys
 *                falls back to a device secret held in IndexedDB.
 */
async function run({ hasPrf }) {
  const EMAIL = `touchid-${hasPrf ? "prf" : "fallback"}-${Date.now()}@example.com`;
  resetRateLimits();

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();

  page.on("pageerror", (error) => console.error("  ! page error:", error.message));

  // ------------------------------------------------ virtual Touch ID
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal", // "internal" is what makes it a *platform* authenticator
      hasResidentKey: true,
      hasUserVerification: true,
      hasPrf,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  step(`virtual platform authenticator attached, PRF ${hasPrf ? "enabled" : "disabled"}`);

  // ------------------------------------------------------- sign in
  await page.goto("/signin");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await page.waitForURL("**/signin/sent**");
  step("magic link requested");

  const link = magicLinkFor(EMAIL);
  await page.goto(link.replace(BASE, ""));
  await page.waitForURL("**/setup/touch-id**");
  step("link consumed, landed on Touch ID setup");

  // ------------------------------------------------------ enrolment
  await page.getByRole("button", { name: "Set up Touch ID" }).click();
  await page.waitForURL("**/setup/recovery**", { timeout: 30_000 });
  step("Touch ID enrolled without a single manual prompt");

  const credentials = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  assert.equal(credentials.credentials.length, 1, "expected exactly one credential");
  step("authenticator holds the new credential");

  // The server must be holding a wrapped key it cannot open.
  const boot = await page.evaluate(async () =>
    (await fetch("/api/vault/bootstrap")).json(),
  );
  assert.ok(boot.device?.wrappedVaultKey, "device has no wrapped vault key");
  assert.equal(
    boot.device.usesPrf,
    hasPrf,
    hasPrf
      ? "PRF was available but the fallback ran anyway"
      : "PRF was unavailable but the code claimed to use it",
  );
  step(
    hasPrf
      ? "vault key wrapped by the PRF-derived device key"
      : "vault key wrapped by the device-secret fallback",
  );

  // ------------------------------------------------- recovery kit
  const code = (await page.locator("div.mono").first().innerText()).trim();
  assert.match(code.replace(/\s+/g, ""), /^[A-Z0-9-]{26,}$/, "recovery code looks wrong");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Open my vault" }).click();
  await page.waitForURL("**/vault**");
  step("recovery kit shown once and acknowledged");

  // --------------------------------------------------- write an item
  await page.getByRole("button", { name: "Add password" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Stripe");
  await page.getByLabel("Username or email").fill("sam@rivera.me");
  await page.getByRole("button", { name: "Save to vault" }).click();
  await page.waitForSelector("text=Saved to vault", { timeout: 15_000 });
  step("item created and encrypted");

  // ------------------------------------- the real test: reload + unlock
  // A reload drops the in-memory vault key. Getting back in without the
  // recovery code proves PRF re-derived the same wrapping key.
  await page.goto("/vault");
  await page.waitForURL("**/unlock**", { timeout: 15_000 });
  step("reload locked the vault, as designed");

  await page.waitForURL("**/vault**", { timeout: 30_000 });
  step("Touch ID unlocked the vault");

  await page.waitForSelector("text=Stripe", { timeout: 15_000 });
  const rows = await page.locator("text=sam@rivera.me").count();
  assert.ok(rows > 0, "item did not decrypt after the Touch ID unlock");
  step("item decrypted after unlock — the key round-tripped");

  // ------------------------------------------ a wrong finger must fail
  await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: false });
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: /Lock vault/ }).click();
  await page.waitForURL("**/unlock**", { timeout: 15_000 });
  await page.waitForSelector("text=/didn't match|cancelled|Try Touch ID again/i", {
    timeout: 30_000,
  });
  step("a failed verification is refused, not waved through");

  await browser.close();
}

async function main() {
  console.log("\nkeys · Touch ID, with the PRF extension");
  await run({ hasPrf: true });

  console.log("\nkeys · Touch ID, without PRF (device-secret fallback)");
  await run({ hasPrf: false });

  console.log(`\n  ${passed} checks passed — Touch ID works on both paths.\n`);
}

main().catch(async (error) => {
  console.error("\n  FAILED:", error.message, "\n");
  process.exit(1);
});
