"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useVault } from "@/components/vault/vault-provider";
import { PageHead, settingsStyles as s } from "./pieces";

type Mode = "keep" | "remove";

/**
 * Signing out is a real choice, not a one-liner: the vault key either stays
 * in the secure enclave or is destroyed along with the local copy.
 */
export function SignOutSettings() {
  const { signOut } = useVault();
  const [mode, setMode] = useState<Mode>("keep");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <PageHead title="Sign out of keys?" crumb="Settings › Sign out" />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Option
          selected={mode === "keep"}
          onSelect={() => setMode("keep")}
          title="Sign out, keep Touch ID"
          body="Vault key stays in the secure enclave. Next time: Touch ID, no email."
        />
        <Option
          selected={mode === "remove"}
          onSelect={() => setMode("remove")}
          title="Sign out and remove this device"
          body="Wipes the local vault and key. You'll need another device or your recovery code to come back."
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
        <Button variant="ghost" onClick={() => history.back()}>
          Cancel
        </Button>
        <Button
          variant={mode === "remove" ? "dark" : "primary"}
          size="lg"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await signOut(mode);
          }}
        >
          Sign out
        </Button>
      </div>
    </>
  );
}

function Option({
  selected,
  onSelect,
  title,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: "left",
        padding: "18px 20px",
        borderRadius: 16,
        background: "var(--surface)",
        border: selected ? "1.5px solid var(--accent)" : "1px solid var(--line-10)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span className={s.rowTitle}>{title}</span>
      <span className={s.rowBody}>{body}</span>
    </button>
  );
}
