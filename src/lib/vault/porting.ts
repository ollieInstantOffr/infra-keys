"use client";

import type { PasswordPayload } from "./types";

/**
 * CSV import/export. Files are parsed on this device and never uploaded —
 * the browser reads them, encrypts what it keeps, and the plaintext never
 * leaves the tab.
 */

export type ImportSource =
  | "chrome"
  | "safari"
  | "1password"
  | "bitwarden"
  | "lastpass"
  | "keys"
  | "unknown";

export type ParsedRow = PasswordPayload & { folderHint?: string };

export type ImportReport = {
  source: ImportSource;
  rows: ParsedRow[];
  missingPassword: number;
  total: number;
};

/** RFC 4180-ish: handles quoted fields, escaped quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const HEADER_MAP: Record<string, keyof ParsedRow | "folderHint"> = {
  name: "name",
  title: "name",
  display_name: "name",
  account: "name",
  url: "url",
  urls: "url",
  website: "url",
  login_uri: "url",
  username: "username",
  login_username: "username",
  "login_username ": "username",
  user: "username",
  email: "username",
  password: "password",
  login_password: "password",
  note: "notes",
  notes: "notes",
  extra: "notes",
  grouping: "folderHint",
  folder: "folderHint",
  type: "folderHint",
  otpauth: "totpSecret",
  totp: "totpSecret",
  login_totp: "totpSecret",
};

export function detectSource(headers: string[]): ImportSource {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()));

  // Order matters: the more distinctive headers have to be checked first.
  if (set.has("login_uri") && set.has("login_password")) return "bitwarden";
  if (set.has("grouping") && set.has("extra")) return "lastpass";
  if (set.has("type") && set.has("title")) return "1password";
  // Safari exports Title/URL/Username/Password/Notes/OTPAuth
  if (set.has("title") && set.has("otpauth")) return "safari";
  // Chrome exports name/url/username/password/note
  if (set.has("name") && set.has("note")) return "chrome";
  if (set.has("url") && set.has("username") && set.has("password")) {
    return set.has("title") ? "safari" : "chrome";
  }
  return "unknown";
}

export function parseImport(text: string): ImportReport {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { source: "unknown", rows: [], missingPassword: 0, total: 0 };
  }

  const headers = table[0].map((h) => h.trim().toLowerCase().replace(/^﻿/, ""));
  const source = detectSource(headers);

  let missingPassword = 0;
  const rows: ParsedRow[] = [];

  for (const line of table.slice(1)) {
    const record: ParsedRow = {
      kind: "PASSWORD",
      name: "",
      username: "",
      password: "",
      url: "",
      notes: "",
    };

    headers.forEach((header, i) => {
      const field = HEADER_MAP[header];
      if (!field) return;
      const value = (line[i] ?? "").trim();
      if (!value) return;
      if (field === "folderHint") record.folderHint = value;
      else if (field === "totpSecret") record.totpSecret = value;
      else record[field as "name" | "username" | "password" | "url" | "notes"] = value;
    });

    if (!record.name) {
      record.name = record.url
        ? record.url.replace(/^https?:\/\//, "").split("/")[0]
        : (record.username ?? "Untitled");
    }

    if (!record.password) {
      missingPassword += 1;
      continue;
    }

    rows.push(record);
  }

  return { source, rows, missingPassword, total: table.length - 1 };
}

export const SOURCE_LABEL: Record<ImportSource, string> = {
  chrome: "Chrome export format detected",
  safari: "Safari / iCloud export format detected",
  "1password": "1Password export format detected",
  bitwarden: "Bitwarden export format detected",
  lastpass: "LastPass export format detected",
  keys: "keys backup",
  unknown: "Generic CSV — we'll do our best",
};

// ------------------------------------------------------------------ export

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(items: PasswordPayload[]): string {
  const header = ["name", "url", "username", "password", "note", "otpauth"];
  const lines = [header.join(",")];
  for (const item of items) {
    lines.push(
      [
        item.name,
        item.url,
        item.username,
        item.password,
        item.notes,
        item.totpSecret ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}
