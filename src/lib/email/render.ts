/**
 * Transactional email markup. Mirrors section 16 of the design: 600px,
 * white card on off-white, exactly one button, security mail is not
 * unsubscribable. Table-based and inline-styled so it survives Outlook;
 * Manrope is requested but every stack falls back to system sans.
 */

const ACCENT = "#ea580c";
const INK = "#1c1917";
const GREY = "#a8a29e";
const BODY = "#57534e";
const FONT =
  "Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

export type EmailFact = { k: string; v: string };

export type EmailContent = {
  subject: string;
  kicker: string;
  alert?: boolean;
  title: string;
  body: string;
  body2?: string;
  code?: string;
  codeLabel?: string;
  facts?: EmailFact[];
  item?: { name: string; sub: string; mono: string };
  button: { label: string; href: string; dark?: boolean };
  foot: string;
  category: string;
  to: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const logo = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="padding-right:8px">
    <div style="width:24px;height:24px;border-radius:6px;background:${ACCENT};text-align:center;line-height:24px;color:#fff;font:800 13px ${FONT}">k</div>
  </td>
  <td style="font:800 16px ${FONT};letter-spacing:-.02em;color:${INK}">keys</td>
</tr></table>`;

export function renderEmail(c: EmailContent): string {
  const kickerColor = c.alert ? ACCENT : GREY;
  const btnBg = c.button.dark ? INK : ACCENT;

  const codeBlock = c.code
    ? `<tr><td style="padding-bottom:18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf9f7;border-radius:12px">
          <tr><td align="center" style="padding:18px">
            ${c.codeLabel ? `<div style="font:600 11px ${FONT};color:${GREY};letter-spacing:.06em;text-transform:uppercase;padding-bottom:4px">${esc(c.codeLabel)}</div>` : ""}
            <div style="font:500 30px ${MONO};letter-spacing:.2em;color:${INK}">${esc(c.code)}</div>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const factsBlock = c.facts?.length
    ? `<tr><td style="padding-bottom:18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf9f7;border-radius:12px">
          <tr><td style="padding:16px">
            ${c.facts
              .map(
                (f) =>
                  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-bottom:8px"><tr>
                    <td style="font:500 13px ${FONT};color:${GREY}">${esc(f.k)}</td>
                    <td align="right" style="font:600 13px ${FONT};color:#44403c">${esc(f.v)}</td>
                  </tr></table>`,
              )
              .join("")}
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const itemBlock = c.item
    ? `<tr><td style="padding-bottom:18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf9f7;border-radius:12px">
          <tr><td style="padding:14px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="padding-right:12px">
                <div style="width:36px;height:36px;border-radius:10px;background:${INK};color:#fff;text-align:center;line-height:36px;font:700 14px ${FONT}">${esc(c.item.mono)}</div>
              </td>
              <td>
                <div style="font:700 14px ${FONT};color:${INK}">${esc(c.item.name)}</div>
                <div style="font:500 12px ${FONT};color:#78716c;padding-top:2px">${esc(c.item.sub)}</div>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f1ee">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.body.slice(0, 120))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f1ee">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

    <tr><td style="padding-bottom:16px">${logo}</td></tr>

    <tr><td style="background:#ffffff;border-radius:16px;border:1px solid rgba(28,25,23,.06);padding:36px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font:600 11px ${FONT};color:${kickerColor};letter-spacing:.08em;text-transform:uppercase;padding-bottom:18px">${c.alert ? "&#9679; " : ""}${esc(c.kicker)}</td></tr>
        <tr><td style="font:800 26px/1.15 ${FONT};letter-spacing:-.02em;color:${INK};padding-bottom:18px">${esc(c.title)}</td></tr>
        <tr><td style="font:400 15px/1.6 ${FONT};color:${BODY};padding-bottom:18px">${esc(c.body)}</td></tr>
        ${codeBlock}
        ${factsBlock}
        ${itemBlock}
        ${c.body2 ? `<tr><td style="font:400 15px/1.6 ${FONT};color:${BODY};padding-bottom:18px">${esc(c.body2)}</td></tr>` : ""}
        <tr><td style="padding-bottom:18px">
          <a href="${esc(c.button.href)}" style="display:block;text-align:center;height:48px;line-height:48px;border-radius:12px;background:${btnBg};color:#ffffff;font:700 15px ${FONT};text-decoration:none">${esc(c.button.label)}</a>
        </td></tr>
        <tr><td style="font:400 13px/1.6 ${FONT};color:${GREY}">${esc(c.foot)}</td></tr>
      </table>
    </td></tr>

    <tr><td align="center" style="font:400 12px/1.6 ${FONT};color:${GREY};padding-top:16px">
      keys &middot; Sent to ${esc(c.to)} &middot; ${esc(c.category)}
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;
}

/** Plain-text alternative — spam filters and screen readers both want it. */
export function renderText(c: EmailContent): string {
  const lines = [c.title, "", c.body];
  if (c.code) lines.push("", `${c.codeLabel ?? "Code"}: ${c.code}`);
  if (c.facts?.length) {
    lines.push("");
    for (const f of c.facts) lines.push(`${f.k}: ${f.v}`);
  }
  if (c.item) lines.push("", `${c.item.name} — ${c.item.sub}`);
  if (c.body2) lines.push("", c.body2);
  lines.push("", `${c.button.label}: ${c.button.href}`, "", c.foot, "", `keys · ${c.category}`);
  return lines.join("\n");
}
