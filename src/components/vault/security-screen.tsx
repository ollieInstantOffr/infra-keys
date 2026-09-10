"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Pill, Spinner } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { useVault } from "./vault-provider";
import { useChrome } from "./app-frame";
import { relativeDate } from "./vault-screen";
import { breachCount } from "@/lib/vault/breach";
import { estimateStrength } from "@/lib/vault/strength";
import {
  entryColor,
  entryMono,
  isPassword,
  type PasswordPayload,
  type VaultEntry,
} from "@/lib/vault/types";
import { generate, defaultOptions } from "@/lib/vault/generator";
import styles from "./security.module.css";
import table from "./table.module.css";

type IssueKind = "breached" | "weak" | "reused" | "old" | "no2fa";

type Issue = {
  entry: VaultEntry;
  kind: IssueKind;
  detail: string;
};

const TABS: { id: "action" | IssueKind; label: string }[] = [
  { id: "action", label: "Needs action" },
  { id: "reused", label: "Reused" },
  { id: "old", label: "Old" },
  { id: "no2fa", label: "Add 2FA" },
];

export function SecurityScreen() {
  const { entries, updateEntry, copy, settings } = useVault();
  const { openEditor } = useChrome();
  const [tab, setTab] = useState<"action" | IssueKind>("action");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);

  const passwords = useMemo(
    () => entries.filter((e) => !e.deletedAt && isPassword(e)),
    [entries],
  );

  const reuseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of passwords) {
      if (e.reusedKey) counts.set(e.reusedKey, (counts.get(e.reusedKey) ?? 0) + 1);
    }
    return counts;
  }, [passwords]);

  const issues = useMemo<Issue[]>(() => {
    const found: Issue[] = [];
    const yearAgo = Date.now() - 365 * 864e5;

    for (const entry of passwords) {
      const payload = entry.payload as PasswordPayload;
      const key = `${entry.id}`;
      if (ignored.includes(key)) continue;

      const strength = estimateStrength(payload.password);
      const reused = entry.reusedKey ? (reuseCounts.get(entry.reusedKey) ?? 1) : 1;
      const changedAt = entry.pwChangedAt ? new Date(entry.pwChangedAt).getTime() : 0;

      if (entry.breached) {
        found.push({
          entry,
          kind: "breached",
          detail: `Appeared in a known breach${strength.label === "Weak" ? " · also weak" : ""}`,
        });
        continue;
      }
      if (strength.label === "Weak") {
        found.push({
          entry,
          kind: "weak",
          detail: `${payload.password.length} characters · ${strength.warnings[0] ?? strength.crackTime}`,
        });
        continue;
      }
      if (reused > 1) {
        const others = passwords
          .filter((e) => e.id !== entry.id && e.reusedKey === entry.reusedKey)
          .map((e) => (e.payload as PasswordPayload).name);
        found.push({
          entry,
          kind: "reused",
          detail: `Same password as ${others.slice(0, 2).join(" and ")}${others.length > 2 ? ` and ${others.length - 2} more` : ""}`,
        });
        continue;
      }
      if (changedAt && changedAt < yearAgo) {
        found.push({
          entry,
          kind: "old",
          detail: `Last changed ${relativeDate(entry.pwChangedAt!).toLowerCase()}`,
        });
        continue;
      }
      if (!payload.totpSecret) {
        found.push({
          entry,
          kind: "no2fa",
          detail: "No one-time code saved for this login",
        });
      }
    }

    return found;
  }, [passwords, reuseCounts, ignored]);

  /**
   * The breakdown counts every condition a password meets. The list below
   * shows one primary issue per item, so these two deliberately disagree:
   * a weak, reused password is one row but two tallies.
   */
  const counts = useMemo(() => {
    const tally: Record<IssueKind, number> = {
      breached: 0,
      weak: 0,
      reused: 0,
      old: 0,
      no2fa: 0,
    };
    const yearAgo = Date.now() - 365 * 864e5;

    for (const entry of passwords) {
      if (ignored.includes(entry.id)) continue;
      const payload = entry.payload as PasswordPayload;
      const changedAt = entry.pwChangedAt ? new Date(entry.pwChangedAt).getTime() : 0;

      if (entry.breached) tally.breached += 1;
      if (estimateStrength(payload.password).label === "Weak") tally.weak += 1;
      if (entry.reusedKey && (reuseCounts.get(entry.reusedKey) ?? 1) > 1) {
        tally.reused += 1;
      }
      if (changedAt && changedAt < yearAgo) tally.old += 1;
      if (!payload.totpSecret) tally.no2fa += 1;
    }

    return tally;
  }, [passwords, reuseCounts, ignored]);

  // Score: breaches and weak passwords hurt most, missing 2FA least.
  const score = useMemo(() => {
    if (passwords.length === 0) return 100;
    const penalty =
      counts.breached * 14 +
      counts.weak * 9 +
      counts.reused * 5 +
      counts.old * 2 +
      counts.no2fa * 1;
    return Math.max(0, Math.min(100, 100 - Math.round(penalty)));
  }, [counts, passwords.length]);

  const actionable = issues.filter(
    (i) => i.kind === "breached" || i.kind === "weak",
  ).length;
  const potential = Math.min(100, score + counts.breached * 14 + counts.weak * 9);

  const visible = issues.filter((issue) =>
    tab === "action" ? issue.kind === "breached" || issue.kind === "weak" : issue.kind === tab,
  );

  /** Re-check every password against HIBP, k-anonymously. */
  const rescan = useCallback(async () => {
    if (!settings.breachMonitoring) {
      notify.info("Breach monitoring is off — turn it on in Settings → Security.");
      return;
    }
    setScanning(true);
    try {
      for (const entry of passwords) {
        const payload = entry.payload as PasswordPayload;
        if (!payload.password) continue;
        const hits = await breachCount(payload.password).catch(() => null);
        if (hits === null) continue;
        if ((hits > 0) !== entry.breached) {
          await updateEntry(entry.id, payload, { breached: hits > 0 });
        }
      }
      setLastScan(new Date());
      notify.success("Security check finished");
    } finally {
      setScanning(false);
    }
  }, [passwords, settings.breachMonitoring, updateEntry]);

  useEffect(() => {
    setLastScan(new Date());
  }, []);

  async function changePassword(entry: VaultEntry) {
    const payload = entry.payload as PasswordPayload;
    const next = generate(defaultOptions);
    await updateEntry(entry.id, { ...payload, password: next }, { breached: false });
    await copy(next, "New password copied");
    notify.success(`New password saved for ${payload.name}`);
  }

  return (
    <>
      <div className={table.head}>
        <div className={table.headText}>
          <h1 className="t-page" style={{ margin: 0 }}>
            Security
          </h1>
          <div className="t-sub">
            {lastScan ? `Last check ${relativeDate(lastScan.toISOString()).toLowerCase()}` : "Not checked yet"}{" "}
            · runs on this device, nothing leaves it
          </div>
        </div>
        <button type="button" className={styles.recheck} onClick={rescan} disabled={scanning}>
          {scanning ? <Spinner size={14} /> : null}
          {scanning ? "Checking…" : "Re-check now"}
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.side}>
          <div className={`glass ${styles.scoreCard}`}>
            <div
              className={styles.ring}
              style={{
                background: `conic-gradient(var(--accent) 0 ${score}%, rgba(28,25,23,.08) ${score}% 100%)`,
              }}
            >
              <div className={styles.ringInner}>
                <span className={styles.scoreNumber}>{score}</span>
                <span className="t-eyebrow">Score</span>
              </div>
            </div>
            <div style={{ font: "500 13px/1.5 var(--font-sans)", color: "var(--muted)" }}>
              {actionable > 0
                ? `Fix the ${actionable} ${actionable === 1 ? "issue" : "issues"} below to reach ${potential}.`
                : "Nothing urgent. Nice."}
            </div>
          </div>

          <div className={`glass ${styles.breakdown}`}>
            <BreakdownRow label="Breached" count={counts.breached} tone="accent" />
            <BreakdownRow label="Weak" count={counts.weak} tone="accent" />
            <BreakdownRow label="Reused" count={counts.reused} tone="muted" />
            <BreakdownRow label="Older than 1 year" count={counts.old} tone="faint" />
            <BreakdownRow label="Missing 2FA" count={counts.no2fa} tone="pale" last />
          </div>
        </div>

        <div className={`glass ${styles.issues}`}>
          <div className={styles.tabs}>
            {TABS.map((t) => (
              <Pill
                key={t.id}
                active={tab === t.id}
                onClick={() => setTab(t.id)}
                tone={tab === t.id ? "light" : "plain"}
              >
                {t.label}
                {t.id === "action" && actionable > 0 ? ` · ${actionable}` : ""}
                {t.id !== "action" && counts[t.id as IssueKind] > 0
                  ? ` · ${counts[t.id as IssueKind]}`
                  : ""}
              </Pill>
            ))}
          </div>

          <div className={styles.issueList}>
            {visible.length === 0 && (
              <div className={styles.clear}>Nothing here — this category is clear.</div>
            )}

            {visible.map((issue) => (
              <div key={`${issue.entry.id}-${issue.kind}`} className={styles.issue}>
                <span
                  className={styles.mono}
                  style={{ background: entryColor(issue.entry) }}
                >
                  {entryMono(issue.entry)}
                </span>

                <div className={styles.issueText}>
                  <div className={styles.issueHead}>
                    <span className={styles.issueName}>
                      {(issue.entry.payload as PasswordPayload).name}
                    </span>
                    <span className={styles.tag}>{issue.kind === "no2fa" ? "Add 2FA" : issue.kind}</span>
                  </div>
                  <div className={styles.issueDetail}>{issue.detail}</div>
                </div>

                {issue.kind === "no2fa" ? (
                  <Button size="sm" onClick={() => openEditor(issue.entry)}>
                    Add code
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => changePassword(issue.entry)}
                  >
                    Change password
                  </Button>
                )}

                <button
                  type="button"
                  className={styles.ignore}
                  onClick={() => setIgnored((prev) => [...prev, issue.entry.id])}
                >
                  Ignore
                </button>
              </div>
            ))}
          </div>

          <div className={styles.note}>
            Breach checks use k-anonymity: only the first 5 characters of each
            password&apos;s hash are ever sent.
          </div>
        </div>
      </div>
    </>
  );
}

function BreakdownRow({
  label,
  count,
  tone,
  last,
}: {
  label: string;
  count: number;
  tone: "accent" | "muted" | "faint" | "pale";
  last?: boolean;
}) {
  const colors = {
    accent: "var(--accent)",
    muted: "var(--muted)",
    faint: "var(--faint)",
    pale: "var(--hairline-strong)",
  };
  return (
    <div className={styles.breakdownRow} data-last={last || undefined}>
      <span className={styles.breakdownLabel}>
        <span className={styles.dot} style={{ background: colors[tone] }} />
        {label}
      </span>
      <span className={styles.breakdownCount}>{count}</span>
    </div>
  );
}
