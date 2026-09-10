/**
 * The mark: a key reduced to a circle and a bar.
 *
 * The head is a ring — a hole, not a dot, so it reads as "key" not "pin" —
 * and the shaft is a bar with one tooth. Geometry is lifted straight from
 * the 256px source tile in the design so it stays crisp down to 16px.
 */
export function KeyMark({
  size = 24,
  color = "currentColor",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="94" cy="120" r="29" stroke={color} strokeWidth="26" />
      <path
        d="M130 107h76a8 8 0 0 1 8 8v3a8 8 0 0 1-8 8h-76z"
        fill={color}
      />
      <path d="M160 133h22v20a6 6 0 0 1-6 6h-10a6 6 0 0 1-6-6z" fill={color} />
    </svg>
  );
}

/** Orange tile lockup — app icon, nav badge, email header. */
export function KeyTile({
  size = 26,
  radius,
  background = "var(--accent)",
  color = "#fff",
  className,
  style,
}: {
  size?: number;
  radius?: number;
  background?: string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.227),
        background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        ...style,
      }}
    >
      <KeyMark size={size * 0.78} color={color} />
    </div>
  );
}

/** Full wordmark: tile + "keys". */
export function Wordmark({
  size = 18,
  tile = 26,
  color = "var(--ink)",
}: {
  size?: number;
  tile?: number;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <KeyTile size={tile} />
      <span
        style={{
          font: `800 ${size}px var(--font-sans)`,
          letterSpacing: "-0.02em",
          color,
        }}
      >
        keys
      </span>
    </div>
  );
}
