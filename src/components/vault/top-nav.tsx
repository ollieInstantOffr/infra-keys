"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KeyTile } from "@/components/ui/key-mark";
import { useVault } from "./vault-provider";
import styles from "./top-nav.module.css";

const TABS = [
  { href: "/vault", label: "Passwords" },
  { href: "/notes", label: "Notes" },
  { href: "/totp", label: "2FA" },
  { href: "/security", label: "Security", dot: true },
];

export function TopNav({
  onSearch,
  onNew,
}: {
  onSearch: () => void;
  onNew: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { entries, lock, signOut, boot } = useVault();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const needsAttention = entries.filter(
    (e) => !e.deletedAt && (e.breached || (e.strength !== null && e.strength < 40)),
  ).length;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Every item navigates, so the menu should never survive a route change.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header className={styles.nav}>
      <Link href="/vault" className={styles.brand}>
        <KeyTile size={26} />
        <span className={styles.word}>keys</span>
      </Link>

      <nav className={styles.tabs}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={styles.tab}
            data-active={pathname.startsWith(tab.href) || undefined}
          >
            {tab.label}
            {tab.dot && needsAttention > 0 && <span className={styles.dot} />}
          </Link>
        ))}
      </nav>

      <button type="button" className={styles.search} onClick={onSearch}>
        <span className={styles.searchIcon} aria-hidden />
        Search passwords, notes, tags
        <span className={styles.kbd}>⌘K</span>
      </button>

      <button type="button" className={styles.new} onClick={onNew}>
        + New
      </button>

      <div ref={menuRef} className={styles.accountWrap}>
        <button
          type="button"
          className={styles.avatar}
          data-open={menuOpen || undefined}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account"
          onClick={() => setMenuOpen((v) => !v)}
        />

        {menuOpen && (
          <div className={styles.menu} role="menu">
            <div className={styles.menuHead}>
              <div className={styles.menuName}>
                {boot?.user.displayName ?? "Your account"}
              </div>
              <div className={styles.menuEmail}>{boot?.user.email}</div>
            </div>

            <MenuItem onClick={() => router.push("/settings")}>Account</MenuItem>
            <MenuItem onClick={() => router.push("/settings")} kbd="⌘,">
              Settings
            </MenuItem>
            <MenuItem onClick={() => router.push("/settings/sign-in")}>Devices</MenuItem>
            <MenuItem onClick={() => router.push("/trash")}>Trash</MenuItem>

            <div className={styles.sep} />

            <MenuItem onClick={lock} kbd="⌘L">
              Lock vault
            </MenuItem>
            <MenuItem onClick={() => router.push("/settings/sign-out")} danger>
              Sign out
            </MenuItem>
          </div>
        )}
      </div>
    </header>
  );
}

function MenuItem({
  children,
  onClick,
  kbd,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  kbd?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.menuItem}
      data-danger={danger || undefined}
      onClick={onClick}
    >
      {children}
      {kbd && <span className={styles.kbd}>{kbd}</span>}
    </button>
  );
}
