"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./primitives";
import styles from "./dialog.module.css";

export type DialogKind = "reversible" | "irreversible" | "warning" | "security" | "info";

export type DialogSpec = {
  kind: DialogKind;
  title: string;
  body: string;
  /** Shows the item being acted on, as in "Move Stripe to trash?" */
  item?: { name: string; sub: string; mono: string };
  /** Irreversible actions make you type the word out. */
  typed?: string;
  note?: string;
  noteTone?: "warn" | "info";
  cancelLabel?: string;
  confirmLabel: string;
  /** Destructive uses the black button; warnings use orange. */
  confirmTone?: "dark" | "primary";
  /** Set when the action is gated behind a Touch ID ceremony. */
  requiresTouchId?: boolean;
};

const KICKER: Record<DialogKind, string> = {
  reversible: "Reversible",
  irreversible: "Irreversible",
  warning: "Warning",
  security: "Security",
  info: "Info",
};

export function Dialog({
  spec,
  open,
  onCancel,
  onConfirm,
}: {
  spec: DialogSpec | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      setBusy(false);
      // move focus into the dialog so Escape and Tab behave
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [open, spec]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !spec) return null;

  const needsTyping = Boolean(spec.typed);
  const typedOk = !needsTyping || typed.trim() === spec.typed;
  const accentKicker = spec.kind !== "reversible" && spec.kind !== "info";

  async function confirm() {
    if (!typedOk || busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  // Portalled to the body on purpose: a `backdrop-filter` ancestor (every
  // frosted panel in this app has one) becomes the containing block for
  // `position: fixed` children, which would trap the scrim inside the panel.
  return createPortal(
    <div className={styles.scrim} onMouseDown={onCancel}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.panel}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={styles.kicker}
          style={{ color: accentKicker ? "var(--accent)" : "var(--faint)" }}
        >
          {spec.kind === "irreversible" && <span className={styles.dot} />}
          {KICKER[spec.kind]}
        </div>

        <h2 id={titleId} className={styles.title}>
          {spec.title}
        </h2>
        <p className={styles.body}>{spec.body}</p>

        {spec.item && (
          <div className={styles.item}>
            <div className={styles.itemMono}>{spec.item.mono}</div>
            <div className={styles.itemText}>
              <span className={styles.itemName}>{spec.item.name}</span>
              <span className={styles.itemSub}>{spec.item.sub}</span>
            </div>
          </div>
        )}

        {needsTyping && (
          <label className={styles.typed}>
            <span>
              Type <code>{spec.typed}</code> to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
              className={styles.typedInput}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        {spec.note && (
          <div className={styles.note} data-tone={spec.noteTone ?? "warn"}>
            {spec.note}
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {spec.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={spec.confirmTone ?? "dark"}
            size="lg"
            onClick={confirm}
            disabled={!typedOk}
            loading={busy}
          >
            {spec.confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Small hook so screens can drive one dialog without prop-drilling. */
export function useDialog() {
  const [state, setState] = useState<{
    spec: DialogSpec;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  return {
    dialog: (
      <Dialog
        open={state !== null}
        spec={state?.spec ?? null}
        onCancel={() => setState(null)}
        onConfirm={async () => {
          await state?.onConfirm();
          setState(null);
        }}
      />
    ),
    confirm: (spec: DialogSpec, onConfirm: () => void | Promise<void>) =>
      setState({ spec, onConfirm }),
    close: () => setState(null),
  };
}
