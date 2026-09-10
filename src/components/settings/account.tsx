"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { Card, PageHead, Row, RowCard, Select, settingsStyles as s } from "./pieces";
import { isPassword, type PasswordPayload } from "@/lib/vault/types";
import { InstallRow } from "@/components/pwa/install-prompt";

export function AccountSettings() {
  const router = useRouter();
  const { boot, entries, profile, updateProfile, signOut } = useVault();
  const { dialog, confirm } = useDialog();
  const [displayName, setDisplayName] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDisplayName(profile.displayName ?? "");
  }, [profile.displayName]);

  /**
   * Immediate, unlike "start over" — see the note on the API route. The
   * local mirror has to go too, or an encrypted copy of a vault that no
   * longer exists would sit in IndexedDB forever.
   */
  async function deleteAccount() {
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: boot?.user.email ?? "" }),
    });

    if (!res.ok) {
      notify.error((await res.json()).error ?? "Couldn't delete the account.");
      return;
    }

    const [{ wipeOffline }, { forgetFallbackSecrets }] = await Promise.all([
      import("@/lib/vault/offline"),
      import("@/lib/vault/webauthn-client"),
    ]);
    await Promise.allSettled([wipeOffline(), forgetFallbackSecrets()]);

    // A full navigation, not a router push: everything in memory should go.
    window.location.href = "/signin?deleted=1";
  }

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
                const saved = await updateProfile({
                  displayName: displayName.trim() || null,
                });
                if (saved) setDirty(false);
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
              value={profile.locale}
              onChange={(value) => void updateProfile({ locale: value })}
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
              value={profile.appearance}
              onChange={(value) => void updateProfile({ appearance: value })}
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
          body="Erases everything the moment you confirm. Export first."
          last
          control={
            <Button
              size="sm"
              onClick={() =>
                confirm(
                  {
                    kind: "irreversible",
                    title: "Delete your account and vault?",
                    body: "Every password, note, 2FA secret and device is erased the moment you confirm. There is no waiting period and nothing to cancel.",
                    typed: boot?.user.email,
                    note: "Export an encrypted backup first — afterwards nobody can recover it, including us. The vault was never encrypted with a key we hold.",
                    noteTone: "warn",
                    confirmLabel: "Delete everything now",
                  },
                  deleteAccount,
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
