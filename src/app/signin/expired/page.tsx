import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResendButton } from "@/components/auth/resend-button";

export const metadata = { title: "Link expired" };

export default async function ExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;

  return (
    <AuthShell width={400}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: "rgba(28,25,23,.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "2.5px solid var(--muted)",
            borderRightColor: "transparent",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="t-card">This link has expired</div>
        <div
          style={{
            font: "400 14px/1.5 var(--font-sans)",
            color: "var(--muted)",
            textWrap: "pretty",
          }}
        >
          Links work once and for 10 minutes. Nothing was signed in.
        </div>
      </div>

      <ResendButton email={to ?? null} />

      <Link href="/signin" style={{ font: "600 13px var(--font-sans)" }}>
        Use a different email
      </Link>
    </AuthShell>
  );
}
