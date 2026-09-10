"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { notify } from "@/components/ui/toast";
import { useVault } from "./vault-provider";

const DISMISS_KEY = "keys.dismissed-banners";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * The persistent banners from the design. Required ones (erase scheduled, a
 * new device added) cannot be dismissed; the rest remember their dismissal
 * per browser.
 */
export function VaultBanners() {
  const router = useRouter();
  const { boot, refresh } = useVault();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [reverifyDays, setReverifyDays] = useState<number | null>(null);

  useEffect(() => setDismissed(readDismissed()), []);

  useEffect(() => {
    if (!boot?.user.reverifyAt) return;
    const days = Math.ceil(
      (new Date(boot.user.reverifyAt).getTime() - Date.now()) / 864e5,
    );
    setReverifyDays(days);
  }, [boot]);

  function dismiss(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      // a browser with storage disabled just gets the banner again
    }
  }

  if (!boot) return null;

  const banners: React.ReactNode[] = [];

  // 1 — scheduled erase. Required, always first.
  if (boot.deletion && !boot.deletion.cancelledAt) {
    const days = Math.max(
      0,
      Math.ceil((new Date(boot.deletion.scheduledAt).getTime() - Date.now()) / 864e5),
    );
    banners.push(
      <Banner
        key="erase"
        tone="alert"
        title={`Your vault is scheduled to be erased in ${days} ${days === 1 ? "day" : "days"}`}
        body="A start-over was requested. If that wasn't you, cancel it now."
        primary={{
          label: "Cancel erase",
          onClick: async () => {
            await fetch("/api/recovery/start-over", { method: "DELETE" });
            notify.success("Erase cancelled — your vault stays put.");
            await refresh();
          },
        }}
      />,
    );
  }

  // 2 — a device was added in the last 24h. Required.
  for (const device of boot.recentlyAdded) {
    if (device.id === boot.device?.id) continue;
    banners.push(
      <Banner
        key={`device-${device.id}`}
        tone="alert"
        title={`A new device (${device.name} · ${device.browser}) was added`}
        body="You can undo this for the next 24 hours."
        primary={{
          label: "Undo",
          onClick: async () => {
            const res = await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
            if (res.ok) {
              notify.success("Device removed.");
              await refresh();
            } else {
              notify.error((await res.json()).error);
            }
          },
        }}
        secondary={{ label: "Dismiss", onClick: () => dismiss(`device-${device.id}`) }}
      />,
    );
  }

  // 3 — recovery code not saved yet.
  if (!boot.user.recoverySavedAt && !dismissed.includes("recovery")) {
    banners.push(
      <Banner
        key="recovery"
        title="Save your recovery code"
        body="Without it, losing all your devices means losing the vault. Takes one minute."
        primary={{
          label: "Save now",
          onClick: () => router.push("/settings/sign-in?recovery=1"),
        }}
        secondary={{ label: "Later", onClick: () => dismiss("recovery") }}
      />,
    );
  }

  // 4 — the 30-day re-verify is close.
  if (
    reverifyDays !== null &&
    reverifyDays <= 3 &&
    !dismissed.includes(`reverify-${reverifyDays}`)
  ) {
    banners.push(
      <Banner
        key="reverify"
        title={`Re-verify your email in ${Math.max(0, reverifyDays)} ${reverifyDays === 1 ? "day" : "days"}`}
        body="Touch ID sessions re-verify by magic link every 30 days."
        primary={{ label: "Verify now", onClick: () => router.push("/signin") }}
        secondary={{
          label: "Dismiss",
          onClick: () => dismiss(`reverify-${reverifyDays}`),
        }}
      />,
    );
  }

  // The install prompt is a floating card of its own — see
  // components/pwa/install-prompt.tsx.

  if (!banners.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{banners}</div>
  );
}
