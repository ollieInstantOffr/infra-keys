"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { useVault } from "./vault-provider";
import { useChrome } from "./app-frame";
import { EmptyState } from "./empty-state";
import { relativeDate } from "./vault-screen";
import type { NotePayload, VaultEntry } from "@/lib/vault/types";
import styles from "./table.module.css";
import detail from "./item-detail.module.css";

export function NotesScreen() {
  const params = useSearchParams();
  const { entries, folders } = useVault();
  const { openNew } = useChrome();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const item = params.get("item");
    if (item) setSelected(item);
  }, [params]);

  const notes = useMemo(
    () => entries.filter((e) => e.type === "NOTE" && !e.deletedAt),
    [entries],
  );

  const open = selected ? notes.find((n) => n.id === selected) : null;

  if (notes.length === 0) {
    return (
      <EmptyState
        title="No secure notes yet"
        body="Recovery codes, licence keys, passport numbers — anything you'd rather not leave in a text file."
        primary={{ label: "New note", onClick: () => openNew("NOTE") }}
      />
    );
  }

  return (
    <>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h1 className="t-page" style={{ margin: 0 }}>
            Secure notes
          </h1>
          <div className="t-sub">
            {notes.length} {notes.length === 1 ? "note" : "notes"} · encrypted
            end-to-end
          </div>
        </div>
        <Button variant="primary" onClick={() => openNew("NOTE")}>
          + New note
        </Button>
      </div>

      <div className={`glass ${styles.table}`}>
        <div className={styles.headerRow} style={{ gridTemplateColumns: "2fr 3fr 1fr 120px" }}>
          <span>Title</span>
          <span>Preview</span>
          <span>Folder</span>
          <span>Modified</span>
        </div>

        <div className={styles.rows}>
          {notes.map((note) => {
            const payload = note.payload as NotePayload;
            const folder = folders.find((f) => f.id === note.folderId);

            return (
              <div
                key={note.id}
                className={styles.row}
                style={{ gridTemplateColumns: "2fr 3fr 1fr 120px" }}
                data-selected={note.id === selected || undefined}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(note.id)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && setSelected(note.id)
                }
              >
                <div className={styles.nameCell}>
                  <span className={styles.mono} style={{ background: "var(--line-06)" }}>
                    <span
                      style={{
                        width: 12,
                        height: 14,
                        border: "2px solid var(--muted)",
                        borderRadius: 2,
                      }}
                    />
                  </span>
                  <span className={styles.name}>{payload.title}</span>
                </div>

                <span className={styles.muted} style={{ paddingRight: 20 }}>
                  {payload.body.replace(/\s+/g, " ").slice(0, 120)}
                </span>

                <span className={styles.folder}>
                  {folder ? (
                    <>
                      <span
                        className={styles.swatch}
                        style={{ background: folder.color }}
                      />
                      {folder.name}
                    </>
                  ) : (
                    <span style={{ color: "var(--faint)" }}>—</span>
                  )}
                </span>

                <span className={styles.faint}>{relativeDate(note.updatedAt)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {open && <NoteEditor entry={open} onClose={() => setSelected(null)} />}
    </>
  );
}

/** The slide-over editor. Saves as you stop typing, like the design implies. */
function NoteEditor({ entry, onClose }: { entry: VaultEntry; onClose: () => void }) {
  const { updateEntry, trashEntry, restoreEntry, copy, folders, tags } = useVault();
  const { dialog, confirm } = useDialog();
  const payload = entry.payload as NotePayload;

  const [title, setTitle] = useState(payload.title);
  const [body, setBody] = useState(payload.body);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setTitle(payload.title);
    setBody(payload.body);
    setSaved(true);
  }, [entry.id, payload.title, payload.body]);

  useEffect(() => {
    if (title === payload.title && body === payload.body) return;
    setSaved(false);
    const timer = setTimeout(async () => {
      await updateEntry(entry.id, { kind: "NOTE", title, body });
      setSaved(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [title, body, entry.id, payload.title, payload.body, updateEntry]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const folder = folders.find((f) => f.id === entry.folderId);
  const entryTags = entry.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <aside
      className={detail.panel}
      style={{ width: 560 }}
      aria-label={`${payload.title} note`}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {folder && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 8,
                background: "var(--surface)",
                border: "1px solid var(--line-10)",
                font: "600 12px var(--font-sans)",
              }}
            >
              <span className={detail.swatch} style={{ background: folder.color }} />
              {folder.name}
            </span>
          )}
          {entryTags.map((tag) => (
            <span key={tag.id} className={detail.tag}>
              {tag.name}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          <Button size="sm" onClick={() => copy(body, "Note copied")}>
            Copy all
          </Button>
          <button type="button" className={detail.iconButton} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Note title"
        style={{
          font: "800 24px var(--font-sans)",
          letterSpacing: "-0.02em",
          border: "none",
          background: "transparent",
          outline: "none",
          color: "var(--ink)",
          padding: 0,
        }}
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Note contents"
        style={{
          flex: 1,
          resize: "none",
          background: "var(--surface)",
          borderRadius: 14,
          padding: 18,
          font: "500 14px/1.7 var(--font-mono)",
          color: "var(--ink-2)",
          outline: "none",
          border: "1px solid var(--line-06)",
          minHeight: 0,
        }}
      />

      <div className={detail.foot}>
        <span>{saved ? "Saved · encrypted on this device" : "Saving…"}</span>
        <button
          type="button"
          className={detail.footLink}
          onClick={() =>
            confirm(
              {
                kind: "reversible",
                title: `Move “${title}” to trash?`,
                body: "It stays in the trash for 30 days and can be restored any time.",
                confirmLabel: "Move to trash",
              },
              async () => {
                await trashEntry(entry.id);
                notify.info(`“${title}” moved to trash`, {
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

      {dialog}
    </aside>
  );
}
