"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "./top-nav";
import { VaultBanners } from "./banners";
import { CommandPalette } from "./command-palette";
import { ItemEditor } from "./item-editor";
import { ApprovalPrompt } from "./approval-prompt";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { Spinner } from "@/components/ui/primitives";
import { useVault } from "./vault-provider";
import type { VaultEntry } from "@/lib/vault/types";
import styles from "./app-frame.module.css";

type Chrome = {
  openSearch: () => void;
  openNew: (kind?: "PASSWORD" | "NOTE") => void;
  openEditor: (entry: VaultEntry) => void;
};

const ChromeContext = createContext<Chrome | null>(null);

export function useChrome() {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error("useChrome must be used inside <AppFrame>");
  return ctx;
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, lock } = useVault();

  const [searchOpen, setSearchOpen] = useState(false);
  const [editor, setEditor] = useState<
    { mode: "new"; kind: "PASSWORD" | "NOTE" } | { mode: "edit"; entry: VaultEntry } | null
  >(null);

  // Send people to the right screen when the vault isn't open.
  useEffect(() => {
    if (status === "locked") router.replace("/unlock");
    if (status === "needs-enrolment") router.replace("/setup/touch-id");
    if (status === "needs-approval") router.replace("/device/new");
  }, [status, router]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const openNew = useCallback(
    (kind: "PASSWORD" | "NOTE" = "PASSWORD") => setEditor({ mode: "new", kind }),
    [],
  );
  const openEditor = useCallback(
    (entry: VaultEntry) => setEditor({ mode: "edit", entry }),
    [],
  );

  // ⌘K search, ⌘L lock, ⌘, settings — the shortcuts the nav advertises.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        lock();
      }
      if (e.key === ",") {
        e.preventDefault();
        router.push("/settings");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lock, router]);

  const chrome = useMemo<Chrome>(
    () => ({ openSearch, openNew, openEditor }),
    [openSearch, openNew, openEditor],
  );

  if (status !== "unlocked") {
    return (
      <div className={styles.booting}>
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <ChromeContext.Provider value={chrome}>
      <div className={styles.frame}>
        <div className="glow glow-bl" />
        <TopNav onSearch={openSearch} onNew={() => openNew()} />

        <div className={styles.body}>
          <VaultBanners />
          {children}
        </div>

        <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

        {editor && (
          <ItemEditor
            mode={editor.mode}
            kind={editor.mode === "new" ? editor.kind : editor.entry.type}
            entry={editor.mode === "edit" ? editor.entry : undefined}
            onClose={() => setEditor(null)}
          />
        )}

        <ApprovalPrompt />

        {/*
          Deliberately inside the frame rather than the root layout: this only
          renders once the vault is unlocked, so the install prompt never
          competes with signing in or with the Touch ID ceremony.
        */}
        <InstallPrompt />
      </div>
    </ChromeContext.Provider>
  );
}
