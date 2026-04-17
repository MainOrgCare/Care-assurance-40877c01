const PII_TOKEN_PATTERN = /^\{\{PII_[a-z0-9]+_[A-Z_]+_\d+\}\}$/i;

function toDottedInitials(letters: string[]): string {
  return letters
    .filter(Boolean)
    .slice(0, 3)
    .map((letter) => `${letter.toUpperCase()}.`)
    .join("");
}

export function normalizeServiceUserInitials(value?: string | null): string {
  if (typeof value !== "string") return "N.N.";
  const trimmed = value.trim();
  if (!trimmed) return "N.N.";

  // Tokenized values should never surface in the UI or extension payloads.
  if (PII_TOKEN_PATTERN.test(trimmed)) {
    return "N.N.";
  }

  const compact = trimmed.toUpperCase().replace(/\s+/g, "");

  // Already formatted initials: F.O. / F.O / F.O.N.
  if (/^[A-Z](?:\.[A-Z]){1,2}\.?$/.test(compact)) {
    const letters = compact.match(/[A-Z]/g) || [];
    return toDottedInitials(letters) || "N.N.";
  }

  // Compact initials: FO / FON
  if (/^[A-Z]{2,3}$/.test(compact)) {
    return toDottedInitials(compact.split(""));
  }

  // Single initial fallback
  if (/^[A-Z]\.?$/.test(compact)) {
    return `${compact[0]}.N.`;
  }

  const words = trimmed
    .replace(/[^A-Za-z'\- ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    const first = words[0]?.[0]?.toUpperCase();
    const last = words[words.length - 1]?.[0]?.toUpperCase();
    if (first && last) {
      return `${first}.${last}.`;
    }
  }

  if (words.length === 1) {
    const letters = words[0].toUpperCase().match(/[A-Z]/g) || [];
    if (letters.length >= 2 && letters.length <= 3) {
      return toDottedInitials(letters);
    }
    if (letters.length >= 1) {
      return `${letters[0]}.N.`;
    }
  }

  const looseLetters = trimmed.toUpperCase().match(/[A-Z]/g) || [];
  if (looseLetters.length >= 2) {
    return `${looseLetters[0]}.${looseLetters[1]}.`;
  }
  if (looseLetters.length === 1) {
    return `${looseLetters[0]}.N.`;
  }

  return "N.N.";
}