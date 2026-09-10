"use client";

import { useState } from "react";
import { Button, Field } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { Card, PageHead, settingsStyles as s } from "./pieces";
import { seal, tagIndex } from "@/lib/crypto/vault";

const COLORS = ["#ea580c", "#78716c", "#fdba74", "#1c1917", "#57534e", "#a8a29e"];

export function FoldersSettings() {
  const { folders, tags, entries, vaultKey, refresh } = useVault();
  const { dialog, confirm } = useDialog();

  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState(COLORS[0]);
  const [tagName, setTagName] = useState("");
  const [busy, setBusy] = useState(false);

  async function addFolder() {
    const key = vaultKey();
    if (!key || !folderName.trim()) return;

    setBusy(true);
    try {
      const sealed = await seal(key, folderName.trim());
      const res = await fetch("/api/vault/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...sealed, color: folderColor }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setFolderName("");
      await refresh();
      notify.success("Folder added");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  async function addTag() {
    const key = vaultKey();
    if (!key || !tagName.trim()) return;

    setBusy(true);
    try {
      const sealed = await seal(key, tagName.trim());
      const res = await fetch("/api/vault/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...sealed,
          nameHash: await tagIndex(key, tagName),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setTagName("");
      await refresh();
      notify.success("Tag added");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Folders & tags" crumb="Settings › Folders & tags" />

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ font: "700 15px var(--font-sans)" }}>Folders</span>
        </div>

        <div>
          {folders.map((folder, i) => {
            const count = entries.filter(
              (e) => !e.deletedAt && e.folderId === folder.id,
            ).length;

            return (
              <div
                key={folder.id}
                className={s.deviceRow}
                data-last={i === folders.length - 1 || undefined}
              >
                <span
                  className={s.deviceDot}
                  style={{ background: folder.color, borderRadius: 2 }}
                />
                <div className={s.deviceText}>
                  <span className={s.deviceName}>{folder.name}</span>
                  <span className={s.deviceMeta}>
                    {count} {count === 1 ? "item" : "items"}
                  </span>
                </div>
                <button
                  type="button"
                  className={s.deviceAction}
                  onClick={() =>
                    confirm(
                      {
                        kind: "reversible",
                        title: `Delete the “${folder.name}” folder?`,
                        body: `Its ${count} ${count === 1 ? "item is" : "items are"} kept and moved to “No folder”. Only the folder goes away.`,
                        confirmLabel: "Delete folder",
                      },
                      async () => {
                        await fetch(`/api/vault/folders/${folder.id}`, {
                          method: "DELETE",
                        });
                        await refresh();
                        notify.success("Folder deleted");
                      },
                    )
                  }
                >
                  Delete
                </button>
              </div>
            );
          })}
          {folders.length === 0 && (
            <div className={s.rowBody}>No folders yet.</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Field
              label="New folder"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Work"
              onKeyDown={(e) => e.key === "Enter" && addFolder()}
            />
          </div>
          <div style={{ display: "flex", gap: 4, paddingBottom: 4 }}>
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Colour ${color}`}
                onClick={() => setFolderColor(color)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: color,
                  border:
                    folderColor === color
                      ? "2px solid var(--ink)"
                      : "1px solid var(--line-12)",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <Button variant="primary" loading={busy} onClick={addFolder}>
            Add
          </Button>
        </div>

        <div className={s.rowBody}>
          Deleting a folder moves its items to “No folder”, never to trash.
        </div>
      </Card>

      <Card>
        <span style={{ font: "700 15px var(--font-sans)" }}>Tags</span>

        <div className={s.pillList}>
          {tags.map((tag) => (
            <span key={tag.id} className={s.tagPill}>
              {tag.name}
              <span className={s.tagCount}>
                {tag.count === 0 ? "0 · unused" : tag.count}
              </span>
              <button
                type="button"
                className={s.tagRemove}
                aria-label={`Remove ${tag.name}`}
                onClick={async () => {
                  await fetch(`/api/vault/tags/${tag.id}`, { method: "DELETE" });
                  await refresh();
                }}
              >
                ✕
              </button>
            </span>
          ))}
          {tags.length === 0 && <span className={s.rowBody}>No tags yet.</span>}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Field
              label="New tag"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="banking"
              onKeyDown={(e) => e.key === "Enter" && addTag()}
            />
          </div>
          <Button variant="primary" loading={busy} onClick={addTag}>
            Add
          </Button>
        </div>
      </Card>

      {dialog}
    </>
  );
}
