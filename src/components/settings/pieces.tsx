"use client";

import type { ReactNode } from "react";
import { Glass } from "@/components/ui/primitives";
import styles from "./settings.module.css";

export function PageHead({ title, crumb }: { title: string; crumb: string }) {
  return (
    <div className={styles.pageHead}>
      <h2 style={{ font: "800 26px var(--font-sans)", letterSpacing: "-0.03em", margin: 0 }}>
        {title}
      </h2>
      <div className={styles.crumb}>{crumb}</div>
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Glass className={`${styles.card} ${className ?? ""}`}>{children}</Glass>
  );
}

export function RowCard({ children }: { children: ReactNode }) {
  return <Glass className={styles.cardRows}>{children}</Glass>;
}

export function Row({
  title,
  body,
  control,
  last,
}: {
  title: string;
  body?: string;
  control?: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={styles.row} data-last={last || undefined}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{title}</div>
        {body && <div className={styles.rowBody}>{body}</div>}
      </div>
      {control}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select
      className={styles.select}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export { styles as settingsStyles };
