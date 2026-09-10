import { env } from "@/lib/env";
import type { EmailContent, EmailFact } from "./render";

const SECURITY = "Security email · cannot be unsubscribed";
const ACCOUNT = "Account email";

export function magicLinkEmail(args: {
  to: string;
  href: string;
  code: string;
  clientLabel: string;
}): EmailContent {
  return {
    to: args.to,
    subject: "Your sign-in link for keys",
    kicker: "Sign in",
    title: "Your sign-in link",
    body: `Tap the button to sign in to keys on ${args.clientLabel}. The link works once and expires in 10 minutes.`,
    code: args.code,
    codeLabel:
      "Opening on another device? Enter this code on the one you started from",
    button: { label: "Sign in to keys", href: args.href },
    foot: "Didn't request this? Ignore it — nothing happens without the link.",
    category: SECURITY,
  };
}

export function welcomeEmail(args: { to: string }): EmailContent {
  return {
    to: args.to,
    subject: "Welcome to keys — one thing to do first",
    kicker: "Welcome",
    title: "Your vault is ready",
    body: "You signed in for the first time. Your passwords are encrypted on your device with a key we never see — which also means we can't reset it for you.",
    body2:
      "Save your recovery code now. It takes a minute and it's the only way back in if you lose all your devices.",
    button: { label: "Save my recovery code", href: `${env.appUrl}/setup/recovery` },
    foot: "Already did it? Then you're done. Add Touch ID from Settings to skip the inbox next time.",
    category: ACCOUNT,
  };
}

export function approvalRequestEmail(args: {
  to: string;
  deviceLabel: string;
  location: string;
  code: string;
}): EmailContent {
  return {
    to: args.to,
    subject: "A device is waiting for your approval",
    kicker: "Action needed",
    title: "A device is waiting for your approval",
    body: `${args.deviceLabel} near ${args.location} signed in as you and is asking for vault access. Open keys on a device you already use and compare the code before approving.`,
    code: args.code,
    codeLabel: "Match code",
    button: { label: "Open keys to approve", href: `${env.appUrl}/vault` },
    foot: "Not you? Do nothing — the request expires in 15 minutes and the device gets no access.",
    category: SECURITY,
  };
}

export function newDeviceEmail(args: {
  to: string;
  facts: EmailFact[];
  approvedFrom: string;
  deviceId: string;
}): EmailContent {
  return {
    to: args.to,
    subject: "New device added to your vault",
    kicker: "Security alert",
    alert: true,
    title: "A new device was added to your vault",
    body: `Approved from your ${args.approvedFrom} just now.`,
    facts: args.facts,
    body2:
      "If this was you, nothing to do. If not, remove it now — for 24 hours it cannot approve other devices.",
    button: {
      label: "This wasn't me — remove device",
      href: `${env.appUrl}/settings/sign-in?revoke=${args.deviceId}`,
      dark: true,
    },
    foot: "Or review all devices in Settings → Devices.",
    category: SECURITY,
  };
}

export function breachAlertEmail(args: {
  to: string;
  itemName: string;
  itemMono: string;
  publishedOn: string;
  itemId: string;
}): EmailContent {
  return {
    to: args.to,
    subject: "1 password appeared in a new breach",
    kicker: "Breach alert",
    alert: true,
    title: "One of your passwords appeared in a new breach",
    body: "We never see your passwords — this email only tells you which item matched, using a partial hash check.",
    item: {
      name: args.itemName,
      mono: args.itemMono,
      sub: `Matched a breach published ${args.publishedOn}`,
    },
    body2: "Change it in keys, then anywhere else you reused it.",
    button: {
      label: "Change this password",
      href: `${env.appUrl}/vault?item=${args.itemId}`,
    },
    foot: "Turn breach emails off in Settings → Security (in-app alerts stay on).",
    category: "Security email",
  };
}

export function accountDeletedEmail(args: { to: string }): EmailContent {
  return {
    to: args.to,
    subject: "Your keys account has been deleted",
    kicker: "Account deleted",
    alert: true,
    title: "Your account and vault are gone",
    body: "Someone signed in, unlocked the vault and confirmed deletion. Every password, note, 2FA secret and device has been erased.",
    body2:
      "There is nothing to cancel and nothing to restore — the vault was encrypted with keys we never held, so we could not recover it even if you asked.",
    button: { label: "Start a new vault", href: `${env.appUrl}/signin`, dark: true },
    foot: "If this wasn't you, your email account is the thing to secure now — it was used to sign in.",
    category: SECURITY,
  };
}

export function eraseNoticeEmail(args: {
  to: string;
  eraseOn: string;
  requestedOn: string;
  token: string;
}): EmailContent {
  return {
    to: args.to,
    subject: "Your vault will be erased in 7 days",
    kicker: "Start over requested",
    alert: true,
    title: "Your vault will be erased in 7 days",
    body: `Someone signed in as you and asked to start over because they have no device or recovery code. On ${args.eraseOn} the encrypted vault is permanently deleted and the account resets.`,
    body2:
      "If you still have a device or your recovery code, cancel this and sign in the normal way. If you didn't request it, cancel and review your email security.",
    button: {
      label: "Cancel — keep my vault",
      href: `${env.appUrl}/recover/cancel?token=${args.token}`,
      dark: true,
    },
    foot: "Doing nothing lets the erase go ahead. We'll remind you on day 3 and day 6.",
    category: SECURITY,
  };
}
