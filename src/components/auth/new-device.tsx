"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "./auth-shell";
import { Button, Field, Spinner } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import {
  generateTransferKeypair,
  normalizeRecoveryCode,
  openSealedVaultKey,
  recoveryKeyFrom,
  unwrapVaultKey,
  type TransferKeypair,
} from "@/lib/crypto/vault";

/**
 * Layer 1 and layer 2 of recovery, side by side.
 *
 * The transfer keypair is generated here and only its public half is
 * published; the approving device seals the vault key to it, so the server
 * relays a blob it cannot open.
 */
export function NewDeviceScreen() {
  const router = useRouter();
  const { status, boot, adoptKey } = useVault();

  const keypair = useRef<TransferKeypair | null>(null);
  // Set the moment we hand the key over, so the "already unlocked" redirect
  // below doesn't race the hop to enrolment.
  const handedOff = useRef(false);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [matchCode, setMatchCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (handedOff.current) return;
    if (status === "unlocked") router.replace("/vault");
    if (status === "needs-enrolment") router.replace("/setup/touch-id");
  }, [status, router]);

  // ---------------------------------------------------- request approval

  const request = useCallback(async () => {
    if (keypair.current) return;
    try {
      const pair = await generateTransferKeypair();
      keypair.current = pair;

      const res = await fetch("/api/devices/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transferPublicKey: JSON.stringify(pair.publicJwk) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);

      setApprovalId(body.id);
      setMatchCode(body.matchCode);
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Couldn't ask your other devices.",
      );
    }
  }, []);

  useEffect(() => {
    if (status === "needs-approval") void request();
  }, [status, request]);

  // ------------------------------------------------------------- polling

  useEffect(() => {
    if (!approvalId) return;

    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/devices/approvals?id=${approvalId}`);
        const body = await res.json();

        if (body.status === "APPROVED" && body.sealedKey && keypair.current) {
          clearInterval(iv);
          const vaultKey = await openSealedVaultKey(
            body.sealedKey,
            keypair.current.privateKey,
          );
          handedOff.current = true;
          await adoptKey(vaultKey);
          notify.success("Approved — welcome back");
          router.replace("/setup/touch-id?enrol=1");
        }

        if (body.status === "BLOCKED") {
          clearInterval(iv);
          notify.error("That request was blocked from your other device.");
          router.replace("/signin");
        }

        if (body.status === "EXPIRED") {
          clearInterval(iv);
          setApprovalId(null);
          setMatchCode(null);
          keypair.current = null;
        }
      } catch {
        // a dropped poll is not worth surfacing; the next tick retries
      }
    }, 2500);

    return () => clearInterval(iv);
  }, [approvalId, adoptKey, router]);

  // ------------------------------------------------------- recovery code

  async function useRecoveryCode(event: React.FormEvent) {
    event.preventDefault();
    setCodeError(null);

    const flat = normalizeRecoveryCode(code);
    if (flat.length !== 24) {
      setCodeError("A recovery code is 24 characters.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/recovery/unlock");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);

      const recoveryKey = await recoveryKeyFrom(code, body.salt);
      const vaultKey = await unwrapVaultKey(recoveryKey, body.wrappedKey).catch(() => {
        throw new Error("That code didn't open the vault.");
      });

      handedOff.current = true;
      await adoptKey(vaultKey);
      router.replace("/setup/touch-id?enrol=1");
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : "That didn't work.");
      setBusy(false);
    }
  }

  if (status === "booting") {
    return (
      <AuthShell width={480}>
        <Spinner size={24} />
      </AuthShell>
    );
  }

  return (
    <AuthShell width={480} align="start">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ font: "700 26px var(--font-sans)", letterSpacing: "-0.02em" }}>
          New device detected
        </div>
        <div
          style={{
            font: "400 14px/1.55 var(--font-sans)",
            color: "var(--muted)",
            textWrap: "pretty",
          }}
        >
          Signed in as {boot?.user.email}, but this device has no vault key yet.
          Unlock it one of two ways.
        </div>
      </div>

      {/* layer 1 */}
      <div
        style={{
          padding: 18,
          borderRadius: 16,
          background: "var(--surface)",
          border: "1.5px solid var(--accent)",
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "var(--accent-soft-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <div
            style={{
              width: 12,
              height: 20,
              border: "2px solid var(--accent)",
              borderRadius: 3,
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          <div style={{ font: "700 15px var(--font-sans)" }}>
            Approve from another device
          </div>
          <div style={{ font: "400 13px/1.5 var(--font-sans)", color: "var(--muted)" }}>
            We sent a request to your other devices. Confirm it there with Touch
            ID or Face ID.
          </div>

          {matchCode && (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span className="t-eyebrow">Match this code</span>
              <span
                className="mono"
                style={{ font: "500 26px var(--font-mono)", letterSpacing: "0.2em" }}
              >
                {matchCode.slice(0, 3)} {matchCode.slice(3)}
              </span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
              font: "600 12px var(--font-sans)",
              color: "var(--muted)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent)",
                animation: "pulseRing 1.4s ease-in-out infinite",
              }}
            />
            Waiting for approval…
          </div>
        </div>
      </div>

      {/* layer 2 */}
      <form
        onSubmit={useRecoveryCode}
        style={{
          padding: 18,
          borderRadius: 16,
          background: "var(--surface)",
          border: "1px solid var(--line-06)",
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "rgba(28,25,23,.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <div
            style={{
              width: 18,
              height: 14,
              border: "2px solid var(--muted)",
              borderRadius: 2,
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <div style={{ font: "700 15px var(--font-sans)" }}>
            Enter your recovery code
          </div>
          <Field
            mono
            name="recovery"
            placeholder="XXXX-XXXX-XXXX  XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={codeError}
            style={{ height: 42, fontSize: 13 }}
          />
          <Button type="submit" variant="primary" loading={busy}>
            Unlock with recovery code
          </Button>
        </div>
      </form>

      <div
        style={{
          font: "400 12px/1.5 var(--font-sans)",
          color: "var(--faint)",
          textAlign: "center",
        }}
      >
        Lost every device and the code? Your vault can&apos;t be recovered —{" "}
        <StartOverLink />.
      </div>
    </AuthShell>
  );
}

function StartOverLink() {
  const [busy, setBusy] = useState(false);

  async function startOver() {
    if (
      !confirm(
        "This schedules your encrypted vault for deletion in 7 days. You'll get an email you can cancel from. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/recovery/start-over", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "START_OVER" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      notify.warning("We've emailed you. The vault is erased in 7 days.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={startOver}
      disabled={busy}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        font: "600 12px var(--font-sans)",
        color: "var(--accent)",
        cursor: "pointer",
      }}
    >
      start over
    </button>
  );
}
