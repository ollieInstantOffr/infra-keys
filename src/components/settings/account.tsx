"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { saveSettings } from "@/lib/settings-client";
import { Card, PageHead, Row, RowCard, Select, settingsStyles as s } from "./pieces";
import { isPassword, type PasswordPayload } from "@/lib/vault/types";
import { InstallRow } from "@/components/pwa/install-prompt";

export function AccountSettings() {
  const router = useRouter();
  const { boot, entries, signOut, refresh } = useVault();
  const { dialog, confirm } = useDialog();
  const [displayName, setDisplayName] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDisplayName(boot?.user.displayName ?? "");
  }, [boot?.user.displayName]);

  const live = entries.filter((e) => !e.deletedAt);
  const passwords = live.filter((e) => e.type === "PASSWORD").length;
  const notes = live.filter((e) => e.type === "NOTE").length;
  const codes = live.filter(
    (e) => isPassword(e) && (e.payload as PasswordPayload).totpSecret,
  ).length;

  return (
    <>
      <PageHead title="Account" crumb="Settings › Account" />

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#ffb38a,#f5e6dc)",
              flex: "none",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Field
              label="Display name"
              value={displayName}
              placeholder="Your name"
              onChange={(e) => {
                setDisplayName(e.target.value);
                setDirty(true);
              }}
            />
          </div>
          {dirty && (
            <Button
              variant="primary"
              onClick={async () => {
                const ok = await saveSettings({
                  profile: { displayName: displayName || null },
                });
                if (ok) {
                  setDirty(false);
                  notify.success("Saved");
                  await refresh();
                }
              }}
            >
              Save
            </Button>
          )}
        </div>
      </Card>

      <RowCard>
        <Row
          title="Email"
          body={`${boot?.user.email} · used for sign-in links and security alerts`}
          control={
            <Button size="sm" onClick={() => router.push("/signin")}>
              Change…
            </Button>
          }
        />
        <Row
          title="Language & region"
          body={`English · dates as ${new Date().toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}`}
          control={
            <Select
              label="Language"
              value="en"
              onChange={(value) => void saveSettings({ profile: { locale: value } })}
              options={[{ value: "en", label: "English" }]}
            />
          }
        />
        <Row
          title="Appearance"
          body="Light glass · follows system for dark later"
          last
          control={
            <Select
              label="Appearance"
              value="light"
              onChange={(value) =>
                void saveSettings({ profile: { appearance: value } })
              }
              options={[{ value: "light", label: "Light" }]}
            />
          }
        />
      </RowCard>

      <Card>
        <div className={s.rowTitle}>Vault at a glance</div>
        <div className={s.statGrid}>
          <Stat number={passwords} label="passwords" />
          <Stat number={notes} label="secure notes" />
          <Stat number={codes} label="2FA codes" />
          <Stat number={boot?.recentlyAdded.length ?? 0} label="devices added recently" />
        </div>
      </Card>

      <RowCard>
        <InstallRow />
      </RowCard>

      <RowCard>
        <Row
          title="Sign out of this device"
          body="Vault key stays enrolled; Touch ID works next time."
          control={
            <Button size="sm" onClick={() => signOut("keep")}>
              Sign out
            </Button>
          }
        />
        <Row
          title="Delete account"
          body="Erases vault after a 7-day notice. Export first."
          last
          control={
            <Button
              size="sm"
              onClick={() =>
                confirm(
                  {
                    kind: "irreversible",
                    title: "Delete your account and vault?",
                    body: `Everything is erased in 7 days. Until then you can cancel from any email we send or by signing in.`,
                    typed: boot?.user.email,
                    note: "Export an encrypted backup first — after deletion nobody, including us, can recover it.",
                    noteTone: "warn",
                    confirmLabel: "Schedule deletion",
                  },
                  async () => {
                    const res = await fetch("/api/recovery/start-over", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ reason: "DELETE_ACCOUNT" }),
                    });
                    if (res.ok) {
                      notify.warning("Deletion scheduled. Check your email to cancel.");
                      await refresh();
                    } else {
                      notify.error((await res.json()).error);
                    }
                  },
                )
              }
            >
              Delete…
            </Button>
          }
        />
      </RowCard>

      {dialog}
    </>
  );
}

function Stat({ number, label }: { number: number; label: string }) {
  return (
    <div className={s.stat}>
      <span className={s.statNumber}>{number}</span>
      <span className={s.statLabel}>{label}</span>
    </div>
  );
}
