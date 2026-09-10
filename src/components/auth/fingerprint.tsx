/** The concentric-ring fingerprint mark. Dashed while enrolling, solid after. */
export function Fingerprint({
  size = 120,
  state = "idle",
}: {
  size?: number;
  state?: "idle" | "waiting" | "failed" | "dashed";
}) {
  const failed = state === "failed";
  const accent = failed ? "var(--faint)" : "var(--accent)";
  const mid = failed ? "var(--hairline-strong)" : "rgba(234,88,12,.5)";
  const outer =
    state === "dashed"
      ? "2px dashed rgba(234,88,12,.35)"
      : failed
        ? "none"
        : "none";

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: outer === "none" ? undefined : outer,
        background:
          state === "dashed"
            ? "transparent"
            : failed
              ? "rgba(28,25,23,.05)"
              : "var(--accent-soft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        animation:
          state === "waiting" ? "pulseRing 1.6s ease-in-out infinite" : undefined,
      }}
    >
      <div
        style={{
          width: size * 0.7,
          height: size * 0.7,
          borderRadius: "50%",
          border: `2px solid ${mid}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: size * 0.4,
            height: size * 0.4,
            borderRadius: "50%",
            border: `2px solid ${accent}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: size * 0.117,
              height: size * 0.117,
              borderRadius: "50%",
              background: accent,
            }}
          />
        </div>
      </div>
    </div>
  );
}
