import type { ReactNode } from "react";
import styles from "./auth-shell.module.css";

/**
 * The frame every signed-out screen sits in: off-white ground, one faint
 * orange glow in the top-right corner, a frosted card in the middle.
 */
export function AuthShell({
  children,
  width = 440,
  align = "center",
}: {
  children: ReactNode;
  width?: number;
  align?: "center" | "start";
}) {
  return (
    <main className={styles.shell}>
      <div className="glow glow-tr" />
      <div
        className={styles.card}
        style={{ width, textAlign: align === "center" ? "center" : "left" }}
        data-align={align}
      >
        {children}
      </div>
    </main>
  );
}

/** Split hero + card, used only by the sign-in screen. */
export function AuthSplit({
  hero,
  children,
}: {
  hero: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={styles.shell}>
      <div className="glow glow-tr" />
      <div className={styles.split}>
        <div className={styles.hero}>{hero}</div>
        <div className={styles.card} data-align="start" style={{ width: 440 }}>
          {children}
        </div>
      </div>
    </main>
  );
}
