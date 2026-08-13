import "server-only";

/**
 * Minimal Google OAuth 2.0 helper - plain fetch, no SDK.
 *
 * Only one account is ever connected (the studio's own), so the flow is the
 * standard web-server one: consent once with `access_type=offline`, keep the
 * refresh token, and mint short-lived access tokens from it as needed.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Write access to events only - not the whole calendar, not contacts. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing. See README section 9."
    );
  }
  return { clientId, clientSecret };
}

export function redirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/calendar/callback`;
}

export function buildConsentUrl(origin: string, state: string) {
  const { clientId } = googleConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: `${CALENDAR_SCOPE} ${EMAIL_SCOPE}`,
    // offline + consent guarantees a refresh token even on a repeat connect.
    access_type: "offline",
    // Always re-ask, so a previous grant with fewer permissions is replaced
    // rather than silently reused.
    prompt: "consent",
    state,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  /** Space-separated list of what Google ACTUALLY granted. */
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Google will happily return a token carrying fewer scopes than were asked for
 * - if the user unticks a permission, or the scope is not registered on the
 * consent screen. Checking here turns a confusing failure at the first sync
 * into a clear message at connect time.
 */
export function hasCalendarScope(scope?: string) {
  if (!scope) return false;
  const granted = scope.split(/\s+/);
  return granted.includes(CALENDAR_SCOPE) ||
    granted.includes("https://www.googleapis.com/auth/calendar");
}

export async function exchangeCode(code: string, origin: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleConfig();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });

  const data = (await response.json()) as TokenResponse;
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Token exchange failed.");
  }
  return data;
}

export async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = googleConfig();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    // Never let a slow token call hold up the admin's click.
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json()) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Could not refresh the Google access token."
    );
  }
  return data.access_token;
}

/** Reads the account's email out of the id_token without an extra API call. */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
    const json = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))
    ) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}
