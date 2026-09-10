"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  fromB64,
  reuseIndex,
  seal,
  sealJson,
  toB64,
  unseal,
  unsealJson,
  type Sealed,
} from "@/lib/crypto/vault";
import {
  cacheItems,
  dequeue,
  dropCachedItem,
  enqueue,
  lastSyncedAt,
  putCachedItem,
  readCachedItems,
  readQueue,
  wipeOffline,
  type StoredItem,
} from "@/lib/vault/offline";
import type {
  Folder,
  ItemPayload,
  PasswordPayload,
  Tag,
  VaultEntry,
} from "@/lib/vault/types";
import { estimateStrength } from "@/lib/vault/strength";
import { notify } from "@/components/ui/toast";

// ------------------------------------------------------------------ types

export type VaultStatus =
  | "booting"
  | "needs-enrolment" // signed in, no device key on this browser and no vault yet
  | "needs-approval" // vault exists elsewhere, this device has no key
  | "locked"
  | "unlocked";

export type PendingApproval = {
  id: string;
  newDeviceId: string;
  matchCode: string;
  deviceLabel: string;
  location: string | null;
  requestedAt: string;
  expiresAt: string;
  recipientPublicKey: string | null;
};

export type VaultSettings = {
  autoLockSeconds: number;
  clipboardSeconds: number;
  lockOnBlur: boolean;
  breachMonitoring: boolean;
  reverifyDays: number;
  offlineEnabled: boolean;
  weeklyBackup: boolean;
};

type Bootstrap = {
  user: {
    email: string;
    displayName: string | null;
    hasRecoveryKit: boolean;
    recoverySavedAt: string | null;
    reverifyAt: string;
  };
  device: {
    id: string;
    name: string;
    browser: string;
    prfSalt: string | null;
    usesPrf: boolean;
    wrappedVaultKey: string | null;
    enrolledAt: string;
  } | null;
  items: StoredItem[];
  folders: { id: string; cipher: string; iv: string; color: string; position: number }[];
  tags: { id: string; cipher: string; iv: string; count: number }[];
  settings: VaultSettings | null;
  prefs: Record<string, boolean> | null;
  deletion: { scheduledAt: string; cancelledAt: string | null } | null;
  pendingApprovals: PendingApproval[];
  recentlyAdded: {
    id: string;
    name: string;
    browser: string;
    undoUntil: string | null;
    addedFrom: string | null;
  }[];
};

type VaultContextValue = {
  status: VaultStatus;
  boot: Bootstrap | null;
  entries: VaultEntry[];
  folders: Folder[];
  tags: Tag[];
  settings: VaultSettings;
  online: boolean;
  syncedAt: number | null;
  pendingWrites: number;

  /** Hands the decrypted vault key to the provider and flips to unlocked. */
  adoptKey: (key: CryptoKey) => Promise<void>;
  vaultKey: () => CryptoKey | null;
  lock: () => void;
  refresh: () => Promise<void>;
  signOut: (mode: "keep" | "remove") => Promise<void>;

  createEntry: (payload: ItemPayload, meta?: Partial<EntryMeta>) => Promise<string>;
  updateEntry: (
    id: string,
    payload: ItemPayload,
    meta?: Partial<EntryMeta>,
  ) => Promise<void>;
  patchMeta: (id: string, meta: Partial<EntryMeta>) => Promise<void>;
  trashEntry: (id: string) => Promise<void>;
  restoreEntry: (id: string) => Promise<void>;
  purgeEntry: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;

  copy: (value: string, label: string) => Promise<void>;
  sealValue: (value: string) => Promise<Sealed>;
  unsealValue: (sealed: Sealed, aad?: string) => Promise<string>;
};

export type EntryMeta = {
  folderId: string | null;
  favorite: boolean;
  tagIds: string[];
  breached: boolean;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside <VaultProvider>");
  return ctx;
}

const DEFAULT_SETTINGS: VaultSettings = {
  autoLockSeconds: 300,
  clipboardSeconds: 30,
  lockOnBlur: false,
  breachMonitoring: true,
  reverifyDays: 30,
  offlineEnabled: true,
  weeklyBackup: false,
};

// ----------------------------------------------------------------- helpers

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "That didn't work.");
  return body as T;
}

// ---------------------------------------------------------------- provider

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // The vault key lives in a ref, never in state — it must not end up in a
  // React DevTools snapshot or a serialised error boundary.
  const keyRef = useRef<CryptoKey | null>(null);

  const [status, setStatus] = useState<VaultStatus>("booting");
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [settings, setSettings] = useState<VaultSettings>(DEFAULT_SETTINGS);
  const [online, setOnline] = useState(true);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);

  const rawItems = useRef<StoredItem[]>([]);
  const clipboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------------------------------------------------------------ bootstrap

  const load = useCallback(async () => {
    try {
      const data = await api<Bootstrap>("/api/vault/bootstrap");
      setBoot(data);
      setSettings(data.settings ?? DEFAULT_SETTINGS);
      rawItems.current = data.items;

      if (data.settings?.offlineEnabled !== false) {
        await cacheItems(data.items);
      }
      setSyncedAt(Date.now());

      if (!keyRef.current) {
        if (data.device?.wrappedVaultKey) setStatus("locked");
        else if (data.items.length > 0 || data.user.hasRecoveryKit)
          setStatus("needs-approval");
        else setStatus("needs-enrolment");
      }
      return data;
    } catch {
      // Offline: fall back to the encrypted mirror so the app still opens.
      const cached = await readCachedItems();
      rawItems.current = cached;
      setSyncedAt(await lastSyncedAt());
      setOnline(false);
      if (!keyRef.current) setStatus("locked");
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ------------------------------------------------------------- decrypt

  const decryptAll = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;

    const [decodedFolders, decodedTags] = await Promise.all([
      Promise.all(
        (boot?.folders ?? []).map(async (f) => ({
          id: f.id,
          name: await unseal(key, { cipher: f.cipher, iv: f.iv }).catch(() => "Folder"),
          color: f.color,
          position: f.position,
        })),
      ),
      Promise.all(
        (boot?.tags ?? []).map(async (t) => ({
          id: t.id,
          name: await unseal(key, { cipher: t.cipher, iv: t.iv }).catch(() => "tag"),
          count: t.count,
        })),
      ),
    ]);

    const decoded = await Promise.all(
      rawItems.current.map(async (row): Promise<VaultEntry | null> => {
        try {
          const payload = await unsealJson<ItemPayload>(
            key,
            { cipher: row.cipher, iv: row.iv },
            row.id,
          );
          return { ...row, payload };
        } catch {
          // A row we can't open belongs to a different vault key — skip it
          // rather than blowing up the whole list.
          return null;
        }
      }),
    );

    setFolders(decodedFolders.sort((a, b) => a.position - b.position));
    setTags(decodedTags);
    setEntries(decoded.filter((e): e is VaultEntry => e !== null));
  }, [boot]);

  useEffect(() => {
    if (status === "unlocked") void decryptAll();
  }, [status, decryptAll]);

  // -------------------------------------------------------------- unlock

  const adoptKey = useCallback(
    async (key: CryptoKey) => {
      keyRef.current = key;
      setStatus("unlocked");
      await decryptAll();
    },
    [decryptAll],
  );

  const lock = useCallback(() => {
    keyRef.current = null;
    setEntries([]);
    setFolders([]);
    setTags([]);
    setStatus("locked");
  }, []);

  // ------------------------------------------------------- auto-lock

  useEffect(() => {
    if (status !== "unlocked" || settings.autoLockSeconds <= 0) return;

    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        notify.warning("Vault locked after inactivity");
        lock();
      }, settings.autoLockSeconds * 1000);
    };

    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, arm, { passive: true });
    arm();

    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, arm);
    };
  }, [status, settings.autoLockSeconds, lock]);

  useEffect(() => {
    if (status !== "unlocked" || !settings.lockOnBlur) return;
    const onBlur = () => lock();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [status, settings.lockOnBlur, lock]);

  // ------------------------------------------------------------ offline

  const drain = useCallback(async () => {
    const queue = await readQueue();
    setPendingWrites(queue.length);
    for (const mutation of queue) {
      try {
        await api(mutation.path, {
          method: mutation.method,
          body: mutation.body ? JSON.stringify(mutation.body) : undefined,
        });
        await dequeue(mutation.id);
        setPendingWrites((n) => Math.max(0, n - 1));
      } catch {
        return; // stop at the first failure so order is preserved
      }
    }
    if (queue.length) await load();
  }, [load]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      void drain();
    };
    const down = () => {
      setOnline(false);
      notify.info("You're offline — changes will sync when you're back.");
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    void readQueue().then((q) => setPendingWrites(q.length));
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [drain]);

  // ---------------------------------------------------------------- CRUD

  const requireKey = () => {
    const key = keyRef.current;
    if (!key) throw new Error("The vault is locked.");
    return key;
  };

  /** Metadata the server is allowed to see, computed from the payload. */
  const deriveMeta = useCallback(async (payload: ItemPayload, key: CryptoKey) => {
    if (payload.kind !== "PASSWORD") {
      return { strength: null, reusedKey: null, hasTotp: false };
    }
    const pw = payload as PasswordPayload;
    return {
      strength: pw.password ? estimateStrength(pw.password).score : null,
      reusedKey: pw.password ? await reuseIndex(key, pw.password) : null,
      hasTotp: Boolean(pw.totpSecret),
    };
  }, []);

  const send = useCallback(
    async <T,>(
      method: "POST" | "PATCH" | "DELETE",
      path: string,
      body?: unknown,
    ): Promise<T | null> => {
      if (!navigator.onLine) {
        await enqueue({ method, path, body });
        setPendingWrites((n) => n + 1);
        return null;
      }
      try {
        return await api<T>(path, {
          method,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        // A network failure gets queued; a server rejection is real.
        if (error instanceof TypeError) {
          await enqueue({ method, path, body });
          setPendingWrites((n) => n + 1);
          return null;
        }
        throw error;
      }
    },
    [],
  );

  const createEntry = useCallback(
    async (payload: ItemPayload, meta: Partial<EntryMeta> = {}) => {
      const key = requireKey();
      const tempId = crypto.randomUUID();
      const derived = await deriveMeta(payload, key);
      const sealed = await sealJson(key, payload, tempId);
      const now = new Date().toISOString();

      const row: StoredItem = {
        id: tempId,
        type: payload.kind,
        cipher: sealed.cipher,
        iv: sealed.iv,
        folderId: meta.folderId ?? null,
        favorite: meta.favorite ?? false,
        hasTotp: derived.hasTotp,
        strength: derived.strength,
        breached: meta.breached ?? false,
        reusedKey: derived.reusedKey,
        pwChangedAt: payload.kind === "PASSWORD" ? now : null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        eraseAt: null,
        tagIds: meta.tagIds ?? [],
      };

      rawItems.current = [row, ...rawItems.current];
      setEntries((prev) => [{ ...row, payload }, ...prev]);
      await putCachedItem(row);

      const created = await send<{ id: string }>("POST", "/api/vault/items", {
        type: payload.kind,
        cipher: sealed.cipher,
        iv: sealed.iv,
        folderId: row.folderId,
        favorite: row.favorite,
        hasTotp: row.hasTotp,
        strength: row.strength,
        breached: row.breached,
        reusedKey: row.reusedKey,
        tagIds: row.tagIds,
      });

      // The ciphertext is bound to the row id, so a server-assigned id means
      // re-sealing under the real one.
      if (created?.id && created.id !== tempId) {
        const resealed = await sealJson(key, payload, created.id);
        await send("PATCH", `/api/vault/items/${created.id}`, {
          cipher: resealed.cipher,
          iv: resealed.iv,
        });

        const settled: StoredItem = {
          ...row,
          id: created.id,
          cipher: resealed.cipher,
          iv: resealed.iv,
        };
        rawItems.current = rawItems.current.map((r) => (r.id === tempId ? settled : r));
        setEntries((prev) =>
          prev.map((e) => (e.id === tempId ? { ...settled, payload } : e)),
        );
        await dropCachedItem(tempId);
        await putCachedItem(settled);
        return created.id;
      }

      return tempId;
    },
    [deriveMeta, send],
  );

  const updateEntry = useCallback(
    async (id: string, payload: ItemPayload, meta: Partial<EntryMeta> = {}) => {
      const key = requireKey();
      const previous = rawItems.current.find((r) => r.id === id);
      const previousEntry = entries.find((e) => e.id === id);

      const derived = await deriveMeta(payload, key);
      const sealed = await sealJson(key, payload, id);
      const now = new Date().toISOString();

      const passwordChanged =
        payload.kind === "PASSWORD" &&
        previousEntry?.payload.kind === "PASSWORD" &&
        previousEntry.payload.password !== payload.password;

      const row: StoredItem = {
        ...(previous as StoredItem),
        id,
        cipher: sealed.cipher,
        iv: sealed.iv,
        hasTotp: derived.hasTotp,
        strength: derived.strength,
        reusedKey: derived.reusedKey,
        folderId: meta.folderId !== undefined ? meta.folderId : (previous?.folderId ?? null),
        favorite: meta.favorite ?? previous?.favorite ?? false,
        breached: meta.breached ?? previous?.breached ?? false,
        tagIds: meta.tagIds ?? previous?.tagIds ?? [],
        updatedAt: now,
        pwChangedAt: passwordChanged ? now : (previous?.pwChangedAt ?? null),
      };

      rawItems.current = rawItems.current.map((r) => (r.id === id ? row : r));
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...row, payload } : e)));
      await putCachedItem(row);

      await send("PATCH", `/api/vault/items/${id}`, {
        cipher: sealed.cipher,
        iv: sealed.iv,
        folderId: row.folderId,
        favorite: row.favorite,
        hasTotp: row.hasTotp,
        strength: row.strength,
        breached: row.breached,
        reusedKey: row.reusedKey,
        tagIds: row.tagIds,
        passwordChanged,
        previous:
          passwordChanged && previous
            ? { cipher: previous.cipher, iv: previous.iv }
            : null,
      });
    },
    [deriveMeta, entries, send],
  );

  const patchMeta = useCallback(
    async (id: string, meta: Partial<EntryMeta>) => {
      const previous = rawItems.current.find((r) => r.id === id);
      if (!previous) return;

      const row: StoredItem = {
        ...previous,
        folderId: meta.folderId !== undefined ? meta.folderId : previous.folderId,
        favorite: meta.favorite ?? previous.favorite,
        breached: meta.breached ?? previous.breached,
        tagIds: meta.tagIds ?? previous.tagIds,
      };

      rawItems.current = rawItems.current.map((r) => (r.id === id ? row : r));
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...row, payload: e.payload } : e)),
      );
      await putCachedItem(row);
      await send("PATCH", `/api/vault/items/${id}`, meta);
    },
    [send],
  );

  const trashEntry = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      const eraseAt = new Date(Date.now() + 30 * 864e5).toISOString();

      rawItems.current = rawItems.current.map((r) =>
        r.id === id ? { ...r, deletedAt: now, eraseAt } : r,
      );
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, deletedAt: now, eraseAt } : e)),
      );
      await send("DELETE", `/api/vault/items/${id}`);
    },
    [send],
  );

  const restoreEntry = useCallback(
    async (id: string) => {
      rawItems.current = rawItems.current.map((r) =>
        r.id === id ? { ...r, deletedAt: null, eraseAt: null } : r,
      );
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, deletedAt: null, eraseAt: null } : e)),
      );
      await send("POST", `/api/vault/items/${id}/restore`);
    },
    [send],
  );

  const purgeEntry = useCallback(
    async (id: string) => {
      rawItems.current = rawItems.current.filter((r) => r.id !== id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      await dropCachedItem(id);
      await send("DELETE", `/api/vault/items/${id}?permanent=1`);
    },
    [send],
  );

  const emptyTrash = useCallback(async () => {
    const doomed = rawItems.current.filter((r) => r.deletedAt);
    rawItems.current = rawItems.current.filter((r) => !r.deletedAt);
    setEntries((prev) => prev.filter((e) => !e.deletedAt));
    for (const row of doomed) await dropCachedItem(row.id);
    await send("DELETE", "/api/vault/trash");
  }, [send]);

  // ----------------------------------------------------------- clipboard

  const copy = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        notify.error("This browser blocked the clipboard.");
        return;
      }

      notify.copied(label, settings.clipboardSeconds);

      if (clipboardTimer.current) clearTimeout(clipboardTimer.current);
      if (settings.clipboardSeconds > 0) {
        clipboardTimer.current = setTimeout(() => {
          // Only wipe if what we put there is still what's there.
          navigator.clipboard
            .readText()
            .then((current) => {
              if (current === value) return navigator.clipboard.writeText("");
            })
            .catch(() => navigator.clipboard.writeText("").catch(() => {}));
        }, settings.clipboardSeconds * 1000);
      }
    },
    [settings.clipboardSeconds],
  );

  // ------------------------------------------------------------ sign out

  const signOut = useCallback(
    async (mode: "keep" | "remove") => {
      await api("/api/auth/signout", {
        method: "POST",
        body: JSON.stringify({ mode }),
      }).catch(() => {});

      if (mode === "remove") {
        await wipeOffline();
        const { forgetFallbackSecrets } = await import("@/lib/vault/webauthn-client");
        await forgetFallbackSecrets();
      }

      keyRef.current = null;
      router.replace("/signin");
    },
    [router],
  );

  // ------------------------------------------------------------- exports

  const sealValue = useCallback(async (value: string) => seal(requireKey(), value), []);
  const unsealValue = useCallback(
    async (sealed: Sealed, aad?: string) => unseal(requireKey(), sealed, aad),
    [],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      boot,
      entries,
      folders,
      tags,
      settings,
      online,
      syncedAt,
      pendingWrites,
      adoptKey,
      vaultKey: () => keyRef.current,
      lock,
      refresh: async () => {
        await load();
        await decryptAll();
      },
      signOut,
      createEntry,
      updateEntry,
      patchMeta,
      trashEntry,
      restoreEntry,
      purgeEntry,
      emptyTrash,
      copy,
      sealValue,
      unsealValue,
    }),
    [
      status, boot, entries, folders, tags, settings, online, syncedAt,
      pendingWrites, adoptKey, lock, load, decryptAll, signOut, createEntry,
      updateEntry, patchMeta, trashEntry, restoreEntry, purgeEntry, emptyTrash,
      copy, sealValue, unsealValue,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export { toB64, fromB64 };
