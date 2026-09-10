"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { clearRecoveryCode, takeRecoveryCode } from "@/lib/vault/one-time";
import { downloadBlob, recoveryKitPdf } from "@/lib/vault/recovery-pdf";
import { useVault } from "@/components/vault/vault-provider";

export function RecoveryKit({ email }: { email: string }) {
  const router = useRouter();
  const { copy, refresh } = useVault();
  const [code, setCode] = useState<string | null>(null);
  const [touchId, setTouchId] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = takeRecoveryCode();
    if (!value) {
      // Nothing to show — a reload lost it. Regenerating is the honest fix.
      router.replace("/settings/sign-in?recovery=missing");
      return;
    }
    setCode(value.code);
    setTouchId(value.touchId);
  }, [router]);

  if (!code) return null;

  const [line1, line2] = code.split(/\s+/);

  async function finish() {
    setBusy(true);
    await fetch("/api/recovery", { method: "PUT" }).catch(() => {});
    clearRecoveryCode();
    await refresh();
    router.push("/vault");
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
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
          2
        </span>
        {touchId
          ? "Step 2 of 2 · Touch ID is on"
          : "Step 2 of 2 · without Touch ID, this code is your only way in"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ font: "700 26px var(--font-sans)", letterSpacing: "-0.02em" }}>
          Save your recovery kit
        </div>
        <div
          style={{
            font: "400 14px/1.55 var(--font-sans)",
            color: "var(--muted)",
            textWrap: "pretty",
          }}
        >
          Your vault is encrypted with a key that only lives on your devices. If
          you lose them all, this code is the only way back in. We can&apos;t
          reset it for you.
        </div>
      </div>

      <div
        style={{
          padding: "18px 20px",
          borderRadius: 14,
          background: "var(--surface)",
          border: "1px dashed var(--line-20)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div className="t-eyebrow">Recovery code</div>
        <div
          className="mono"
          style={{ font: "500 20px/1.5 var(--font-mono)", letterSpacing: "0.06em" }}
        >
          {line1}
          <br />
          {line2}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button
          style={{ flex: 1 }}
          onClick={() =>
            downloadBlob(
              recoveryKitPdf({ code: code!, email, createdAt: new Date() }),
              "keys-recovery-kit.pdf",
            )
          }
        >
          Download PDF
        </Button>
        <Button style={{ flex: 1 }} onClick={() => window.print()}>
          Print
        </Button>
        <Button style={{ flex: 1 }} onClick={() => copy(code!, "Recovery code copied")}>
          Copy
        </Button>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          font: "500 13px/1.5 var(--font-sans)",
          color: "var(--ink-2)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          style={{ accentColor: "var(--accent)", width: 18, height: 18, marginTop: 1 }}
        />
        I&apos;ve stored this somewhere safe and offline.
      </label>

      <Button
        variant="primary"
        size="lg"
        block
        disabled={!acknowledged}
        loading={busy}
        onClick={finish}
      >
        Open my vault
      </Button>
    </>
  );
}
