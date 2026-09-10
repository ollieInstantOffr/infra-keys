"use client";

import { notify } from "@/components/ui/toast";

type Patch = {
  vault?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  profile?: Record<string, unknown>;
};

/** One place for the "save a setting, tell the user if it failed" dance. */
export async function saveSettings(patch: Patch): Promise<boolean> {
  try {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return true;
  } catch (error) {
    notify.error(
      error instanceof Error ? error.message : "Couldn't save that setting.",
    );
    return false;
  }
}
