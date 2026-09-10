"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui/primitives";

export function SignInForm({ deleted }: { deleted?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That didn't work.");

      router.push(`/signin/sent?to=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      {deleted && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(28,25,23,.05)",
            font: "500 12px/1.5 var(--font-sans)",
            color: "var(--text)",
          }}
        >
          Your account and vault were deleted. Signing in with the same address
          starts a new, empty vault.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="t-title">Continue with email</div>
        <div style={{ font: "400 14px/1.5 var(--font-sans)", color: "var(--muted)" }}>
          New here? The same link creates your account.
        </div>
      </div>

      <Field
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email webauthn"
        autoFocus
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
        style={{ height: 48, borderRadius: 12, fontSize: 15 }}
      />

      <Button type="submit" variant="primary" size="lg" block loading={busy}>
        Send magic link
      </Button>

      <div
        style={{
          font: "400 12px/1.5 var(--font-sans)",
          color: "var(--faint)",
          textAlign: "center",
        }}
      >
        Links expire in 10 minutes and work once.
      </div>
    </form>
  );
}
