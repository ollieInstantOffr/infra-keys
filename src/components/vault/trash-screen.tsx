"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { useVault } from "./vault-provider";
import { EmptyState } from "./empty-state";
import { entryMono, entryTitle } from "@/lib/vault/types";
import styles from "./table.module.css";

const COLUMNS = "2fr 1.5fr 1.5fr 190px";

export function TrashScreen() {
  const { entries, restoreEntry, purgeEntry, emptyTrash } = useVault();
  const { dialog, confirm } = useDialog();

  const trashed = useMemo(
    () =>
      entries
        .filter((e) => e.deletedAt)
        .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")),
    [entries],
  );

  const notes = trashed.filter((e) => e.type === "NOTE").length;

  if (trashed.length === 0) {
    return (
      <EmptyState
        icon="trash"
        title="Trash is empty"
        body="Deleted items stay here for 30 days before they're gone for good."
      />
    );
  }

  return (
    <>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h1 className="t-page" style={{ margin: 0 }}>
            Trash
          </h1>
          <div className="t-sub">
            {trashed.length} {trashed.length === 1 ? "item" : "items"} · deleted
            items are erased after 30 days
          </div>
        </div>

        <Button
          onClick={() =>
            confirm(
              {
                kind: "irreversible",
                title: "Empty trash?",
                body: `${trashed.length} ${trashed.length === 1 ? "item" : "items"} will be deleted permanently${notes ? `, including ${notes} secure ${notes === 1 ? "note" : "notes"}` : ""}.`,
                typed: "DELETE",
                confirmLabel: "Empty trash",
              },
              async () => {
                await emptyTrash();
                notify.success("Trash emptied");
              },
            )
          }
        >
          Empty trash
        </Button>
      </div>

      <div className={`glass ${styles.table}`}>
        <div className={styles.headerRow} style={{ gridTemplateColumns: COLUMNS }}>
          <span>Item</span>
          <span>Deleted</span>
          <span>Erased in</span>
          <span />
        </div>

        <div className={styles.rows}>
          {trashed.map((entry) => {
            const days = entry.eraseAt
              ? Math.max(
                  0,
                  Math.ceil((new Date(entry.eraseAt).getTime() - Date.now()) / 864e5),
                )
              : 30;
            const urgent = days <= 3;

            return (
              <div
                key={entry.id}
                className={styles.row}
                style={{ gridTemplateColumns: COLUMNS, cursor: "default" }}
              >
                <div className={styles.nameCell}>
                  <span
                    className={styles.mono}
                    style={{ background: "var(--wash)", color: "var(--muted)" }}
                  >
                    {entryMono(entry)}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span className={styles.name} style={{ color: "var(--text)" }}>
                      {entryTitle(entry)}
                    </span>
                    <span className={styles.faint} style={{ fontSize: 11 }}>
                      {entry.type === "NOTE" ? "Secure note" : "Password"}
                    </span>
                  </div>
                </div>

                <span className={styles.muted}>
                  {entry.deletedAt
                    ? new Date(entry.deletedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </span>

                <span
                  style={{
                    font: "600 13px var(--font-sans)",
                    color: urgent ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {days} {days === 1 ? "day" : "days"}
                </span>

                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      await restoreEntry(entry.id);
                      notify.success(`${entryTitle(entry)} restored`);
                    }}
                  >
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      confirm(
                        {
                          kind: "irreversible",
                          title: `Delete ${entryTitle(entry)} forever?`,
                          body: "This removes the item, its password history and 2FA secret. There is no undo.",
                          item: {
                            name: entryTitle(entry),
                            mono: entryMono(entry),
                            sub: entry.deletedAt
                              ? `In trash since ${new Date(entry.deletedAt).toLocaleDateString()}`
                              : "In trash",
                          },
                          cancelLabel: "Keep",
                          confirmLabel: "Delete forever",
                        },
                        async () => {
                          await purgeEntry(entry.id);
                          notify.success("Deleted permanently");
                        },
                      )
                    }
                  >
                    Delete now
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dialog}
    </>
  );
}
