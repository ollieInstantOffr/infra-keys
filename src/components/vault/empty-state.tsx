"use client";

import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import styles from "./empty-state.module.css";

export function EmptyState({
  icon = "ring",
  title,
  body,
  primary,
  secondary,
}: {
  icon?: "ring" | "search" | "trash";
  title: string;
  body: string;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <div className={styles.tile}>
          {icon === "ring" && <span className={styles.ring} />}
          {icon === "search" && <span className={styles.searchIcon} />}
          {icon === "trash" && <span className={styles.trashIcon} />}
        </div>
        <div className={styles.title}>{title}</div>
        <div className={styles.body}>{body}</div>

        {(primary || secondary) && (
          <div className={styles.actions}>
            {primary && (
              <Button variant="primary" onClick={primary.onClick}>
                {primary.label}
              </Button>
            )}
            {secondary &&
              (secondary.href ? (
                <Link href={secondary.href}>
                  <Button>{secondary.label}</Button>
                </Link>
              ) : (
                <Button onClick={secondary.onClick}>{secondary.label}</Button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
