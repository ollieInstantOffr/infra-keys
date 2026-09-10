"use client";

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import styles from "./primitives.module.css";

// ------------------------------------------------------------------ button

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "dark" | "icon";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  block,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        styles.button,
        styles[`v_${variant}`],
        styles[`s_${size}`],
        block && styles.block,
        className,
      )}
    >
      {loading && <span className={styles.spinner} aria-hidden />}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------- input

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
  mono?: boolean;
};

export function Field({ label, hint, error, mono, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={styles.field}>
      {label && (
        <label className="t-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={clsx(styles.input, mono && styles.inputMono, error && styles.inputError, className)}
      />
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : hint ? (
        <div className={styles.hint}>{hint}</div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ toggle

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(styles.toggle, checked && styles.toggleOn)}
    >
      <span className={styles.knob} />
    </button>
  );
}

// -------------------------------------------------------------- containers

export function Glass({
  children,
  className,
  style,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: "div" | "section" | "aside";
}) {
  return (
    <As className={clsx("glass", styles.glassBox, className)} style={style}>
      {children}
    </As>
  );
}

export function Pill({
  children,
  active,
  onClick,
  tone = "light",
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "light" | "plain";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        styles.pill,
        active && styles.pillActive,
        tone === "plain" && styles.pillPlain,
      )}
    >
      {children}
    </button>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

/** The thin strength/expiry bar used across the vault. */
export function Meter({
  value,
  color = "var(--accent)",
  width = 56,
  height = 4,
}: {
  value: number;
  color?: string;
  width?: number | string;
  height?: number;
}) {
  // A percentage width has to flex instead of being fixed, or the label
  // sitting next to it gets pushed out of its row.
  const fluid = typeof width === "string" && width.endsWith("%");

  return (
    <div
      className={styles.meter}
      style={{ width, height, ...(fluid ? { flex: 1, minWidth: 0 } : {}) }}
    >
      <div
        className={styles.meterFill}
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size, borderWidth: Math.max(2, size / 9) }}
      aria-label="Loading"
    />
  );
}
