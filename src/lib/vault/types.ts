/** The plaintext shape that lives inside every item's ciphertext. */
export type PasswordPayload = {
  kind: "PASSWORD";
  name: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  /** base32 TOTP secret, as pasted from a setup key or scanned QR */
  totpSecret?: string;
  customFields?: { label: string; value: string; secret: boolean }[];
};

export type NotePayload = {
  kind: "NOTE";
  title: string;
  body: string;
};

export type ItemPayload = PasswordPayload | NotePayload;

/** Server-side row plus the decrypted payload, as the UI sees it. */
export type VaultEntry = {
  id: string;
  type: "PASSWORD" | "NOTE";
  payload: ItemPayload;
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

export type Folder = { id: string; name: string; color: string; position: number };
export type Tag = { id: string; name: string; count: number };

export function isPassword(
  entry: VaultEntry,
): entry is VaultEntry & { payload: PasswordPayload } {
  return entry.payload.kind === "PASSWORD";
}

export function isNote(
  entry: VaultEntry,
): entry is VaultEntry & { payload: NotePayload } {
  return entry.payload.kind === "NOTE";
}

export function entryTitle(entry: VaultEntry): string {
  return entry.payload.kind === "PASSWORD" ? entry.payload.name : entry.payload.title;
}

/** The single-letter avatar the table and cards use. */
export function entryMono(entry: VaultEntry): string {
  const title = entryTitle(entry).trim();
  return (title[0] ?? "?").toUpperCase();
}

/** Deterministic warm-grey avatar colour, so the same site keeps its shade. */
export function entryColor(entry: VaultEntry): string {
  const palette = ["#1c1917", "#44403c", "#57534e", "#78716c"];
  const title = entryTitle(entry);
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
