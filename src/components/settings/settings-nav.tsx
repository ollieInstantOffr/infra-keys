"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./settings.module.css";

const ITEMS = [
  { href: "/settings", label: "Account" },
  { href: "/settings/sign-in", label: "Sign-in & recovery" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/folders", label: "Folders & tags" },
  { href: "/settings/import", label: "Import / export" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/sign-out", label: "Sign out" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <h1 className="t-page" style={{ margin: "0 0 16px" }}>
        Settings
      </h1>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={styles.navItem}
          data-active={
            (item.href === "/settings"
              ? pathname === "/settings"
              : pathname.startsWith(item.href)) || undefined
          }
          data-danger={item.href === "/settings/sign-out" || undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
