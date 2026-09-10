"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";

export function ResendButton({ email }: { email: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!email) {
    return (
      <Button variant="primary" size="lg" block onClick={() => router.push("/signin")}>
        Send a new link
      </Button>
    );
  }

  async function send() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      router.push(`/signin/sent?to=${encodeURIComponent(email!)}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't send the link.");
      setBusy(false);
    }
  }

  return (
    <Button variant="primary" size="lg" block loading={busy} onClick={send}>
      Send a new link to {email}
    </Button>
  );
}
