"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "./auth-shell";
import { Fingerprint } from "./fingerprint";
import { Button, Spinner } from "@/components/ui/primitives";
import { Wordmark } from "@/components/ui/key-mark";
import { useVault } from "@/components/vault/vault-provider";
import { deviceKeyFor, unlockCeremony } from "@/lib/vault/webauthn-client";
import { unwrapVaultKey } from "@/lib/crypto/vault";

type Phase = "checking" | "ready" | "waiting" | "failed" | "paused";

/**
 * Touch ID sign-in for a returning device. Three strikes pauses Touch ID for
 * the session and pushes the user back to a magic link, as the design shows.
 */
export function UnlockScreen() {
  const router = useRouter();
  const { status, boot, adoptKey } = useVault();
  const [phase, setPhase] = useState<Phase>("checking");
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const device = boot?.device;
  const name = boot?.user.displayName ?? boot?.user.email.split("@")[0] ?? "";

  useEffect(() => {
    if (status === "unlocked") router.replace("/vault");
    if (status === "needs-enrolment") router.replace("/setup/touch-id");
    if (status === "needs-approval") router.replace("/device/new");
  }, [status, router]);

  const unlock = useCallback(async () => {
    if (!device?.wrappedVaultKey || !device.prfSalt) return;

    setPhase("waiting");
    setMessage(null);

    try {
      const res = await fetch("/api/webauthn/authenticate", { method: "POST" });
      const { options, prfSalt } = await res.json();

      const ceremony = await unlockCeremony(options, prfSalt ?? device.prfSalt);

      const verified = await fetch("/api/webauthn/authenticate", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: ceremony.response }),
      });
      const body = await verified.json();
      if (!verified.ok) throw new Error(body.error);

      const key = await deviceKeyFor(ceremony.credentialId, ceremony.prf);
      const vaultKey = await unwrapVaultKey(
        key,
        body.wrappedVaultKey ?? device.wrappedVaultKey,
      );

      await adoptKey(vaultKey);
      router.replace("/vault");
    } catch (error) {
      const next = attempts + 1;
      setAttempts(next);
      setMessage(
        error instanceof Error && error.message.includes("not enrolled")
          ? "This device isn't enrolled any more."
          : null,
      );
      setPhase(next >= 3 ? "paused" : "failed");
    }
  }, [device, attempts, adoptKey, router]);

  useEffect(() => {
    if (status === "locked" && phase === "checking") {
      setPhase("ready");
      // Kick the ceremony off immediately — the design shows the sensor
      // already listening on arrival.
      void unlock();
    }
  }, [status, phase, unlock]);

  if (status === "booting") {
    return (
      <AuthShell width={420}>
        <Spinner size={24} />
      </AuthShell>
    );
  }

  if (phase === "paused") {
    return (
      <AuthShell width={400}>
        <Fingerprint size={96} state="failed" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="t-card">Touch ID didn&apos;t match</div>
          <div
            style={{
              font: "400 14px/1.5 var(--font-sans)",
              color: "var(--muted)",
              textWrap: "pretty",
            }}
          >
            3 attempts used. Touch ID is paused for this session — sign in with
            a link instead.
          </div>
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => router.push("/signin")}
        >
          Email me a sign-in link
        </Button>
        <Link href="/device/new" style={{ font: "600 13px var(--font-sans)" }}>
          Use a recovery code
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell width={420}>
      <Wordmark size={20} tile={28} />
      <Fingerprint state={phase === "waiting" ? "waiting" : "idle"} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="t-title">Welcome back{name ? `, ${name}` : ""}</div>
        <div style={{ font: "400 15px/1.5 var(--font-sans)", color: "var(--muted)" }}>
          {phase === "failed"
            ? (message ?? "That didn't match. Try again.")
            : "Touch the sensor to unlock your vault."}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
          font: "600 13px var(--font-sans)",
          color: "var(--muted)",
          width: "100%",
        }}
      >
        {phase === "waiting" ? (
          <span>Waiting for Touch ID…</span>
        ) : (
          <Button variant="primary" size="lg" block onClick={unlock}>
            {phase === "failed" ? "Try Touch ID again" : "Unlock with Touch ID"}
          </Button>
        )}
        <Link href="/signin" style={{ font: "600 13px var(--font-sans)" }}>
          Use a magic link instead
        </Link>
      </div>
    </AuthShell>
  );
}
