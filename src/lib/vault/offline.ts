"use client";

/**
 * Offline mirror of the vault.
 *
 * Only ciphertext lands here — the same bytes the server holds. Without the
 * vault key (which lives in memory, or behind Touch ID) the store is inert,
 * so an installed PWA can keep a full copy on disk without weakening the
 * threat model.
 */

const DB_NAME = "keys-offline";
const DB_VERSION = 2;
const ITEMS = "items";
const META = "meta";
const QUEUE = "queue";

export type StoredItem = {
  id: string;
  type: "PASSWORD" | "NOTE";
  cipher: string;
  iv: string;
  folderId: string | null;
  favorite: boolean;
  hasTotp: boolean;
  strength: number | null;
  breached: boolean;
  reusedKey: string | null;
  pwChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  eraseAt: string | null;
  tagIds: string[];
};

export type QueuedMutation = {
  id: string;
  at: number;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEMS)) {
        db.createObjectStore(ITEMS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ------------------------------------------------------------------ items

export async function cacheItems(items: StoredItem[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(ITEMS, "readwrite");
    const store = t.objectStore(ITEMS);
    store.clear();
    for (const item of items) store.put(item);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  await tx(META, "readwrite", (s) => s.put(Date.now(), "syncedAt"));
}

export async function readCachedItems(): Promise<StoredItem[]> {
  try {
    return await tx<StoredItem[]>(ITEMS, "readonly", (s) => s.getAll());
  } catch {
    return [];
  }
}

export async function putCachedItem(item: StoredItem): Promise<void> {
  await tx(ITEMS, "readwrite", (s) => s.put(item)).catch(() => {});
}

export async function dropCachedItem(id: string): Promise<void> {
  await tx(ITEMS, "readwrite", (s) => s.delete(id)).catch(() => {});
}

export async function lastSyncedAt(): Promise<number | null> {
  try {
    return (await tx<number | undefined>(META, "readonly", (s) => s.get("syncedAt"))) ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ write queue

/** Mutations made while offline, replayed in order once we're back. */
export async function enqueue(mutation: Omit<QueuedMutation, "id" | "at">) {
  const entry: QueuedMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    at: Date.now(),
  };
  await tx(QUEUE, "readwrite", (s) => s.put(entry)).catch(() => {});
  return entry;
}

export async function readQueue(): Promise<QueuedMutation[]> {
  try {
    const all = await tx<QueuedMutation[]>(QUEUE, "readonly", (s) => s.getAll());
    return all.sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export async function dequeue(id: string) {
  await tx(QUEUE, "readwrite", (s) => s.delete(id)).catch(() => {});
}

/** Called on sign-out-and-remove-device: leaves nothing behind. */
export async function wipeOffline(): Promise<void> {
  dbPromise = null;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
