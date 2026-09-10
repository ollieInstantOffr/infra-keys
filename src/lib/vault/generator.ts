"use client";

/** Password generator — the panel on the right of the "New item" modal. */

export type GeneratorMode = "random" | "passphrase" | "pin";

export type GeneratorOptions = {
  mode: GeneratorMode;
  length: number;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
  /** passphrase only */
  words: number;
  separator: string;
};

export const defaultOptions: GeneratorOptions = {
  mode: "random",
  length: 20,
  uppercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
  words: 4,
  separator: "-",
};

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%&*?-_=+";
const AMBIGUOUS = /[lI1O0]/g;

/** Rejection sampling — `% alphabet.length` would bias the output. */
function pick(alphabet: string): string {
  const max = Math.floor(0xffffffff / alphabet.length) * alphabet.length;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= max);
  return alphabet[n % alphabet.length];
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A small EFF-style list — enough for memorable passphrases without a 200KB import. */
const WORDS = [
  "amber","anchor","apple","arbor","atlas","aurora","basil","beacon","birch","bison",
  "bloom","bramble","breeze","bridge","bronze","canyon","cedar","cinder","citrus","clover",
  "cobalt","comet","copper","coral","cove","crest","cypress","dahlia","dapper","dawn",
  "delta","dune","ember","fable","falcon","fathom","fennel","fjord","flint","forest",
  "fossil","garnet","glacier","granite","grove","harbor","hazel","heron","hollow","indigo",
  "ivory","jasper","jetty","juniper","kettle","lagoon","lantern","larch","lattice","ledger",
  "linen","lumen","maple","marble","meadow","mesa","mint","moss","nectar","nimbus",
  "oasis","onyx","opal","orchard","otter","pebble","pepper","pewter","pine","plume",
  "prairie","quarry","quartz","quill","raven","reef","ridge","river","rosin","rustic",
  "saffron","sage","sandbar","sequoia","shale","silo","slate","sparrow","spruce","stellar",
  "summit","tamarind","thicket","thistle","timber","topaz","trellis","tundra","umber","valley",
  "velvet","vertex","willow","wisp","yarrow","zenith","zephyr","zinnia",
];

export function generate(options: GeneratorOptions): string {
  if (options.mode === "pin") {
    return Array.from({ length: options.length }, () => pick(DIGITS)).join("");
  }

  if (options.mode === "passphrase") {
    const parts = Array.from({ length: options.words }, () => pick2(WORDS));
    if (options.uppercase) {
      for (let i = 0; i < parts.length; i++) {
        parts[i] = parts[i][0].toUpperCase() + parts[i].slice(1);
      }
    }
    if (options.digits) {
      const idx = Number(pick(DIGITS)) % parts.length;
      parts[idx] += pick(DIGITS) + pick(DIGITS);
    }
    return parts.join(options.separator);
  }

  let lower = LOWER;
  let upper = options.uppercase ? UPPER : "";
  let digits = options.digits ? DIGITS : "";
  const symbols = options.symbols ? SYMBOLS : "";

  if (options.avoidAmbiguous) {
    lower = lower.replace(AMBIGUOUS, "");
    upper = upper.replace(AMBIGUOUS, "");
    digits = digits.replace(AMBIGUOUS, "");
  }

  const alphabet = lower + upper + digits + symbols;
  if (!alphabet) return "";

  // guarantee one of each enabled class, then fill and shuffle so the
  // guaranteed characters aren't always at the front
  const required: string[] = [lower, upper, digits, symbols]
    .filter(Boolean)
    .map((set) => pick(set));

  const rest = Array.from(
    { length: Math.max(0, options.length - required.length) },
    () => pick(alphabet),
  );

  return shuffle([...required, ...rest]).slice(0, options.length).join("");
}

function pick2(list: string[]): string {
  const max = Math.floor(0xffffffff / list.length) * list.length;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= max);
  return list[n % list.length];
}
