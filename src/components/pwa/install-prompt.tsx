"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyTile } from "@/components/ui/key-mark";
import styles from "./install-prompt.module.css";

/**
 * "Install keys as an app."
 *
 * Only Chromium fires `beforeinstallprompt`, and it is the only browser that
 * lets a page trigger the install. Safari installs through its own menu, so
 * there the prompt turns into instructions rather than pretending a button
 * will work. Anything that can't install at all gets nothing.
 */

type Mode = "chromium" | "safari-desktop" | "ios";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "keys.install-prompt-dismissed";
const SNOOZE_DAYS = 14;
/** Long enough that it never lands mid-navigation on a cold start. */
const APPEAR_AFTER_MS = 2500;

// ------------------------------------------------------------- detection

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    // iOS Safari predates display-mode and uses its own flag
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectMode(): Mode | null {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);

  if (isIos) return "ios";
  if (isSafari) return "safari-desktop";
  return null; // Chromium announces itself via beforeinstallprompt instead
}

function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(
      DISMISS_KEY,
      String(Date.now() + SNOOZE_DAYS * 864e5),
    );
  } catch {
    // storage disabled — the prompt simply comes back next session
  }
}

/**
 * Chrome can tell us the app is already installed even while we're being
 * viewed in a tab, which stops the prompt nagging people who already did it.
 */
async function alreadyInstalled(): Promise<boolean> {
  type Related = { getInstalledRelatedApps?: () => Promise<unknown[]> };
  const nav = navigator as Navigator & Related;
  if (!nav.getInstalledRelatedApps) return false;
  try {
    return (await nav.getInstalledRelatedApps()).length > 0;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------- ui

/**
 * The same offer, as a settings row. The floating prompt snoozes for two
 * weeks once dismissed, so this is the way back to it — and the only
 * affordance at all on browsers that never fire the event.
 */
export function InstallRow() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setMode("chromium");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    void alreadyInstalled().then((yes) => {
      setInstalled(yes);
      if (!yes) setMode((current) => current ?? detectMode());
    });
  }, []);

  if (installed === null) return null;

  return (
    <div className={styles.settingsRow}>
      <div className={styles.text}>
        <div className={styles.settingsTitle}>Install as an app</div>
        <div className={styles.sub}>
          {installed
            ? "Already installed on this device."
            : "Own window, Dock icon, works offline."}
        </div>
        {expanded && mode && mode !== "chromium" && (
          <Steps mode={mode} className={styles.steps} />
        )}
      </div>

      {!installed && mode && (
        <button
          type="button"
          className={styles.install}
          onClick={async () => {
            if (mode === "chromium" && event) {
              await event.prompt();
              const { outcome } = await event.userChoice;
              if (outcome === "accepted") setInstalled(true);
              return;
            }
            setExpanded((v) => !v);
          }}
        >
          {mode === "chromium" ? "Install" : expanded ? "Hide" : "How"}
        </button>
      )}
    </div>
  );
}

/** Platform-specific instructions, for the browsers we can't drive. */
function Steps({ mode, className }: { mode: Mode; className?: string }) {
  return (
    <ol className={className}>
      {mode === "ios" ? (
        <>
          <li>
            Tap <strong>Share</strong> in the toolbar
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>
          </li>
          <li>
            Tap <strong>Add</strong>
          </li>
        </>
      ) : (
        <>
          <li>
            Open the <strong>File</strong> menu
          </li>
          <li>
            Choose <strong>Add to Dock…</strong>
          </li>
          <li>
            Confirm with <strong>Add</strong>
          </li>
        </>
      )}
    </ol>
  );
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Capture the Chromium event as early as possible — it fires once, and
  // only a listener registered before it can call prompt() later.
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setMode("chromium");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  useEffect(() => {
    const onInstalled = () => {
      setVisible(false);
      snooze();
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  // Safari never fires the event, so fall back to sniffing after a beat —
  // long enough for Chromium to have spoken up if it was going to.
  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || (await alreadyInstalled())) return;
      setMode((current) => current ?? detectMode());
      setVisible(true);
    }, APPEAR_AFTER_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    snooze();
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    setBusy(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "accepted") setVisible(false);
      else dismiss();
    } catch {
      // the prompt can only be used once; fall back to instructions
      setEvent(null);
      setMode(detectMode());
      setExpanded(true);
    } finally {
      setBusy(false);
    }
  }, [event, dismiss]);

  // Nothing to offer on browsers that can't install at all.
  if (!visible || !mode) return null;

  return (
    <div className={styles.wrap} role="dialog" aria-label="Install keys">
      <div className={styles.card}>
        <div className={styles.row}>
          <KeyTile size={32} radius={7} />

          <div className={styles.text}>
            <div className={styles.title}>Install keys</div>
            <div className={styles.sub}>
              Own window, Dock icon, works offline.
            </div>
          </div>

          {mode === "chromium" ? (
            <button
              type="button"
              className={styles.install}
              onClick={install}
              disabled={busy}
            >
              {busy ? "Installing…" : "Install"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.install}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Hide" : "How"}
            </button>
          )}

          <button
            type="button"
            className={styles.close}
            onClick={dismiss}
            aria-label="Not now"
          >
            ✕
          </button>
        </div>

        {expanded && mode !== "chromium" && (
          <Steps mode={mode} className={styles.steps} />
        )}
      </div>
    </div>
  );
}
