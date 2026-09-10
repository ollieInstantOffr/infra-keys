import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { renderEmail, renderText, type EmailContent } from "./render";

let client: Resend | null = null;
function resend(): Resend | null {
  if (!env.resendApiKey) return null;
  client ??= new Resend(env.resendApiKey);
  return client;
}

export async function sendEmail(content: EmailContent): Promise<void> {
  const api = resend();

  // In development without a key, print the link instead of failing — the
  // whole sign-in flow stays usable offline.
  if (!api) {
    console.warn(
      `\n── keys · email not sent (RESEND_API_KEY unset) ─────────────\n` +
        `To:      ${content.to}\n` +
        `Subject: ${content.subject}\n` +
        `Link:    ${content.button.href}\n` +
        (content.code ? `Code:    ${content.code}\n` : "") +
        `────────────────────────────────────────────────────────────\n`,
    );
    return;
  }

  const { error } = await api.emails.send({
    from: env.emailFrom,
    to: content.to,
    subject: content.subject,
    html: renderEmail(content),
    text: renderText(content),
    headers: {
      // security mail must not carry a one-click unsubscribe
      ...(content.category.includes("cannot be unsubscribed")
        ? {}
        : { "List-Unsubscribe": `<${env.appUrl}/settings/notifications>` }),
    },
  });

  if (error) throw new Error(`Resend refused the message: ${error.message}`);
}
