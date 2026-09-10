"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Field, Toggle } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { saveSettings } from "@/lib/settings-client";
import { Card, PageHead, Row, RowCard, Select, settingsStyles as s } from "./pieces";
import { relativeDate } from "@/components/vault/vault-screen";
import { downloadBlob, recoveryKitPdf } from "@/lib/vault/recovery-pdf";
import {
  describeWebAuthnError,
  enrolDevice,
  touchIdAvailable,
} from "@/lib/vault/webauthn-client";
import {
  generateRecoveryCode,
  generateTransferKeypair,
  newRecoverySalt,
  normalizeRecoveryCode,
  recoveryHint,
  recoveryKeyFrom,
  unwrapVaultKey,
  wrapVaultKey,
} from "@/lib/crypto/vault";

type Device = {
  id: string;
  name: string;
  browser: string;
  usesPrf: boolean;
  enrolled: boolean;
  canApprove: boolean;
  isThisDevice: boolean;
  enrolledAt: string;
  lastSeenAt: string;
  undoUntil: string | null;
  addedFrom: string | null;
};

export function SignInSettings() {
  const params = useSearchParams();
  const { boot, settings, vaultKey, copy, refresh } = useVault();
  const { dialog, confirm } = useDialog();

  const [devices, setDevices] = useState<Device[]>([]);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyValue, setVerifyValue] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDevices = useCallback(async () => {
    const res = await fetch("/api/devices");
    if (res.ok) setDevices(await res.json());
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (params.get("recovery") === "missing") {
      notify.warning("That code was never saved. Regenerate it below.");
    }
  }, [params]);

  // "This wasn't me — remove device" in the new-device email lands here.
  useEffect(() => {
    const target = params.get("revoke");
    if (!target || !devices.length) return;
    const device = devices.find((d) => d.id === target);
    if (!device || device.isThisDevice) return;

    confirm(
      {
        kind: "security",
        title: `Remove ${device.name} from your vault?`,
        body: "You opened this from a security email. The device is signed out and its vault key is destroyed.",
        item: {
          name: `${device.name} · ${device.browser}`,
          mono: device.name.slice(0, 2),
          sub: device.addedFrom ? `Added from ${device.addedFrom}` : "Recently added",
        },
        confirmLabel: "Remove device",
      },
      async () => {
        await revoke(device);
      },
    );
    // one prompt per arrival, even if the device list refreshes
    window.history.replaceState({}, "", "/settings/sign-in");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, devices]);

  const hint = boot?.user.hasRecoveryKit ? "saved" : null;

  // ------------------------------------------------------------ recovery

  async function regenerate() {
    const key = vaultKey();
    if (!key) {
      notify.error("Unlock the vault first.");
      return;
    }

    setBusy(true);
    try {
      const code = generateRecoveryCode();
      const salt = newRecoverySalt();
      const recoveryKey = await recoveryKeyFrom(code, salt);

      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wrappedKey: await wrapVaultKey(recoveryKey, key),
          salt,
          hint: recoveryHint(code),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      setNewCode(code);
      await refresh();
      notify.success("New recovery code generated. The old one is dead.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't regenerate.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      const res = await fetch("/api/recovery/unlock");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);

      const recoveryKey = await recoveryKeyFrom(verifyValue, body.salt);
      await unwrapVaultKey(recoveryKey, body.wrappedKey).catch(() => {
        throw new Error("That code doesn't match the one on file.");
      });

      await fetch("/api/recovery", { method: "PUT" });
      notify.success("That's the right code — you're covered.");
      setVerifying(false);
      setVerifyValue("");
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "That didn't match.");
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------- device

  async function enrolThisDevice() {
    const key = vaultKey();
    if (!key) {
      notify.error("Unlock the vault first.");
      return;
    }

    setBusy(true);
    try {
      if (!(await touchIdAvailable())) {
        throw new Error("This browser has no built-in authenticator.");
      }
      const options = await fetch("/api/webauthn/register").then((r) => r.json());
      const enrolment = await enrolDevice(options);
      const transfer = await generateTransferKeypair();

      const res = await fetch("/api/webauthn/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          response: enrolment.response,
          prfSalt: enrolment.prfSalt,
          usesPrf: enrolment.usesPrf,
          wrappedVaultKey: await wrapVaultKey(enrolment.deviceKey, key),
          transferPublicKey: JSON.stringify(transfer.publicJwk),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      notify.success("Touch ID enrolled on this device");
      await Promise.all([loadDevices(), refresh()]);
    } catch (error) {
      notify.error(describeWebAuthnError(error));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(device: Device) {
    const res = await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
    if (res.ok) {
      notify.success(`${device.name} removed`);
      await Promise.all([loadDevices(), refresh()]);
    } else {
      notify.error((await res.json()).error);
    }
  }

  const thisDevice = devices.find((d) => d.isThisDevice);

  return (
    <>
      <PageHead title="Sign-in & recovery" crumb="Settings › Sign-in & recovery" />

      <RowCard>
        <Row
          title="Touch ID on this device"
          body={
            thisDevice?.enrolled
              ? `${thisDevice.name} · ${thisDevice.browser} · enrolled ${new Date(thisDevice.enrolledAt).toLocaleDateString()}${thisDevice.usesPrf ? "" : " · using a device secret (this browser has no PRF support)"}`
              : "Not set up on this browser yet."
          }
          control={
            thisDevice?.enrolled ? (
              <Toggle
                checked
                label="Touch ID"
                onChange={() =>
                  confirm(
                    {
                      kind: "security",
                      title: "Turn off Touch ID here?",
                      body: "This device's vault key is destroyed. You'll need a magic link plus another device or your recovery code to come back.",
                      confirmLabel: "Turn off",
                    },
                    () => revoke(thisDevice),
                  )
                }
              />
            ) : (
              <Button size="sm" variant="primary" loading={busy} onClick={enrolThisDevice}>
                Set up
              </Button>
            )
          }
        />
        <Row
          title="Re-verify by email"
          body="Touch ID sessions ask for a fresh magic link periodically"
          control={
            <Select
              label="Re-verify"
              value={String(settings.reverifyDays)}
              onChange={(v) =>
                void saveSettings({ vault: { reverifyDays: Number(v) } })
              }
              options={[
                { value: "7", label: "Every 7 days" },
                { value: "30", label: "Every 30 days" },
                { value: "90", label: "Every 90 days" },
              ]}
            />
          }
        />
        <Row
          title="Auto-lock"
          body="Lock the vault after inactivity"
          control={
            <Select
              label="Auto-lock"
              value={String(settings.autoLockSeconds)}
              onChange={(v) =>
                void saveSettings({ vault: { autoLockSeconds: Number(v) } })
              }
              options={[
                { value: "60", label: "1 minute" },
                { value: "300", label: "5 minutes" },
                { value: "900", label: "15 minutes" },
                { value: "3600", label: "1 hour" },
                { value: "0", label: "Never" },
              ]}
            />
          }
        />
        <Row
          title="Lock when the window loses focus"
          body="Recommended on shared machines"
          last
          control={
            <Toggle
              checked={settings.lockOnBlur}
              label="Lock on blur"
              onChange={(v) => void saveSettings({ vault: { lockOnBlur: v } })}
            />
          }
        />
      </RowCard>

      {/* --------------------------------------------------- recovery code */}

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ font: "700 15px var(--font-sans)" }}>Recovery code</span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 9px",
              borderRadius: 99,
              background: "var(--line-06)",
              font: "600 11px var(--font-sans)",
              color: "var(--text)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: boot?.user.recoverySavedAt ? "var(--ink)" : "var(--accent)",
              }}
            />
            {boot?.user.recoverySavedAt
              ? `Saved ${new Date(boot.user.recoverySavedAt).toLocaleDateString()}`
              : hint
                ? "Not confirmed saved"
                : "Not created yet"}
          </span>
        </div>

        <div className={s.rowBody}>
          Your only way in if every device is lost. We don&apos;t keep a copy.
          Regenerating invalidates the old code.
        </div>

        {newCode ? (
          <>
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 14,
                background: "var(--surface)",
                border: "1px dashed var(--accent)",
                font: "500 20px/1.5 var(--font-mono)",
                letterSpacing: "0.06em",
              }}
            >
              {newCode.split(/\s+/).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                onClick={() =>
                  downloadBlob(
                    recoveryKitPdf({
                      code: newCode,
                      email: boot?.user.email ?? "",
                      createdAt: new Date(),
                    }),
                    "keys-recovery-kit.pdf",
                  )
                }
              >
                Download PDF
              </Button>
              <Button onClick={() => window.print()}>Print</Button>
              <Button onClick={() => copy(newCode, "Recovery code copied")}>Copy</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await fetch("/api/recovery", { method: "PUT" });
                  setNewCode(null);
                  await refresh();
                }}
              >
                I&apos;ve saved it
              </Button>
            </div>
          </>
        ) : (
          <div className={s.masked}>
            {boot?.user.hasRecoveryKit
              ? "••••-••••-••••  ••••-••••-••••"
              : "No code on file"}
          </div>
        )}

        {verifying ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Field
                mono
                label="Type your recovery code"
                value={verifyValue}
                onChange={(e) => setVerifyValue(e.target.value)}
                placeholder="XXXX-XXXX-XXXX  XXXX-XXXX-XXXX"
              />
            </div>
            <Button
              variant="primary"
              loading={busy}
              disabled={normalizeRecoveryCode(verifyValue).length !== 24}
              onClick={verify}
            >
              Check
            </Button>
            <Button variant="ghost" onClick={() => setVerifying(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              disabled={!boot?.user.hasRecoveryKit}
              onClick={() => setVerifying(true)}
            >
              Verify I have it
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                confirm(
                  {
                    kind: "warning",
                    title: "Regenerate your recovery code?",
                    body: "The current code stops working immediately. Any printed copy becomes useless.",
                    note: "You'll be shown the new code once. Save it before closing.",
                    noteTone: "warn",
                    confirmTone: "primary",
                    confirmLabel: "Regenerate",
                  },
                  regenerate,
                )
              }
            >
              Regenerate…
            </Button>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------- devices */}

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ font: "700 15px var(--font-sans)" }}>
            Devices that can approve
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              fetch("/api/auth/signout", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mode: "keep", everywhere: true }),
              }).then(() => (window.location.href = "/signin"))
            }
          >
            Sign out everywhere
          </Button>
        </div>

        <div>
          {devices.map((device, i) => (
            <div
              key={device.id}
              className={s.deviceRow}
              data-last={i === devices.length - 1 || undefined}
            >
              <span
                className={s.deviceDot}
                style={{
                  background: device.isThisDevice
                    ? "var(--accent)"
                    : device.canApprove
                      ? "var(--ink)"
                      : "var(--hairline-strong)",
                }}
              />
              <div className={s.deviceText}>
                <span className={s.deviceName}>
                  {device.name} · {device.browser}
                </span>
                <span className={s.deviceMeta}>
                  {device.isThisDevice
                    ? "This device"
                    : `Last seen ${relativeDate(device.lastSeenAt).toLowerCase()}`}
                  {device.enrolled ? " · Touch ID" : " · no Touch ID"}
                  {device.undoUntil &&
                    new Date(device.undoUntil) > new Date() &&
                    ` · added ${relativeDate(device.enrolledAt).toLowerCase()}, can be undone`}
                </span>
              </div>

              {!device.isThisDevice && (
                <button
                  type="button"
                  className={s.deviceAction}
                  data-accent={
                    (device.undoUntil && new Date(device.undoUntil) > new Date()) ||
                    undefined
                  }
                  onClick={() =>
                    confirm(
                      {
                        kind: "security",
                        title: `Remove ${device.name} from your vault?`,
                        body: "The device is signed out and its vault key is destroyed. It can no longer approve new devices.",
                        item: {
                          name: `${device.name} · ${device.browser}`,
                          mono: device.name.slice(0, 2),
                          sub: `Last seen ${relativeDate(device.lastSeenAt).toLowerCase()}`,
                        },
                        note: "If this is your only other device, keep your recovery code handy.",
                        noteTone: "info",
                        confirmLabel: "Remove device",
                      },
                      async () => {
                        await revoke(device);
                      },
                    )
                  }
                >
                  {device.undoUntil && new Date(device.undoUntil) > new Date()
                    ? "Undo"
                    : "Revoke"}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className={s.tip}>
          Tip: keep at least two devices enrolled so you rarely need the code.
        </div>
      </Card>

      {dialog}
    </>
  );
}
