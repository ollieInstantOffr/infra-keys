/**
 * Password strength, estimated on the device.
 *
 * Not zxcvbn — deliberately. This runs on every keystroke in the generator
 * and on every item during a security scan, so it stays small: character-set
 * entropy, minus penalties for the patterns that actually show up in leaked
 * passwords (dictionary words, keyboard runs, repeats, dates).
 */

const COMMON = new Set([
  "password", "123456", "qwerty", "letmein", "welcome", "admin", "login",
  "abc123", "iloveyou", "monkey", "dragon", "sunshine", "princess", "football",
  "baseball", "master", "shadow", "superman", "trustno1", "passw0rd", "hello",
  "freedom", "whatever", "qazwsx", "starwars", "summer", "winter", "spring",
]);

const KEYBOARD_RUNS = [
  "qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "abcdefghijklmnopqrstuvwxyz",
];

export type Strength = {
  /** 0–100, the number the meters render. */
  score: number;
  label: "Weak" | "Fair" | "Good" | "Strong";
  /** Bits of entropy after penalties. */
  bits: number;
  /** "centuries to crack" / "3 hours to crack" */
  crackTime: string;
  warnings: string[];
};

function charsetSize(pw: string): number {
  let size = 0;
  if (/[a-z]/.test(pw)) size += 26;
  if (/[A-Z]/.test(pw)) size += 26;
  if (/[0-9]/.test(pw)) size += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) size += 33;
  return size || 1;
}

function hasKeyboardRun(lower: string): boolean {
  for (const run of KEYBOARD_RUNS) {
    for (let i = 0; i + 4 <= run.length; i++) {
      const slice = run.slice(i, i + 4);
      if (lower.includes(slice)) return true;
      if (lower.includes([...slice].reverse().join(""))) return true;
    }
  }
  return false;
}

function crackTimeFrom(bits: number): string {
  // 10^11 guesses/second — an offline attack against a fast hash.
  const seconds = Math.pow(2, bits - 1) / 1e11;

  if (seconds < 1) return "instantly";
  if (seconds < 60) return `${Math.round(seconds)} seconds to crack`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes to crack`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours to crack`;
  if (seconds < 2.6e6) return `${Math.round(seconds / 86400)} days to crack`;
  if (seconds < 3.15e7) return `${Math.round(seconds / 2.6e6)} months to crack`;
  const years = seconds / 3.15e7;
  if (years < 100) return `${Math.round(years)} years to crack`;
  return "centuries to crack";
}

/**
 * Collapse runs of the same character — "aaaa" is barely more than "a".
 * Each collapsed run is worth the run length, not the whole string.
 */
function collapseRuns(value: string): { collapsed: string; bonus: number } {
  let collapsed = "";
  let bonus = 0;
  let i = 0;

  while (i < value.length) {
    let run = 1;
    while (value[i + run] === value[i]) run++;
    collapsed += value[i];
    if (run > 1) bonus += Math.log2(run);
    i += run;
  }

  return { collapsed, bonus };
}

export function estimateStrength(password: string): Strength {
  if (!password) {
    return { score: 0, label: "Weak", bits: 0, crackTime: "instantly", warnings: [] };
  }

  const lower = password.toLowerCase();
  const warnings: string[] = [];

  // A dictionary word is worth roughly log2(list size) bits, not
  // length × charset — so score the word and the rest separately rather
  // than subtracting a flat penalty from the naive total. This is the same
  // idea zxcvbn uses, minus the 400KB of frequency tables.
  let matched: string | null = null;
  for (const word of COMMON) {
    if (lower.includes(word) && (!matched || word.length > matched.length)) {
      matched = word;
    }
  }

  const remainder = matched ? lower.replace(matched, "") : password;
  const { collapsed, bonus } = collapseRuns(remainder);

  let bits = collapsed.length * Math.log2(charsetSize(password)) + bonus;

  if (matched) {
    bits += Math.log2(COMMON.size);
    warnings.push(`Contains “${matched}”`);
  }

  if (hasKeyboardRun(lower)) {
    bits -= 12;
    warnings.push("Contains a keyboard run");
  }

  if (/(.)\1{2,}/.test(password)) {
    warnings.push("Repeats a character");
  }
  const half = password.slice(0, Math.floor(password.length / 2));
  if (half.length >= 3 && password === half + half) {
    bits -= 12;
    warnings.push("Repeats itself");
  }

  // a year on the end is the oldest trick there is
  if (/(19|20)\d{2}$/.test(password)) {
    bits -= 6;
    warnings.push("Ends with a year");
  }

  // Length is a hard floor: nothing under 8 characters survives a modern
  // offline attack, whatever its character mix.
  if (password.length < 8) {
    warnings.push("Shorter than 8 characters");
    bits = Math.min(bits, 30);
  }

  bits = Math.max(0, bits);

  // 90 bits is the point where the meter should read full
  const score = Math.round(Math.min(100, (bits / 90) * 100));
  const label: Strength["label"] =
    bits < 36 ? "Weak" : bits < 55 ? "Fair" : bits < 75 ? "Good" : "Strong";

  return { score, label, bits, crackTime: crackTimeFrom(bits), warnings };
}

/** Matches the palette the design uses for meters. */
export function strengthColor(label: Strength["label"] | "Reused"): string {
  switch (label) {
    case "Weak":
    case "Reused":
      return "var(--accent)";
    case "Fair":
    case "Good":
      return "var(--text)";
    case "Strong":
      return "var(--ink)";
  }
}
