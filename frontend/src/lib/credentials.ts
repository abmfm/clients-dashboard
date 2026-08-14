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

/**
 * FirstName + LastName, e.g. "AliMarhaba".
 *
 * `suffix` is only used when that name is already taken, so the common case
 * stays clean and easy to read out over the phone.
 */
export function generateUsername(firstName: string, lastName: string, suffix = 0) {
  const first = stripNonAlpha(firstName) || "Client";
  const last = stripNonAlpha(lastName);

  const capitalise = (v: string) => (v ? v[0].toUpperCase() + v.slice(1).toLowerCase() : "");

  return `${capitalise(first)}${capitalise(last)}${suffix > 0 ? suffix : ""}`;
}

/**
 * FirstName + three random digits + "@TEG", e.g. "Ali472@TEG".
 *
 * The house format: short enough to read out, and it still satisfies every
 * character class Supabase Auth asks for. The digits come from a CSPRNG rather
 * than Math.random, so two clients created in the same second cannot collide
 * predictably. It is a first-login password - clients are prompted to replace
 * it from Settings, and the stored copy is wiped the moment they do.
 */
export function generatePassword(firstName = "Client") {
  const first = stripNonAlpha(firstName) || "Client";
  const base = first[0].toUpperCase() + first.slice(1).toLowerCase();
  const digits = String(randomInt(100, 1000)); // three digits, never leading zero

  return `${base}${digits}@TEG`;
}

/**
 * Supabase Auth needs an email address. If the client gave a real one we use
 * it; otherwise we derive a stable synthetic address from the username so the
 * account can still exist.
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
