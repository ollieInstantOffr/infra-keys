/**
 * Renders the PWA icon set from the mark defined in the design.
 *
 * Geometry is the 256px source tile: a ring for the key head, a bar for the
 * shaft, one tooth. Everything else is a scale of that, so the 16px favicon
 * and the 512px maskable icon are the same drawing.
 *
 *   npm run icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ACCENT = "#ea580c";
const INK = "#1c1917";
const OUT = path.join(process.cwd(), "public", "icons");

/** The mark alone, on a transparent ground. */
function markSvg(color: string): string {
  return `
    <circle cx="94" cy="120" r="29" stroke="${color}" stroke-width="26" fill="none"/>
    <path d="M130 107h76a8 8 0 0 1 8 8v3a8 8 0 0 1-8 8h-76z" fill="${color}"/>
    <path d="M160 133h22v20a6 6 0 0 1-6 6h-10a6 6 0 0 1-6-6z" fill="${color}"/>`;
}

/**
 * A tile. `inset` shrinks the mark for maskable icons, where the outer 10%
 * on every side can be cropped by the platform's mask.
 */
function tileSvg(options: {
  background: string;
  mark: string;
  radius: number;
  inset?: number;
}): string {
  const { background, mark, radius, inset = 0 } = options;
  const scale = 1 - inset * 2;
  const offset = 256 * inset;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <rect width="256" height="256" rx="${radius}" fill="${background}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    ${markSvg(mark)}
  </g>
</svg>`;
}

const TARGETS = [
  { file: "icon-16.png", size: 16, svg: tileSvg({ background: ACCENT, mark: "#fff", radius: 58 }) },
  { file: "icon-32.png", size: 32, svg: tileSvg({ background: ACCENT, mark: "#fff", radius: 58 }) },
  { file: "icon-192.png", size: 192, svg: tileSvg({ background: ACCENT, mark: "#fff", radius: 58 }) },
  { file: "icon-512.png", size: 512, svg: tileSvg({ background: ACCENT, mark: "#fff", radius: 58 }) },
  {
    file: "apple-touch-icon.png",
    size: 180,
    // iOS applies its own rounding, so the source stays square
    svg: tileSvg({ background: ACCENT, mark: "#fff", radius: 0 }),
  },
  {
    file: "maskable-512.png",
    size: 512,
    svg: tileSvg({ background: ACCENT, mark: "#fff", radius: 0, inset: 0.1 }),
  },
  {
    file: "mono-512.png",
    size: 512,
    svg: tileSvg({ background: INK, mark: "#fff", radius: 58 }),
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  // The scalable favicon — orange mark on transparency, for tabs that want it
  await writeFile(
    path.join(OUT, "favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="58" fill="${ACCENT}"/>
  ${markSvg("#ffffff")}
</svg>\n`,
  );

  for (const target of TARGETS) {
    const buffer = await sharp(Buffer.from(target.svg))
      .resize(target.size, target.size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(path.join(OUT, target.file), buffer);
    console.log(`  ${target.file.padEnd(24)} ${target.size}×${target.size}`);
  }

  console.log(`\nkeys · wrote ${TARGETS.length + 1} icons to public/icons`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
