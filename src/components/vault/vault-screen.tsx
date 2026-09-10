"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Meter, Pill } from "@/components/ui/primitives";
import { useVault } from "./vault-provider";
import { useChrome } from "./app-frame";
import { ItemDetail } from "./item-detail";
import { EmptyState } from "./empty-state";
import {
  entryColor,
  entryMono,
  entryTitle,
  isPassword,
  type VaultEntry,
} from "@/lib/vault/types";
import { strengthColor, type Strength } from "@/lib/vault/strength";
import styles from "./table.module.css";

type Sort = "recent" | "name" | "strength";

export function VaultScreen() {
  const params = useSearchParams();
  const { entries, folders, tags, copy } = useVault();
  const { openNew } = useChrome();

  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const item = params.get("item");
    if (item) setSelected(item);
  }, [params]);

  const passwords = useMemo(
    () => entries.filter((e) => e.type === "PASSWORD" && !e.deletedAt),
    [entries],
  );

  // "reused on N sites" comes from the keyed digest the client computes
  const reuseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of passwords) {
      if (!e.reusedKey) continue;
      counts.set(e.reusedKey, (counts.get(e.reusedKey) ?? 0) + 1);
    }
    return counts;
  }, [passwords]);

  const visible = useMemo(() => {
    let list = passwords;

    if (filter === "favorites") list = list.filter((e) => e.favorite);
    else if (filter.startsWith("folder:")) {
      const id = filter.slice(7);
      list = list.filter((e) => e.folderId === id);
    } else if (filter.startsWith("tag:")) {
      const id = filter.slice(4);
      list = list.filter((e) => e.tagIds.includes(id));
    }

    return [...list].sort((a, b) => {
      if (sort === "name") return entryTitle(a).localeCompare(entryTitle(b));
      if (sort === "strength") return (a.strength ?? 0) - (b.strength ?? 0);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [passwords, filter, sort]);

  const needsAttention = passwords.filter(
    (e) => e.breached || (e.strength !== null && e.strength < 40),
  ).length;

  const detail = selected ? entries.find((e) => e.id === selected) : null;

  if (passwords.length === 0) {
    return (
      <EmptyState
        title="Your vault is empty"
        body="Add your first password, or import from another manager in one step."
        primary={{ label: "Add password", onClick: () => openNew("PASSWORD") }}
        secondary={{ label: "Import CSV", href: "/settings/import" }}
      />
    );
  }

  return (
    <>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h1 className="t-page" style={{ margin: 0 }}>
            Passwords
          </h1>
          <div className="t-sub">
            {passwords.length} {passwords.length === 1 ? "item" : "items"}
            {needsAttention > 0 && ` · ${needsAttention} need attention`}
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.filters}>
            <Pill active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </Pill>
            <Pill
              active={filter === "favorites"}
              onClick={() => setFilter("favorites")}
            >
              ★ Favorites
            </Pill>
            {folders.map((folder) => (
              <Pill
                key={folder.id}
                active={filter === `folder:${folder.id}`}
                onClick={() => setFilter(`folder:${folder.id}`)}
              >
                {folder.name}
              </Pill>
            ))}
            {tags.length > 0 && (
              <select
                className={styles.tagSelect}
                value={filter.startsWith("tag:") ? filter : ""}
                onChange={(e) => setFilter(e.target.value || "all")}
              >
                <option value="">Tags ▾</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={`tag:${tag.id}`}>
                    {tag.name} ({tag.count})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className={styles.divider} />

          <label className={styles.sort}>
            Sort:
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="strength">Weakest first</option>
            </select>
          </label>
        </div>
      </div>

      <div className={`glass ${styles.table}`}>
        <div className={styles.headerRow}>
          <span>Name</span>
          <span>Username</span>
          <span>Folder</span>
          <span>Strength</span>
          <span>Modified</span>
          <span />
        </div>

        <div className={styles.rows}>
          {visible.length === 0 && (
            <div className={styles.noRows}>Nothing in this filter yet.</div>
          )}

          {visible.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              selected={entry.id === selected}
              folderName={folders.find((f) => f.id === entry.folderId)?.name}
              folderColor={folders.find((f) => f.id === entry.folderId)?.color}
              reused={
                entry.reusedKey ? (reuseCounts.get(entry.reusedKey) ?? 1) > 1 : false
              }
              onOpen={() => setSelected(entry.id)}
              onCopy={() =>
                isPassword(entry) &&
                copy(entry.payload.password, "Password copied")
              }
            />
          ))}
        </div>
      </div>

      {detail && (
        <ItemDetail
          entry={detail}
          reuseCount={
            detail.reusedKey ? (reuseCounts.get(detail.reusedKey) ?? 1) : 1
          }
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function Row({
  entry,
  selected,
  folderName,
  folderColor,
  reused,
  onOpen,
  onCopy,
}: {
  entry: VaultEntry;
  selected: boolean;
  folderName?: string;
  folderColor?: string;
  reused: boolean;
  onOpen: () => void;
  onCopy: () => void;
}) {
  const label: Strength["label"] | "Reused" = reused
    ? "Reused"
    : entry.strength === null
      ? "Weak"
      : entry.strength < 40
        ? "Weak"
        : entry.strength < 62
          ? "Fair"
          : entry.strength < 84
            ? "Good"
            : "Strong";

  return (
    <div
      className={styles.row}
      data-selected={selected || undefined}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
    >
      <div className={styles.nameCell}>
        <span className={styles.mono} style={{ background: entryColor(entry) }}>
          {entryMono(entry)}
        </span>
        <span className={styles.name}>{entryTitle(entry)}</span>
        {entry.favorite && <span className={styles.star}>★</span>}
        {entry.hasTotp && <span className={styles.badge}>2FA</span>}
        {entry.breached && <span className={styles.alert}>Breached</span>}
      </div>

      <span className={styles.muted}>
        {isPassword(entry) ? entry.payload.username : ""}
      </span>

      <span className={styles.folder}>
        {folderName ? (
          <>
            <span
              className={styles.swatch}
              style={{ background: folderColor ?? "var(--muted)" }}
            />
            {folderName}
          </>
        ) : (
          <span style={{ color: "var(--faint)" }}>—</span>
        )}
      </span>

      <div className={styles.strength}>
        <Meter
          value={reused ? 30 : (entry.strength ?? 0)}
          color={strengthColor(label)}
        />
        <span style={{ color: strengthColor(label) }}>{label}</span>
      </div>

      <span className={styles.faint}>{relativeDate(entry.updatedAt)}</span>

      <button
        type="button"
        className={styles.copy}
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
      >
        Copy
      </button>
    </div>
  );
}

export function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
}
