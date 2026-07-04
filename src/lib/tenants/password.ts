import { randomInt } from "node:crypto";

/**
 * Cryptographically strong password generator for provisioned tenant admins.
 * Uses node:crypto randomInt (NOT Math.random). Guarantees at least one
 * character from each class and avoids visually ambiguous characters so the
 * password can be safely read from a welcome email.
 */

// Ambiguous characters removed: O, 0, l, 1, I
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "-!@#$%^&*";
const ALL = LOWERCASE + UPPERCASE + DIGITS + SYMBOLS;

function pick(charset: string): string {
  return charset[randomInt(charset.length)] as string;
}

/**
 * Returns a random password of the requested length (min 16 enforced).
 * Includes ≥1 lowercase, ≥1 uppercase, ≥1 digit, ≥1 symbol, then a Fisher-Yates
 * shuffle so the guaranteed characters are not positionally predictable.
 */
export function generatePassword(length = 20): string {
  const size = Math.max(16, length);

  const chars: string[] = [pick(LOWERCASE), pick(UPPERCASE), pick(DIGITS), pick(SYMBOLS)];

  for (let i = chars.length; i < size; i++) {
    chars.push(pick(ALL));
  }

  // Fisher-Yates shuffle using crypto randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = tmp;
  }

  return chars.join("");
}
