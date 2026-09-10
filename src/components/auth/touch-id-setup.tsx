"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { Fingerprint } from "./fingerprint";
import { notify } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { stashRecoveryCode } from "@/lib/vault/one-time";
import { enrolDevice, touchIdAvailable } from "@/lib/vault/webauthn-client";
import {
  generateRecoveryCode,
  generateTransferKeypair,
  generateVaultKey,
  newRecoverySalt,
  recoveryHint,
  recoveryKeyFrom,
  wrapVaultKey,
} from "@/lib/crypto/vault";

/**
 * First device. This is where the vault key is born: generated here, wrapped
 * once by the Touch ID key and once by a freshly printed recovery code, and
 * never sent anywhere in the clear.
 */
export function TouchIdSetup({ email }: { email: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { adoptKey, vaultKey } = useVault();
  const [busy, setBusy] = useState(false);

  /**
   * Two arrivals share this screen. A brand new account has no key yet, so
   * one is minted here. A device that just came back through approval or a
   * recovery code already holds the real key — enrolling must wrap *that*
   * one, or every existing item would be orphaned.
   */
  const enrolling = params.get("enrol") === "1" || vaultKey() !== null;

  async function enrol() {
    setBusy(true);
    try {
      if (!(await touchIdAvailable())) {
        throw new Error(
          "This browser has no built-in authenticator. Continue without it for now.",
        );
      }

      const options = await fetch("/api/webauthn/register").then((r) => r.json());
      const enrolment = await enrolDevice(options);

      const existing = vaultKey();
      const key = existing ?? (await generateVaultKey());
      const transfer = await generateTransferKeypair();

      // A fresh vault gets its recovery kit in the same round trip. An
      // existing one keeps the kit it already has.
      const code = existing ? null : generateRecoveryCode();
      const salt = code ? newRecoverySalt() : null;
      const recovery =
        code && salt
          ? {
              wrappedKey: await wrapVaultKey(await recoveryKeyFrom(code, salt), key),
              salt,
              hint: recoveryHint(code),
            }
          : null;

      const res = await fetch("/api/webauthn/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          response: enrolment.response,
          prfSalt: enrolment.prfSalt,
          usesPrf: enrolment.usesPrf,
          wrappedVaultKey: await wrapVaultKey(enrolment.deviceKey, key),
          transferPublicKey: JSON.stringify(transfer.publicJwk),
          recovery,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);

      await adoptKey(key);

      if (code) {
        stashRecoveryCode(code, true);
        router.push("/setup/recovery");
      } else {
        router.push("/vault");
      }
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Touch ID setup didn't finish.",
      );
      setBusy(false);
    }
  }

  /**
   * "Not now" still has to put the key somewhere, so a brand new vault gets
   * one behind a recovery code alone. The screen says as much. A vault that
   * already exists is simply left as it is.
   */
  async function skip() {
    if (enrolling) {
      router.push("/vault");
      return;
    }

    setBusy(true);
    try {
      const vaultKey = await generateVaultKey();
      const code = generateRecoveryCode();
      const salt = newRecoverySalt();
      const recoveryKey = await recoveryKeyFrom(code, salt);

      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wrappedKey: await wrapVaultKey(recoveryKey, vaultKey),
          salt,
          hint: recoveryHint(code),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      await adoptKey(vaultKey);
      stashRecoveryCode(code, false);
      router.push("/setup/recovery");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't create the vault.");
      setBusy(false);
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          alignSelf: "flex-start",
          font: "600 12px var(--font-sans)",
          color: "var(--muted)",
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "var(--accent)",
            color: "#fff",
            font: "700 11px var(--font-sans)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✓
        </span>
        Signed in as {email}
      </div>

      <Fingerprint state="dashed" />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ font: "700 26px var(--font-sans)", letterSpacing: "-0.02em" }}>
          {enrolling ? "Enrol this device" : "Unlock with Touch ID"}
        </div>
        <div
          style={{
            font: "400 15px/1.55 var(--font-sans)",
            color: "var(--muted)",
            textWrap: "pretty",
          }}
        >
          {enrolling
            ? "Your vault is open. Add Touch ID here so this device can unlock it on its own next time."
            : "Skip the inbox next time. Your vault key is stored in this device's secure enclave and never leaves it."}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <Button variant="primary" size="lg" block loading={busy} onClick={enrol}>
          {enrolling ? "Enrol Touch ID" : "Set up Touch ID"}
        </Button>
        <Button variant="ghost" block disabled={busy} onClick={skip}>
          Not now
        </Button>
      </div>
    </>
  );
}
