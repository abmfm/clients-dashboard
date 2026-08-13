/**
 * Credential generation for admin-created clients.
 *
 * Username format:  FirstName + first letter of LastName + random digits + special char
 *                   e.g.  "Sarah" + "M" + "482" + "#"  ->  SarahM482#
 *
 * Passwords are generated with a CSPRNG, contain all four character classes and
 * are shuffled so class positions are not predictable.
 */

import { randomInt } from "crypto";

const SPECIALS = ["!", "@", "#", "$", "%", "&", "*"] as const;

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion when read aloud
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";

function pick(pool: string) {
  return pool[randomInt(0, pool.length)];
}

function stripNonAlpha(value: string) {
  return value.normalize("NFKD").replace(/[^A-Za-z]/g, "");
}

/** Capitalise and clean a raw name input. */
export function normalizeName(raw: string) {
  const clean = raw.trim().replace(/\s+/g, " ");
  return clean
    .split(" ")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join(" ");
}

/** FirstName + LastInitial + 2-4 digits + one special character. */
export function generateUsername(firstName: string, lastName: string) {
  const first = stripNonAlpha(firstName) || "Client";
  const base = first[0].toUpperCase() + first.slice(1).toLowerCase();
  const initial = (stripNonAlpha(lastName)[0] || "X").toUpperCase();
  const digits = String(randomInt(100, 1000)); // always 3 digits, never leading zero
  const special = SPECIALS[randomInt(0, SPECIALS.length)];
  return `${base}${initial}${digits}${special}`;
}

/** Cryptographically random password, 14 chars, all four character classes. */
export function generatePassword(length = 14) {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS), pick(SYMBOLS)];
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  const rest = Array.from({ length: Math.max(length - required.length, 0) }, () => pick(all));
  const chars = [...required, ...rest];

  // Fisher-Yates with a CSPRNG
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Clients sign in with a username, but Supabase Auth needs an email address,
 * so we derive a stable synthetic one. Special characters are stripped.
 */
export function loginEmailFor(username: string, domain: string) {
  const local = username.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return `${local}@${domain}`;
}

/** Very small strength meter used by the change-password form. */
export function passwordScore(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}
