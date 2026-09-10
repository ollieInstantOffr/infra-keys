"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import styles from "./toast.module.css";

export type ToastTone = "success" | "info" | "warning" | "error";

export type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
  /** Reversible actions get an Undo; failures get a Retry. */
  action?: { label: string; run: () => void };
  /** Renders the clipboard countdown from the copy toast. */
  countdownSeconds?: number;
  countdownLabel?: string;
  duration?: number;
  sticky?: boolean;
};

// ------------------------------------------------------------------ store

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return toasts;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(input: Omit<Toast, "id">): number {
  const id = nextId++;
  toasts = [...toasts, { ...input, id }];
  emit();

  if (!input.sticky) {
    const ms = input.duration ?? (input.countdownSeconds ? input.countdownSeconds * 1000 : 5000);
    setTimeout(() => dismissToast(id), ms);
  }
  return id;
}

export const notify = {
  success: (message: string, action?: Toast["action"]) =>
    toast({ tone: "success", message, action }),
  info: (message: string, action?: Toast["action"]) =>
    toast({ tone: "info", message, action }),
  warning: (message: string, action?: Toast["action"]) =>
    toast({ tone: "warning", message, action }),
  error: (message: string, action?: Toast["action"]) =>
    toast({ tone: "error", message, action }),
  copied: (label: string, seconds: number) =>
    toast({
      tone: "success",
      message: label,
      countdownSeconds: seconds,
      countdownLabel: "Clipboard clears in",
    }),
};

// -------------------------------------------------------------------- ui

function Countdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const started = Date.now();
    const iv = setInterval(() => {
      const remaining = seconds - Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(0, remaining));
    }, 250);
    return () => clearInterval(iv);
  }, [seconds]);

  const mins = Math.floor(left / 60);
  const secs = String(left % 60).padStart(2, "0");

  return (
    <>
      <span className={styles.clock}>
        {mins}:{secs}
      </span>
      <div className={styles.bar}>
        <div
          className={styles.barFill}
          style={{ width: `${(left / seconds) * 100}%` }}
        />
      </div>
    </>
  );
}

const glyph: Record<ToastTone, string> = {
  success: "✓",
  info: "i",
  warning: "!",
  error: "!",
};

export function ToastHost() {
  const items = useSyncExternalStore(subscribe, snapshot, () => toasts);

  if (!items.length) return null;

  return (
    <div className={styles.host} role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={styles.toast} data-tone={t.tone}>
          <span className={styles.badge} data-tone={t.tone} aria-hidden>
            {glyph[t.tone]}
          </span>
          <span className={styles.message}>{t.message}</span>

          {t.countdownSeconds !== undefined && (
            <>
              <span className={styles.divider} />
              <span className={styles.meta}>{t.countdownLabel}</span>
              <Countdown seconds={t.countdownSeconds} />
            </>
          )}

          {t.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                t.action?.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}

          <button
            type="button"
            className={styles.close}
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
