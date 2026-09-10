"use client";

import { useEffect, useState } from "react";
import { notify } from "@/components/ui/toast";
import { useVault } from "./vault-provider";
import { isPassword, type VaultEntry } from "@/lib/vault/types";
import styles from "./item-detail.module.css";

type Row = {
  id: string;
  cipher: string;
  iv: string;
  usedFrom: string;
  usedUntil: string;
  plain?: string;
  revealed?: boolean;
};

/**
 * Previous passwords for one item. History is encrypted with the item and is
 * deleted with it — the server holds ciphertext it can't read either.
 */
export function PasswordHistory({
  entry,
  onBack,
}: {
  entry: VaultEntry;
  onBack: () => void;
}) {
  const { unsealValue, copy, updateEntry } = useVault();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const current = isPassword(entry) ? entry.payload : null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vault/items/${entry.id}/history`)
      .then((r) => r.json())
      .then((data: Row[]) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  async function reveal(row: Row) {
    try {
      // History rows are sealed with the item id as additional data.
      const payload = await unsealValue(
        { cipher: row.cipher, iv: row.iv },
        entry.id,
      ).catch(() => null);
      const plain = payload
        ? tryExtractPassword(payload)
        : null;

      if (!plain) throw new Error("Couldn't open that entry.");
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, plain, revealed: true } : r)),
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't open that.");
    }
  }

  async function restore(row: Row) {
    if (!current) return;
    const plain = row.plain ?? null;
    if (!plain) {
      await reveal(row);
      return;
    }
    await updateEntry(entry.id, { ...current, password: plain });
    notify.success("Previous password restored");
    onBack();
  }

  return (
    <aside className={styles.panel} aria-label="Password history">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className={styles.link} onClick={onBack}>
          ← {current?.name ?? "Back"}
        </button>
        <span style={{ marginLeft: "auto" }} className="t-eyebrow">
          History
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="t-card">Password history</div>
        <div className="t-sub">
          Previous values are kept so you can recover from a bad change.
        </div>
      </div>

      <div className={styles.fields}>
        {current && (
          <div
            className={styles.card}
            style={{ border: "1.5px solid var(--accent)" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
              }}
              className="t-eyebrow"
            >
              <span>Current</span>
              <span style={{ color: "var(--accent)" }}>
                {entry.pwChangedAt
                  ? new Date(entry.pwChangedAt).toLocaleDateString()
                  : "Today"}
              </span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.secret}>{current.password}</span>
              <button
                type="button"
                className={styles.link}
                onClick={() => copy(current.password, "Password copied")}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {loading && <div className="t-sub">Loading…</div>}

        {!loading && rows.length === 0 && (
          <div className="t-sub">
            No earlier versions yet. They appear here once you change this
            password.
          </div>
        )}

        {rows.map((row) => (
          <div key={row.id} className={styles.card}>
            <div
              style={{ display: "flex", justifyContent: "space-between" }}
              className="t-eyebrow"
            >
              <span>Previous</span>
              <span>
                {new Date(row.usedFrom).toLocaleDateString()} →{" "}
                {new Date(row.usedUntil).toLocaleDateString()}
              </span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.secret} style={{ color: "var(--muted)" }}>
                {row.revealed ? row.plain : "••••••••••••"}
              </span>
              <div className={styles.linkGroup}>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => (row.revealed ? copy(row.plain!, "Copied") : reveal(row))}
                >
                  {row.revealed ? "Copy" : "Show"}
                </button>
                <button
                  type="button"
                  className={styles.footLink}
                  onClick={() => restore(row)}
                >
                  Restore
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.foot}>
        History is encrypted with the item and cleared when the item is
        permanently deleted.
      </div>
    </aside>
  );
}

/**
 * History rows store the whole item payload as it was, so the password has to
 * be picked back out of it.
 */
function tryExtractPassword(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as { password?: string };
    return parsed.password ?? null;
  } catch {
    return payload || null;
  }
}
