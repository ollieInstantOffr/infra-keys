import { AuthShell } from "@/components/auth/auth-shell";
import { OtherDeviceCode } from "@/components/auth/other-device-code";

export const metadata = { title: "Opened on a different device" };

export default async function OtherDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; from?: string; token?: string }>;
}) {
  const { code, from, token } = await searchParams;

  return (
    <AuthShell width={400}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: "var(--accent-soft-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 14,
            height: 24,
            border: "2.5px solid var(--accent)",
            borderRadius: 4,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="t-card">Opened on a different device</div>
        <div
          style={{
            font: "400 14px/1.5 var(--font-sans)",
            color: "var(--muted)",
            textWrap: "pretty",
          }}
        >
          You requested this link from{" "}
          <strong style={{ color: "var(--ink)" }}>
            {from ?? "another browser"}
          </strong>
          . Enter this code there to finish signing in.
        </div>
      </div>

      <OtherDeviceCode code={code ?? ""} token={token ?? ""} />
    </AuthShell>
  );
}
