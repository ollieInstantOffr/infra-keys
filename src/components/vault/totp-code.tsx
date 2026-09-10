"use client";

import { useEffect, useState } from "react";
import { formatCode, parseTotp, totpCode } from "@/lib/vault/totp";

/**
 * A live 2FA code. The countdown bar is a CSS animation keyed to the current
 * 30-second window, so it stays in step with real time rather than drifting
 * with a React interval.
 */
export function useTotp(secret: string | undefined) {
  const [state, setState] = useState<{
    code: string;
    seconds: number;
    period: number;
    error: string | null;
  }>({ code: "······", seconds: 30, period: 30, error: null });

  useEffect(() => {
    if (!secret) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const config = parseTotp(secret);
        const { code, secondsLeft, period } = await totpCode(config);
        if (!cancelled) {
          setState({ code, seconds: secondsLeft, period, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error: error instanceof Error ? error.message : "Bad 2FA secret",
          }));
        }
      }
    };

    void tick();
    const iv = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [secret]);

  return { ...state, display: formatCode(state.code) };
}

export function TotpBar({
  seconds,
  period = 30,
  height = 4,
}: {
  seconds: number;
  period?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        flex: 1,
        height,
        borderRadius: 2,
        background: "rgba(28,25,23,.08)",
        overflow: "hidden",
      }}
    >
      <div
        // remounting each window restarts the animation cleanly
        key={Math.floor(Date.now() / (period * 1000))}
        style={{
          height: "100%",
          background: seconds <= 5 ? "var(--accent)" : "var(--ink)",
          animation: `totp ${period}s linear`,
          animationDelay: `-${period - seconds}s`,
        }}
      />
    </div>
  );
}
