"use client";

import type { ReactNode } from "react";
import { Button } from "./primitives";
import styles from "./banner.module.css";

export type BannerTone = "accent" | "alert" | "neutral";

export function Banner({
  tone = "neutral",
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  tone?: BannerTone;
  icon?: ReactNode;
  title: string;
  body?: string;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className={styles.banner} data-tone={tone} role="status">
      <span className={styles.mark} aria-hidden>
        {icon ?? <span className={styles.dot} />}
      </span>
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        {body && <div className={styles.body}>{body}</div>}
      </div>
      <div className={styles.actions}>
        {primary && (
          <Button
            size="sm"
            variant={tone === "alert" ? "dark" : "primary"}
            onClick={primary.onClick}
          >
            {primary.label}
          </Button>
        )}
        {secondary && (
          <button
            type="button"
            className={styles.secondary}
            onClick={secondary.onClick}
          >
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  );
}
