"use client";

import { Button, Toggle } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import {
  useVault,
  type NotificationPrefs as Prefs,
} from "@/components/vault/vault-provider";
import { Card, PageHead, Row, RowCard, settingsStyles as s } from "./pieces";

export function NotificationSettings() {
  const { prefs, updatePrefs } = useVault();

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) =>
    updatePrefs({ [key]: value } as Partial<Prefs>);

  async function askForNativePermission() {
    if (!("Notification" in window)) {
      notify.error("This browser has no notification support.");
      return;
    }
    const result = await Notification.requestPermission();
    if (result === "granted") {
      await set("nativeNotifs", true);
    } else {
      await set("nativeNotifs", false);
      notify.info("Notifications stay off.");
    }
  }

  return (
    <>
      <PageHead title="Notifications" crumb="Settings › Notifications" />

      <RowCard>
        <Row
          title="Sign-in links & device approvals"
          body="Required — this is how you sign in"
          control={<Locked />}
        />
        <Row
          title="New device added"
          body="Required — 24h window to undo"
          control={<Locked />}
        />
        <Row
          title="Breach alerts"
          body="When a saved password shows up in a new leak"
          control={
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <ToggleWithLabel
                label="Email"
                checked={prefs.breachEmail}
                onChange={(v) => set("breachEmail", v)}
              />
              <ToggleWithLabel
                label="In-app"
                checked={prefs.breachInApp}
                onChange={(v) => set("breachInApp", v)}
              />
            </div>
          }
        />
        <Row
          title="Weekly security digest"
          body="Score, weak and old passwords · Mondays"
          control={
            <ToggleWithLabel
              label="Email"
              checked={prefs.digestEmail}
              onChange={(v) => set("digestEmail", v)}
            />
          }
        />
        <Row
          title="Trash about to be erased"
          body="3 days before permanent deletion"
          last
          control={
            <ToggleWithLabel
              label="Email"
              checked={prefs.trashEmail}
              onChange={(v) => set("trashEmail", v)}
            />
          }
        />
      </RowCard>

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div className={s.rowText}>
            <div className={s.rowTitle}>System notifications</div>
            <div className={s.rowBody}>
              The installed app can show 2FA-ready and approval prompts natively.
            </div>
          </div>
          <Button size="sm" onClick={askForNativePermission}>
            {prefs.nativeNotifs ? "Allowed" : "Allow…"}
          </Button>
        </div>
      </Card>
    </>
  );
}

function Locked() {
  return (
    <span
      style={{
        font: "600 12px var(--font-sans)",
        color: "var(--faint)",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span style={{ color: "var(--accent)" }}>✓</span> Always on
    </span>
  );
}

function ToggleWithLabel({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        font: "600 12px var(--font-sans)",
        color: "var(--muted)",
      }}
    >
      {label}
      <Toggle checked={checked} onChange={onChange} label={label} />
    </label>
  );
}
