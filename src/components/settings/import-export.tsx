"use client";

import { useRef, useState } from "react";
import { Button, Meter } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { Card, PageHead, Row, RowCard, settingsStyles as s } from "./pieces";
import { downloadBlob } from "@/lib/vault/recovery-pdf";
import {
  parseImport,
  SOURCE_LABEL,
  toCsv,
  type ImportReport,
} from "@/lib/vault/porting";
import { isPassword, type PasswordPayload } from "@/lib/vault/types";
import { seal, wrapVaultKey, recoveryKeyFrom, newRecoverySalt } from "@/lib/crypto/vault";

const SOURCES = [
  { mono: "Ch", name: "Chrome", format: "CSV" },
  { mono: "Sf", name: "Safari / iCloud", format: "CSV" },
  { mono: "1P", name: "1Password", format: "CSV · 1PUX" },
  { mono: "Bw", name: "Bitwarden", format: "JSON · CSV" },
  { mono: "LP", name: "LastPass", format: "CSV" },
  { mono: "·k", name: "keys backup", format: ".keys encrypted" },
];

export function ImportExportSettings() {
  const { entries, createEntry, vaultKey, refresh } = useVault();
  const { dialog, confirm } = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);

  const existing = entries.filter((e) => !e.deletedAt && isPassword(e));

  const duplicates = report
    ? report.rows.filter((row) =>
        existing.some(
          (e) =>
            (e.payload as PasswordPayload).name.toLowerCase() ===
              row.name.toLowerCase() &&
            (e.payload as PasswordPayload).username.toLowerCase() ===
              row.username.toLowerCase(),
        ),
      ).length
    : 0;

  const willImport = report
    ? report.rows.length - (skipDuplicates ? duplicates : 0)
    : 0;

  async function pick(selected: File) {
    setFile(selected);
    const text = await selected.text();
    setReport(parseImport(text));
  }

  async function runImport() {
    if (!report) return;
    setProgress(0);

    const rows = skipDuplicates
      ? report.rows.filter(
          (row) =>
            !existing.some(
              (e) =>
                (e.payload as PasswordPayload).name.toLowerCase() ===
                  row.name.toLowerCase() &&
                (e.payload as PasswordPayload).username.toLowerCase() ===
                  row.username.toLowerCase(),
            ),
        )
      : report.rows;

    let done = 0;
    for (const row of rows) {
      const { folderHint, ...payload } = row;
      await createEntry(payload);
      done += 1;
      setProgress(Math.round((done / rows.length) * 100));
    }

    setProgress(null);
    setReport(null);
    setFile(null);
    await refresh();
    notify.success(`Imported ${rows.length} item${rows.length === 1 ? "" : "s"}`);
  }

  // ---------------------------------------------------------- exporting

  async function exportEncrypted() {
    const key = vaultKey();
    if (!key) return;

    // The backup is sealed under a fresh code so it can be opened without
    // this device — the same shape as the recovery kit.
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      items: entries
        .filter((e) => !e.deletedAt)
        .map((e) => ({ type: e.type, payload: e.payload })),
    });

    const salt = newRecoverySalt();
    const passphrase = prompt(
      "Choose a passphrase for this backup. You'll need it to restore — we can't recover it.",
    );
    if (!passphrase) return;

    const backupKey = await recoveryKeyFrom(passphrase, salt);
    const sealed = await seal(backupKey, payload);

    downloadBlob(
      new Blob(
        [JSON.stringify({ format: "keys.backup.v1", salt, ...sealed }, null, 2)],
        { type: "application/octet-stream" },
      ),
      `keys-backup-${new Date().toISOString().slice(0, 10)}.keys`,
    );
    notify.success("Encrypted backup downloaded");
  }

  function exportCsv() {
    const rows = entries
      .filter((e) => !e.deletedAt && isPassword(e))
      .map((e) => e.payload as PasswordPayload);

    downloadBlob(
      new Blob([toCsv(rows)], { type: "text/csv" }),
      `keys-export-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    notify.warning("Plain CSV downloaded — delete it once you're done.");
  }

  return (
    <>
      <PageHead title="Import / export" crumb="Settings › Import / export" />

      {/* ------------------------------------------------------- import */}

      <Card>
        <span style={{ font: "700 15px var(--font-sans)" }}>Import</span>

        {!report ? (
          <>
            <div className={s.sourceGrid}>
              {SOURCES.map((source) => (
                <button
                  key={source.name}
                  type="button"
                  className={s.source}
                  onClick={() => fileRef.current?.click()}
                >
                  <span className={s.sourceMono}>{source.mono}</span>
                  <span className={s.sourceText}>
                    <span className={s.sourceName}>{source.name}</span>
                    <span className={s.sourceFormat}>{source.format}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className={s.rowBody}>
              Files are parsed on this device and never uploaded.
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 16px",
                borderRadius: 14,
                background: "var(--surface)",
                border: "1px solid var(--line-06)",
              }}
            >
              <span className={s.sourceMono}>csv</span>
              <div className={s.sourceText} style={{ flex: 1 }}>
                <span className={s.sourceName}>{file?.name}</span>
                <span className={s.sourceFormat}>
                  {file ? `${formatBytes(file.size)} · ` : ""}
                  {SOURCE_LABEL[report.source]}
                </span>
              </div>
              <button
                type="button"
                className={s.deviceAction}
                onClick={() => fileRef.current?.click()}
              >
                Replace file
              </button>
            </div>

            <div className={s.statGrid} style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <Stat number={report.rows.length} label="passwords to import" />
              <Stat number={duplicates} label="duplicates of existing items" accent />
              <Stat number={report.missingPassword} label="rows missing a password" muted />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                font: "500 13px var(--font-sans)",
                color: "var(--ink-2)",
              }}
            >
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                style={{ accentColor: "var(--accent)", width: 18, height: 18 }}
              />
              Skip duplicates (keep my existing versions)
            </label>

            {progress !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Meter value={progress} width="100%" />
                <span className="t-sub">{progress}%</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setReport(null);
                  setFile(null);
                }}
              >
                ← Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={willImport === 0 || progress !== null}
                onClick={runImport}
              >
                Import {willImport} item{willImport === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) void pick(selected);
            e.target.value = "";
          }}
        />
      </Card>

      {/* ------------------------------------------------------- export */}

      <RowCard>
        <Row
          title="Encrypted backup (.keys)"
          body="Everything incl. notes, 2FA secrets and history. Needs the passphrase you choose to open."
          control={
            <Button size="sm" onClick={exportEncrypted}>
              Export
            </Button>
          }
        />
        <Row
          title="Plain CSV"
          body="Readable by anyone who has the file. Delete it when done."
          last
          control={
            <Button
              size="sm"
              onClick={() =>
                confirm(
                  {
                    kind: "warning",
                    title: `Export ${existing.length} passwords as plain CSV?`,
                    body: "Anyone with the file can read every password.",
                    note: "Delete the file as soon as you've imported it elsewhere.",
                    noteTone: "warn",
                    confirmTone: "primary",
                    confirmLabel: "Export anyway",
                  },
                  () => exportCsv(),
                )
              }
            >
              Export…
            </Button>
          }
        />
      </RowCard>

      {dialog}
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Stat({
  number,
  label,
  accent,
  muted,
}: {
  number: number;
  label: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={s.stat}>
      <span
        className={s.statNumber}
        style={{
          color: accent ? "var(--accent)" : muted ? "var(--muted)" : undefined,
        }}
      >
        {number}
      </span>
      <span className={s.statLabel}>{label}</span>
    </div>
  );
}
