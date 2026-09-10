"use client";

import { Toggle } from "@/components/ui/primitives";
import { useVault } from "@/components/vault/vault-provider";
import { saveSettings } from "@/lib/settings-client";
import { Card, PageHead, Row, RowCard, Select, settingsStyles as s } from "./pieces";

export function SecuritySettings() {
  const { settings, refresh, online, syncedAt, pendingWrites } = useVault();

  return (
    <>
      <PageHead title="Security" crumb="Settings › Security" />

      <RowCard>
        <Row
          title="Clear clipboard"
          body="Wipe copied secrets automatically"
          control={
            <Select
              label="Clipboard"
              value={String(settings.clipboardSeconds)}
              onChange={async (v) => {
                await saveSettings({ vault: { clipboardSeconds: Number(v) } });
                await refresh();
              }}
              options={[
                { value: "10", label: "After 10s" },
                { value: "30", label: "After 30s" },
                { value: "60", label: "After 60s" },
                { value: "0", label: "Never" },
              ]}
            />
          }
        />
        <Row
          title="Breach monitoring"
          body="Check passwords against known leaks (hashed, never sent in full)"
          control={
            <Toggle
              checked={settings.breachMonitoring}
              label="Breach monitoring"
              onChange={async (v) => {
                await saveSettings({ vault: { breachMonitoring: v } });
                await refresh();
              }}
            />
          }
        />
        <Row
          title="Offline access"
          body="Keep an encrypted copy of the vault on this device so it opens without a connection."
          last
          control={
            <Toggle
              checked={settings.offlineEnabled}
              label="Offline access"
              onChange={async (v) => {
                await saveSettings({ vault: { offlineEnabled: v } });
                await refresh();
              }}
            />
          }
        />
      </RowCard>

      <Card>
        <div className={s.rowTitle}>This device</div>
        <div className={s.rowBody}>
          {online ? "Online" : "Offline — changes are queued locally"}
          {syncedAt && ` · last synced ${new Date(syncedAt).toLocaleTimeString()}`}
          {pendingWrites > 0 &&
            ` · ${pendingWrites} change${pendingWrites === 1 ? "" : "s"} waiting to sync`}
        </div>
        <div className={s.tip}>
          Everything stored on this device is ciphertext. Without the vault key —
          which lives in memory, or behind Touch ID — it is unreadable, including
          to us.
        </div>
      </Card>
    </>
  );
}
