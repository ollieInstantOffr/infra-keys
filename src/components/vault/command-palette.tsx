"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "./vault-provider";
import { useChrome } from "./app-frame";
import { entryMono, entryTitle, isPassword, type VaultEntry } from "@/lib/vault/types";
import styles from "./command-palette.module.css";

type Row =
  | { kind: "entry"; entry: VaultEntry }
  | { kind: "action"; id: string; label: string; hint: string; run: () => void };

/** ⌘K. Searches names, usernames, urls, folders and tags — never secrets. */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { entries, folders, tags, copy } = useVault();
  const { openEditor, openNew } = useChrome();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();

    const matches = entries
      .filter((e) => !e.deletedAt)
      .filter((entry) => {
        if (!q) return true;
        const folder = folders.find((f) => f.id === entry.folderId)?.name ?? "";
        const entryTags = entry.tagIds
          .map((id) => tags.find((t) => t.id === id)?.name ?? "")
          .join(" ");
        const haystack =
          entry.payload.kind === "PASSWORD"
            ? [entry.payload.name, entry.payload.username, entry.payload.url]
            : [entry.payload.title, entry.payload.body.slice(0, 200)];
        return [...haystack, folder, entryTags]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 8)
      .map((entry): Row => ({ kind: "entry", entry }));

    const actions: Row[] = [];
    if (q) {
      actions.push({
        kind: "action",
        id: "create",
        label: `Create “${query.trim()}”`,
        hint: "New password",
        run: () => {
          openNew("PASSWORD");
          onClose();
        },
      });
    }

    return [...matches, ...actions];
  }, [query, entries, folders, tags, openNew, onClose]);

  useEffect(() => setCursor(0), [query]);

  if (!open) return null;

  function activate(row: Row) {
    if (row.kind === "action") return row.run();
    onClose();
    if (row.entry.type === "NOTE") router.push(`/notes?item=${row.entry.id}`);
    else openEditor(row.entry);
  }

  return (
    <div className={styles.scrim} onMouseDown={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search your vault"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.inputRow}>
          <span className={styles.icon} aria-hidden />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search passwords, notes, tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(rows.length - 1, c + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              }
              if (e.key === "Enter" && rows[cursor]) {
                e.preventDefault();
                activate(rows[cursor]);
              }
            }}
          />
          <kbd className={styles.esc}>esc</kbd>
        </div>

        <div className={styles.results}>
          {rows.length === 0 && (
            <div className={styles.empty}>
              No matches{query ? ` for “${query.trim()}”` : ""}. Try a different
              spelling, or check the trash.
            </div>
          )}

          {rows.map((row, i) =>
            row.kind === "entry" ? (
              <button
                key={row.entry.id}
                type="button"
                className={styles.row}
                data-active={i === cursor || undefined}
                onMouseEnter={() => setCursor(i)}
                onClick={() => activate(row)}
              >
                <span className={styles.mono}>{entryMono(row.entry)}</span>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{entryTitle(row.entry)}</span>
                  <span className={styles.rowSub}>
                    {isPassword(row.entry)
                      ? row.entry.payload.username || row.entry.payload.url
                      : "Secure note"}
                  </span>
                </span>
                {isPassword(row.entry) && (
                  <span
                    className={styles.copy}
                    onClick={(e) => {
                      e.stopPropagation();
                      void copy(
                        (row.entry.payload as { password: string }).password,
                        "Password copied",
                      );
                      onClose();
                    }}
                  >
                    Copy
                  </span>
                )}
              </button>
            ) : (
              <button
                key={row.id}
                type="button"
                className={styles.row}
                data-active={i === cursor || undefined}
                onMouseEnter={() => setCursor(i)}
                onClick={() => activate(row)}
              >
                <span className={styles.mono} data-action>
                  +
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{row.label}</span>
                  <span className={styles.rowSub}>{row.hint}</span>
                </span>
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
