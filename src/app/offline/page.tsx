import { AuthShell } from "@/components/auth/auth-shell";
import { Wordmark } from "@/components/ui/key-mark";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <AuthShell width={420}>
      <Wordmark size={20} tile={28} />
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: "rgba(28,25,23,.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2.5px solid var(--faint)",
            borderRightColor: "transparent",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="t-card">You&apos;re offline</div>
        <div
          style={{
            font: "400 14px/1.5 var(--font-sans)",
            color: "var(--muted)",
            textWrap: "pretty",
          }}
        >
          Your vault is stored encrypted on this device, so it still opens.
          Anything you change syncs the moment you&apos;re back.
        </div>
      </div>

      <a href="/vault" style={{ font: "600 13px var(--font-sans)" }}>
        Open my vault
      </a>
    </AuthShell>
  );
}
