"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";

const TTL_SECONDS = 10 * 60;

export function LinkSent({ email }: { email: string }) {
  const [left, setLeft] = useState(TTL_SECONDS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const iv = setInterval(() => {
      setLeft(Math.max(0, TTL_SECONDS - Math.floor((Date.now() - started) / 1000)));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  async function resend() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      notify.success("New link sent");
      setLeft(TTL_SECONDS);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't send the link.");
    } finally {
      setBusy(false);
    }
  }

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: "var(--accent-soft-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 26,
            height: 18,
            border: "2.5px solid var(--accent)",
            borderRadius: 4,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="t-title">Check your inbox</div>
        <div
          style={{
            font: "400 14px/1.5 var(--font-sans)",
            color: "var(--muted)",
            textWrap: "pretty",
          }}
        >
          We sent a sign-in link to <strong style={{ color: "var(--ink)" }}>{email}</strong>.
          Open it on this device to continue.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          font: "600 13px var(--font-sans)",
          color: "var(--muted)",
        }}
      >
        <span>{left > 0 ? "Expires in" : "This link has expired"}</span>
        {left > 0 && (
          <span className="mono" style={{ fontSize: 13, color: "var(--ink)" }}>
            {mm}:{ss}
          </span>
        )}
      </div>

      <Button onClick={resend} loading={busy}>
        Resend link
      </Button>
    </>
  );
}
