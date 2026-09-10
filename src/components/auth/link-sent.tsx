"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { CodeInput } from "./other-device-code";

const TTL_SECONDS = 10 * 60;

export function LinkSent({ email }: { email: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(TTL_SECONDS);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  /**
   * The other half of the cross-device flow. The email carries a six-digit
   * code for exactly this case: you opened the link somewhere else, so you
   * finish here, on the browser that asked for it.
   */
  async function submitCode(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 6 || checking) return;

    setChecking(true);
    setCodeError(null);
    try {
      const res = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: digits }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That code didn't work.");
      router.replace(body.next ?? "/vault");
    } catch (error) {
      setCodeError(
        error instanceof Error ? error.message : "That code didn't work.",
      );
      setChecking(false);
    }
  }

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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          color: "var(--faint)",
        }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--line-10)" }} />
        <span style={{ font: "600 11px var(--font-sans)", letterSpacing: ".06em" }}>
          OR
        </span>
        <span style={{ flex: 1, height: 1, background: "var(--line-10)" }} />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            font: "400 13px/1.5 var(--font-sans)",
            color: "var(--muted)",
            textAlign: "center",
            textWrap: "pretty",
          }}
        >
          Opened the link on another device? Enter the six-digit code from the
          email here.
        </div>

        <CodeInput
          value={code}
          onChange={setCode}
          onComplete={submitCode}
          error={codeError}
          disabled={checking}
        />

        <Button
          variant="primary"
          block
          loading={checking}
          disabled={code.replace(/\D/g, "").length !== 6}
          onClick={() => submitCode(code)}
        >
          Continue
        </Button>
      </div>
    </>
  );
}
