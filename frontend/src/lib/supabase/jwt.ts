/**
 * Reads the Supabase session straight out of the cookie and decodes the access
 * token locally - no network call.
 *
 * Why this is safe: the decoded `sub` is only ever used to shape a query that
 * still runs under Row Level Security. Postgres verifies the token's signature
 * on every request, so a forged or tampered token simply returns no rows and
 * the caller is treated as signed out. We are reading a hint, not granting
 * trust.
 *
 * The payoff: `auth.getUser()` is a round trip to Supabase Auth on every page
 * render. Doing it in middleware and again in the layout cost two full network
 * trips before any data was even requested.
 *
 * Deliberately dependency-free (atob / TextDecoder, no Buffer) because this
 * runs in the Edge middleware runtime as well as in Node.
 */

export interface SessionClaims {
  sub: string;
  exp: number;
  /** Seconds until the access token expires. Negative once it has expired. */
  secondsLeft: number;
}

type CookieLike = { name: string; value: string };

function base64ToUtf8(input: string): string {
  const normalised = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new TextDecoder().decode(bytes);
}

/** Re-assembles the (possibly chunked) auth cookie and decodes the JWT. */
export function claimsFromCookies(cookies: CookieLike[]): SessionClaims | null {
  try {
    const parts = cookies
      .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (parts.length === 0) return null;

    let raw = parts.map((c) => c.value).join("");
    if (raw.startsWith("base64-")) raw = base64ToUtf8(raw.slice("base64-".length));

    const session = JSON.parse(raw) as { access_token?: string };
    const token = session.access_token;
    if (!token) return null;

    const segment = token.split(".")[1];
    if (!segment) return null;

    const payload = JSON.parse(base64ToUtf8(segment)) as { sub?: string; exp?: number };
    if (!payload.sub || !payload.exp) return null;

    return {
      sub: payload.sub,
      exp: payload.exp,
      secondsLeft: payload.exp - Math.floor(Date.now() / 1000),
    };
  } catch {
    // Malformed or absent - callers fall back to the network path.
    return null;
  }
}
