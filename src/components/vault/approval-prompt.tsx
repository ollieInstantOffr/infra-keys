"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { useVault } from "./vault-provider";
import { sealVaultKeyFor } from "@/lib/crypto/vault";
import styles from "./approval-prompt.module.css";

/**
 * Shown on an already-enrolled device when another one asks for the vault.
 *
 * The approving device is the only party that can do this: it holds the vault
 * key, seals it to the requester's public key, and hands the server a blob it
 * cannot read. The six-digit match code exists so you can't approve someone
 * else's request by reflex.
 */
export function ApprovalPrompt() {
  const { boot, vaultKey, refresh } = useVault();
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const pending = (boot?.pendingApprovals ?? []).filter(
    // Never ask a device to approve its own request — it already has the key.
    (a) => !dismissed.includes(a.id) && a.newDeviceId !== boot?.device?.id,
  );
  const approval = pending[0];
  if (!approval) return null;

  async function resolve(decision: "approve" | "block") {
    if (!approval) return;
    setBusy(decision);
    try {
      let sealedKey: string | null = null;

      if (decision === "approve") {
        const key = vaultKey();
        if (!key) throw new Error("Unlock this device first.");
        if (!approval.recipientPublicKey) {
          throw new Error("That device didn't publish a transfer key.");
        }
        sealedKey = await sealVaultKeyFor(
          key,
          JSON.parse(approval.recipientPublicKey) as JsonWebKey,
        );
      }

      const res = await fetch("/api/devices/approvals", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: approval.id, decision, sealedKey }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);

      notify.success(
        decision === "approve" ? "Device approved" : "Request blocked",
      );
      setDismissed((prev) => [...prev, approval.id]);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.scrim}>
      <div className={styles.panel} role="dialog" aria-modal="true">
        <div className={styles.kicker}>
          <span className={styles.dot} />
          Shown on your existing device
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="t-card">Approve a new device?</div>
          <div
            style={{
              font: "400 14px/1.5 var(--font-sans)",
              color: "var(--muted)",
              textWrap: "pretty",
            }}
          >
            Someone signed in as you and wants access to your vault.
          </div>
        </div>

        <div className={styles.facts}>
          <Fact label="Device" value={approval.deviceLabel} />
          <Fact label="Near" value={approval.location ?? "unknown"} />
          <Fact
            label="Requested"
            value={relative(new Date(approval.requestedAt))}
          />
        </div>

        <div className={styles.match}>
          <span className="t-eyebrow">Match this code on the new device</span>
          <span className={styles.code}>
            {approval.matchCode.slice(0, 3)} {approval.matchCode.slice(3)}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Button
            variant="primary"
            size="lg"
            block
            loading={busy === "approve"}
            onClick={() => resolve("approve")}
          >
            Approve with Touch ID
          </Button>
          <Button
            variant="ghost"
            block
            loading={busy === "block"}
            onClick={() => resolve("block")}
          >
            This wasn&apos;t me — block it
          </Button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <span className={styles.factKey}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  );
}

function relative(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "Just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes ago`;
  return `${Math.round(seconds / 3600)} hours ago`;
}
