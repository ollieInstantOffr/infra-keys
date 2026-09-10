"use client";

import { Button } from "@/components/ui/primitives";
import styles from "./code.module.css";

export function OtherDeviceCode({ code, token }: { code: string; token: string }) {
  const digits = code.padEnd(6, " ").slice(0, 6).split("");

  return (
    <>
      <div className={styles.row}>
        {digits.map((digit, i) => (
          <span key={i} className={styles.cell}>
            {digit.trim()}
          </span>
        ))}
      </div>

      <div
        style={{
          font: "400 12px/1.5 var(--font-sans)",
          color: "var(--faint)",
        }}
      >
        Or continue here to sign in on this device instead.
      </div>

      <Button
        onClick={() =>
          (window.location.href = `/auth/verify?adopt=1&token=${encodeURIComponent(token)}`)
        }
      >
        Sign in on this device
      </Button>
    </>
  );
}

/** Six boxes the user types into, on the browser that asked for the link. */
export function CodeInput({
  value,
  onChange,
  onComplete,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  error?: string | null;
}) {
  const digits = value.padEnd(6, " ").slice(0, 6).split("");

  function set(index: number, digit: string) {
    const next = value.padEnd(6, " ").split("");
    next[index] = digit;
    const joined = next.join("").replace(/\s+$/, "");
    onChange(joined);
    if (joined.replace(/\s/g, "").length === 6) onComplete?.(joined);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className={styles.row}>
        {digits.map((digit, i) => (
          <input
            key={i}
            className={styles.cell}
            inputMode="numeric"
            maxLength={1}
            value={digit.trim()}
            aria-label={`Digit ${i + 1}`}
            data-error={error ? "true" : undefined}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(-1);
              set(i, d || " ");
              if (d) {
                const next = e.target.parentElement?.children[i + 1];
                (next as HTMLInputElement | undefined)?.focus();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digit.trim()) {
                const prev = e.currentTarget.parentElement?.children[i - 1];
                (prev as HTMLInputElement | undefined)?.focus();
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
              if (!pasted) return;
              onChange(pasted);
              if (pasted.length === 6) onComplete?.(pasted);
            }}
          />
        ))}
      </div>
      {error && (
        <div style={{ font: "500 12px var(--font-sans)", color: "var(--accent)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
