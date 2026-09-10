"use client";

import { useMemo, useState } from "react";
import { Button, Field } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { useVault } from "./vault-provider";
import { useChrome } from "./app-frame";
import { EmptyState } from "./empty-state";
import { TotpBar, useTotp } from "./totp-code";
import { parseTotp } from "@/lib/vault/totp";
import {
  entryColor,
  entryMono,
  isPassword,
  type PasswordPayload,
  type VaultEntry,
} from "@/lib/vault/types";
import styles from "./totp-screen.module.css";
import table from "./table.module.css";

export function TotpScreen() {
  const { entries } = useVault();
  const { openNew } = useChrome();
  const [adding, setAdding] = useState(false);

  const withTotp = useMemo(
    () =>
      entries.filter(
        (e) =>
          !e.deletedAt &&
          isPassword(e) &&
          Boolean((e.payload as PasswordPayload).totpSecret),
      ),
    [entries],
  );

  if (withTotp.length === 0 && !adding) {
    return (
      <EmptyState
        title="No 2FA codes yet"
        body="Paste a setup key into any password to get rolling codes here, generated on this device."
        primary={{ label: "Add a code", onClick: () => setAdding(true) }}
        secondary={{ label: "New password", onClick: () => openNew("PASSWORD") }}
      />
    );
  }

  return (
    <>
      <div className={table.head}>
        <div className={table.headText}>
          <h1 className="t-page" style={{ margin: 0 }}>
            One-time codes
          </h1>
          <div className="t-sub">
            {withTotp.length} {withTotp.length === 1 ? "account" : "accounts"} ·
            codes refresh every 30 seconds
          </div>
        </div>
        <Button onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "Add setup key"}
        </Button>
      </div>

      {adding && <AddTotp onDone={() => setAdding(false)} />}

      <div className={styles.grid}>
        {withTotp.map((entry) => (
          <TotpCard key={entry.id} entry={entry} />
        ))}
      </div>
    </>
  );
}

function TotpCard({ entry }: { entry: VaultEntry }) {
  const { copy } = useVault();
  const payload = entry.payload as PasswordPayload;
  const totp = useTotp(payload.totpSecret);

  return (
    <div className={`glass ${styles.card}`}>
      <div className={styles.cardHead}>
        <span className={styles.mono} style={{ background: entryColor(entry) }}>
          {entryMono(entry)}
        </span>
        <div className={styles.cardText}>
          <span className={styles.name}>{payload.name}</span>
          <span className={styles.user}>{payload.username}</span>
        </div>
      </div>

      <div className={styles.codeRow}>
        <span className={styles.code}>{totp.display}</span>
        <button
          type="button"
          className={styles.copy}
          onClick={() => copy(totp.code, "Code copied")}
        >
          Copy
        </button>
      </div>

      <div className={styles.barRow}>
        <TotpBar seconds={totp.seconds} period={totp.period} height={3} />
        <span className={styles.seconds}>{totp.seconds}s</span>
      </div>

      {totp.error && <div className={styles.error}>{totp.error}</div>}
    </div>
  );
}

/**
 * Attaching a setup key to an existing item. Scanning a QR would need camera
 * access and a decoder; pasting the key it encodes does the same job.
 */
function AddTotp({ onDone }: { onDone: () => void }) {
  const { entries, updateEntry } = useVault();
  const [itemId, setItemId] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const candidates = entries.filter(
    (e) => !e.deletedAt && isPassword(e) && !(e.payload as PasswordPayload).totpSecret,
  );

  async function save() {
    setError(null);
    const entry = entries.find((e) => e.id === itemId);
    if (!entry || !isPassword(entry)) {
      setError("Pick which login this code belongs to.");
      return;
    }
    let parsed: string;
    try {
      parsed = parseTotp(secret).secret;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That key isn't valid.");
      return;
    }

    setBusy(true);
    try {
      await updateEntry(entry.id, { ...entry.payload, totpSecret: parsed });
      notify.success("2FA code added");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
      setBusy(false);
    }
  }

  return (
    <div className={`glass ${styles.adder}`}>
      <div className={styles.adderFields}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <label className="t-label">Login</label>
          <select
            className={styles.select}
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">Choose a saved login…</option>
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                {(e.payload as PasswordPayload).name}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Setup key or otpauth:// link"
          mono
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="JBSWY3DPEHPK3PXP"
          error={error}
          style={{ minWidth: 280 }}
        />

        <Button variant="primary" onClick={save} loading={busy}>
          Add code
        </Button>
      </div>
      <div className="t-sub">
        The key is stored inside the encrypted item — codes are computed here,
        never on the server.
      </div>
    </div>
  );
}
