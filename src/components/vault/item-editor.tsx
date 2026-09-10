"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Field, Meter, Toggle } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { useVault } from "./vault-provider";
import { breachCount } from "@/lib/vault/breach";
import { defaultOptions, generate, type GeneratorOptions } from "@/lib/vault/generator";
import { estimateStrength, strengthColor } from "@/lib/vault/strength";
import { parseTotp } from "@/lib/vault/totp";
import type { ItemPayload, VaultEntry } from "@/lib/vault/types";
import { seal } from "@/lib/crypto/vault";
import styles from "./item-editor.module.css";

type Kind = "PASSWORD" | "NOTE";

export function ItemEditor({
  mode,
  kind: initialKind,
  entry,
  onClose,
}: {
  mode: "new" | "edit";
  kind: Kind;
  entry?: VaultEntry;
  onClose: () => void;
}) {
  const { createEntry, updateEntry, folders, tags, settings, vaultKey } = useVault();

  const [kind, setKind] = useState<Kind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // password fields
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [notes, setNotes] = useState("");

  // note fields
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [folderId, setFolderId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [options, setOptions] = useState<GeneratorOptions>(defaultOptions);

  useEffect(() => {
    if (!entry) {
      if (initialKind === "PASSWORD") setPassword(generate(defaultOptions));
      return;
    }
    setFolderId(entry.folderId);
    setTagIds(entry.tagIds);
    if (entry.payload.kind === "PASSWORD") {
      setName(entry.payload.name);
      setUrl(entry.payload.url);
      setUsername(entry.payload.username);
      setPassword(entry.payload.password);
      setTotpSecret(entry.payload.totpSecret ?? "");
      setNotes(entry.payload.notes);
    } else {
      setTitle(entry.payload.title);
      setBody(entry.payload.body);
    }
  }, [entry, initialKind]);

  const strength = useMemo(() => estimateStrength(password), [password]);

  function regenerate(next: GeneratorOptions = options) {
    const value = generate(next);
    setPassword(value);

    // The generator keeps its last 20 outputs for 24h, encrypted.
    const key = vaultKey();
    if (key) {
      void seal(key, value)
        .then((sealed) =>
          fetch("/api/vault/generated", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(sealed),
          }),
        )
        .catch(() => {});
    }
  }

  async function save() {
    setError(null);

    if (kind === "PASSWORD" && !name.trim()) {
      setError("Give it a name so you can find it later.");
      return;
    }
    if (kind === "NOTE" && !title.trim()) {
      setError("Give the note a title.");
      return;
    }

    let normalisedTotp: string | undefined;
    if (kind === "PASSWORD" && totpSecret.trim()) {
      try {
        normalisedTotp = parseTotp(totpSecret).secret;
      } catch {
        setError("That 2FA setup key isn't valid base32.");
        return;
      }
    }

    setBusy(true);
    try {
      const payload: ItemPayload =
        kind === "PASSWORD"
          ? {
              kind: "PASSWORD",
              name: name.trim(),
              url: url.trim(),
              username: username.trim(),
              password,
              notes,
              ...(normalisedTotp ? { totpSecret: normalisedTotp } : {}),
            }
          : { kind: "NOTE", title: title.trim(), body };

      // Breach checks are k-anonymous and best-effort: never block a save.
      let breached = entry?.breached ?? false;
      if (kind === "PASSWORD" && settings.breachMonitoring && password) {
        breached = await breachCount(password)
          .then((n) => n > 0)
          .catch(() => breached);
      }

      if (mode === "new") {
        await createEntry(payload, { folderId, tagIds, breached });
        notify.success("Saved to vault");
      } else if (entry) {
        await updateEntry(entry.id, payload, { folderId, tagIds, breached });
        notify.success("Changes saved");
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
      setBusy(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.scrim} onMouseDown={onClose}>
      <div
        className={styles.modal}
        data-note={kind === "NOTE" || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "new" ? "New item" : "Edit item"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.form}>
          <div className={styles.head}>
            <div className="t-title">{mode === "new" ? "New item" : "Edit item"}</div>
            {mode === "new" && (
              <div className={styles.segmented}>
                <button
                  type="button"
                  data-active={kind === "PASSWORD" || undefined}
                  onClick={() => setKind("PASSWORD")}
                >
                  Password
                </button>
                <button
                  type="button"
                  data-active={kind === "NOTE" || undefined}
                  onClick={() => setKind("NOTE")}
                >
                  Secure note
                </button>
              </div>
            )}
          </div>

          {kind === "PASSWORD" ? (
            <>
              <div className={styles.two}>
                <Field
                  label="Name"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Linear"
                />
                <Field
                  label="Website"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="linear.app"
                />
              </div>

              <Field
                label="Username or email"
                value={username}
                autoComplete="off"
                onChange={(e) => setUsername(e.target.value)}
              />

              <div className={styles.field}>
                <label className="t-label">Password</label>
                <div className={styles.passwordRow}>
                  <input
                    className={styles.passwordInput}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className={styles.regen}
                    onClick={() => regenerate()}
                  >
                    ↻ Regenerate
                  </button>
                </div>
                <div className={styles.strengthRow}>
                  <Meter
                    value={strength.score}
                    color={strengthColor(strength.label)}
                    width="100%"
                  />
                  <span
                    style={{
                      font: "600 11px var(--font-sans)",
                      color: strengthColor(strength.label),
                      whiteSpace: "nowrap",
                    }}
                  >
                    {strength.label} · {strength.crackTime}
                  </span>
                </div>
              </div>

              <div className={styles.two}>
                <div className={styles.field}>
                  <label className="t-label">Folder</label>
                  <select
                    className={styles.select}
                    value={folderId ?? ""}
                    onChange={(e) => setFolderId(e.target.value || null)}
                  >
                    <option value="">No folder</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label className="t-label">Tags</label>
                  <div className={styles.tagBox}>
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className={styles.tag}
                        data-on={tagIds.includes(tag.id) || undefined}
                        onClick={() =>
                          setTagIds((prev) =>
                            prev.includes(tag.id)
                              ? prev.filter((id) => id !== tag.id)
                              : [...prev, tag.id],
                          )
                        }
                      >
                        {tag.name}
                      </button>
                    ))}
                    {tags.length === 0 && (
                      <span className={styles.tagHint}>
                        Add tags in Settings → Folders &amp; tags
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <Field
                label="2FA secret (optional)"
                placeholder="Paste the setup key or an otpauth:// link"
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                className={styles.dashed}
              />

              <div className={styles.field}>
                <label className="t-label">Notes</label>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <Field
                label="Title"
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Stripe backup codes"
              />
              <div className={styles.field}>
                <label className="t-label">Contents</label>
                <textarea
                  className={styles.textarea}
                  style={{ minHeight: 240, fontFamily: "var(--font-mono)" }}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className="t-label">Folder</label>
                <select
                  className={styles.select}
                  value={folderId ?? ""}
                  onChange={(e) => setFolderId(e.target.value || null)}
                >
                  <option value="">No folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="lg" loading={busy} onClick={save}>
              {mode === "new" ? "Save to vault" : "Save changes"}
            </Button>
          </div>
        </div>

        {kind === "PASSWORD" && (
          <GeneratorPanel
            options={options}
            onChange={(next) => {
              setOptions(next);
              regenerate(next);
            }}
          />
        )}
      </div>
    </div>
  );
}

function GeneratorPanel({
  options,
  onChange,
}: {
  options: GeneratorOptions;
  onChange: (next: GeneratorOptions) => void;
}) {
  const set = <K extends keyof GeneratorOptions>(key: K, value: GeneratorOptions[K]) =>
    onChange({ ...options, [key]: value });

  const isPassphrase = options.mode === "passphrase";

  return (
    <aside className={styles.generator}>
      <div style={{ font: "700 15px var(--font-sans)" }}>Generator</div>

      <div className={styles.segmented} data-full>
        {(["random", "passphrase", "pin"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            data-active={options.mode === mode || undefined}
            onClick={() => set("mode", mode)}
          >
            {mode === "random" ? "Random" : mode === "passphrase" ? "Passphrase" : "PIN"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className={styles.sliderHead}>
          <span>{isPassphrase ? "Words" : "Length"}</span>
          <span className="mono" style={{ fontSize: 13 }}>
            {isPassphrase ? options.words : options.length}
          </span>
        </div>
        <input
          type="range"
          min={isPassphrase ? 3 : 4}
          max={isPassphrase ? 10 : 64}
          value={isPassphrase ? options.words : options.length}
          onChange={(e) =>
            isPassphrase
              ? set("words", Number(e.target.value))
              : set("length", Number(e.target.value))
          }
          className={styles.slider}
        />
      </div>

      {options.mode !== "pin" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ToggleRow
            label={isPassphrase ? "Capitalise words" : "Uppercase A–Z"}
            checked={options.uppercase}
            onChange={(v) => set("uppercase", v)}
          />
          <ToggleRow
            label={isPassphrase ? "Add digits" : "Digits 0–9"}
            checked={options.digits}
            onChange={(v) => set("digits", v)}
          />
          {!isPassphrase && (
            <>
              <ToggleRow
                label="Symbols !@#"
                checked={options.symbols}
                onChange={(v) => set("symbols", v)}
              />
              <ToggleRow
                label="Avoid ambiguous (l, 1, O, 0)"
                muted
                checked={options.avoidAmbiguous}
                onChange={(v) => set("avoidAmbiguous", v)}
              />
            </>
          )}
        </div>
      )}

      <div className={styles.history}>
        <div className="t-eyebrow">History</div>
        <div style={{ font: "500 12px/1.5 var(--font-sans)", color: "var(--muted)" }}>
          Last 20 generated passwords are kept for 24h.
        </div>
      </div>
    </aside>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  muted,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        font: "600 13px var(--font-sans)",
        color: muted ? "var(--muted)" : "var(--ink)",
        gap: 12,
      }}
    >
      <span>{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
