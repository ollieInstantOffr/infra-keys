"use client";

import { useEffect, useState } from "react";
import { Button, Meter } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { useVault } from "./vault-provider";
import { useChrome } from "./app-frame";
import { TotpBar, useTotp } from "./totp-code";
import { PasswordHistory } from "./password-history";
import { relativeDate } from "./vault-screen";
import { estimateStrength, strengthColor } from "@/lib/vault/strength";
import { entryColor, entryMono, isPassword, type VaultEntry } from "@/lib/vault/types";
import { generate, defaultOptions } from "@/lib/vault/generator";
import styles from "./item-detail.module.css";

export function ItemDetail({
  entry,
  reuseCount,
  onClose,
}: {
  entry: VaultEntry;
  reuseCount: number;
  onClose: () => void;
}) {
  const { copy, patchMeta, trashEntry, restoreEntry, updateEntry, folders, tags } =
    useVault();
  const { openEditor } = useChrome();
  const { dialog, confirm } = useDialog();
  const [revealed, setRevealed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const password = isPassword(entry) ? entry.payload : null;
  const totp = useTotp(password?.totpSecret);
  const strength = password ? estimateStrength(password.password) : null;

  useEffect(() => {
    setRevealed(false);
    setShowHistory(false);
  }, [entry.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!password) return null;

  const folder = folders.find((f) => f.id === entry.folderId);
  const entryTags = entry.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  async function changePassword() {
    if (!password) return;
    const next = generate(defaultOptions);
    await updateEntry(entry.id, { ...password, password: next }, {
      breached: false,
    });
    await copy(next, "New password copied");
    notify.success("New password generated and saved");
  }

  if (showHistory) {
    return (
      <PasswordHistory entry={entry} onBack={() => setShowHistory(false)} />
    );
  }

  return (
    <aside className={styles.panel} aria-label={`${password.name} details`}>
      <header className={styles.head}>
        <div className={styles.mono} style={{ background: entryColor(entry) }}>
          {entryMono(entry)}
        </div>
        <div className={styles.headText}>
          <div className={styles.title}>{password.name}</div>
          {password.url && (
            <a
              href={password.url.startsWith("http") ? password.url : `https://${password.url}`}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.url}
            >
              {password.url}
            </a>
          )}
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.iconButton}
            data-on={entry.favorite || undefined}
            aria-label={entry.favorite ? "Remove from favorites" : "Add to favorites"}
            onClick={() => patchMeta(entry.id, { favorite: !entry.favorite })}
          >
            ★
          </button>
          <Button size="sm" onClick={() => openEditor(entry)}>
            Edit
          </Button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </header>

      {entry.breached && (
        <div className={styles.breach}>
          <span className={styles.breachDot} />
          <div className={styles.breachText}>
            Found in a known breach. Change it now.
          </div>
          <Button size="sm" variant="primary" onClick={changePassword}>
            Generate new
          </Button>
        </div>
      )}

      <div className={styles.fields}>
        {password.username && (
          <FieldCard label="Username">
            <div className={styles.fieldRow}>
              <span className={styles.value}>{password.username}</span>
              <button
                type="button"
                className={styles.link}
                onClick={() => copy(password.username, "Username copied")}
              >
                Copy
              </button>
            </div>
          </FieldCard>
        )}

        <FieldCard label="Password">
          <div className={styles.fieldRow}>
            <span className={styles.secret}>
              {revealed ? password.password : "•".repeat(Math.min(24, password.password.length))}
            </span>
            <div className={styles.linkGroup}>
              <button
                type="button"
                className={styles.link}
                onClick={() => setRevealed((v) => !v)}
              >
                {revealed ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className={styles.link}
                onClick={() => copy(password.password, "Password copied")}
              >
                Copy
              </button>
            </div>
          </div>

          {strength && (
            <div className={styles.strengthRow}>
              <Meter
                value={reuseCount > 1 ? 30 : strength.score}
                color={strengthColor(reuseCount > 1 ? "Reused" : strength.label)}
                width="100%"
              />
              <span
                style={{
                  font: "600 11px var(--font-sans)",
                  color: strengthColor(reuseCount > 1 ? "Reused" : strength.label),
                  whiteSpace: "nowrap",
                }}
              >
                {strength.label}
                {reuseCount > 1 && ` · reused on ${reuseCount} sites`}
              </span>
            </div>
          )}
        </FieldCard>

        {password.totpSecret && (
          <FieldCard label="One-time code">
            <div className={styles.fieldRow}>
              <span className={styles.totp}>{totp.display}</span>
              <button
                type="button"
                className={styles.link}
                onClick={() => copy(totp.code, "Code copied")}
              >
                Copy
              </button>
            </div>
            <div className={styles.strengthRow}>
              <TotpBar seconds={totp.seconds} period={totp.period} />
              <span className={styles.seconds}>{totp.seconds}s</span>
            </div>
            {totp.error && <div className={styles.error}>{totp.error}</div>}
          </FieldCard>
        )}

        {(folder || entryTags.length > 0) && (
          <FieldCard label="Folder · Tags">
            <div className={styles.tagRow}>
              {folder && (
                <span className={styles.folder}>
                  <span
                    className={styles.swatch}
                    style={{ background: folder.color }}
                  />
                  {folder.name}
                </span>
              )}
              {entryTags.map((tag) => (
                <span key={tag.id} className={styles.tag}>
                  {tag.name}
                </span>
              ))}
            </div>
          </FieldCard>
        )}

        {password.notes && (
          <FieldCard label="Notes">
            <div className={styles.notes}>{password.notes}</div>
          </FieldCard>
        )}
      </div>

      <footer className={styles.foot}>
        <span>
          Modified {relativeDate(entry.updatedAt).toLowerCase()}
          {entry.pwChangedAt &&
            ` · password changed ${relativeDate(entry.pwChangedAt).toLowerCase()}`}
        </span>
        <div className={styles.footActions}>
          <button
            type="button"
            className={styles.footLink}
            onClick={() => setShowHistory(true)}
          >
            History
          </button>
          <button
            type="button"
            className={styles.footLink}
            onClick={() =>
              confirm(
                {
                  kind: "reversible",
                  title: `Move ${password.name} to trash?`,
                  body: "It stays in the trash for 30 days and can be restored any time.",
                  item: {
                    name: password.name,
                    mono: entryMono(entry),
                    sub: `Password · ${password.username || "no username"}`,
                  },
                  confirmLabel: "Move to trash",
                },
                async () => {
                  await trashEntry(entry.id);
                  notify.info(`${password.name} moved to trash`, {
                    label: "Undo",
                    run: () => void restoreEntry(entry.id),
                  });
                  onClose();
                },
              )
            }
          >
            Move to trash
          </button>
        </div>
      </footer>

      {dialog}
    </aside>
  );
}

function FieldCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.card}>
      <div className="t-eyebrow">{label}</div>
      {children}
    </div>
  );
}
