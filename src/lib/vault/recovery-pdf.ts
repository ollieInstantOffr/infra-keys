"use client";

/**
 * A one-page recovery kit as a real PDF, written by hand.
 *
 * A PDF this simple is a few hundred bytes of text — pulling in a 300KB
 * generator for it would be silly, and this keeps the recovery code out of
 * yet another third-party dependency's reach.
 */

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function recoveryKitPdf(args: {
  code: string;
  email: string;
  createdAt: Date;
}): Blob {
  const created = args.createdAt.toDateString();
  const [line1, line2] = args.code.split(/\s+/);

  const content = `BT
/F2 26 Tf 1 1 1 rg 0 0 0 rg
72 720 Td
(keys - recovery kit) Tj
ET
BT /F1 11 Tf 0.35 0.33 0.31 rg 72 696 Td
(Account: ${escapeText(args.email)}) Tj
0 -16 Td
(Created: ${escapeText(created)}) Tj
ET
BT /F1 12 Tf 0 0 0 rg 72 640 Td
(This code is the only way back into your vault if you lose every) Tj
0 -16 Td
(device. It is not stored by keys in a form anyone can read - not) Tj
0 -16 Td
(even us. Print this page and keep it somewhere offline.) Tj
ET
0.92 0.35 0.05 RG 2 w
72 500 468 76 re S
BT /F2 22 Tf 0 0 0 rg 108 546 Td
(${escapeText(line1 ?? "")}) Tj
0 -30 Td
(${escapeText(line2 ?? "")}) Tj
ET
BT /F1 10 Tf 0.51 0.49 0.47 rg 72 460 Td
(Anyone holding this code can decrypt your vault after signing in) Tj
0 -14 Td
(to your email. Treat it like a spare key to your house.) Tj
0 -28 Td
(Regenerating the code in Settings makes this copy useless.) Tj
ET`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
