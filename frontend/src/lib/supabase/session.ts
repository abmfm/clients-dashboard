import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";

import { claimsFromCookies } from "./jwt";
import { createClient } from "./server";
import { perfNote, timed } from "@/lib/perf";
import type { Profile } from "@/lib/types";

/**
 * Everything here is memoised per request with React's cache(), so a layout and
 * the page it wraps share a single lookup.
 */

/**
 * Who does this request belong to, without a round trip to Supabase Auth.
 *
 * Preferred path is `getClaims()`, which verifies the token's signature locally
 * against the project's public keys (fetched once and cached). That is a real
 * cryptographic check, not just a decode.
 *
 * If the project still signs with the legacy shared secret, `getClaims()` falls
 * back to a network verification, so we try the plain cookie decode first to
 * decide whether the token is even worth checking - an expired one always needs
 * the refresh path anyway.
 */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const claims = claimsFromCookies(store.getAll());

  if (claims && claims.secondsLeft > 0) {
    const supabase = await createClient();

    try {
      const { data } = await supabase.auth.getClaims();
      const sub = data?.claims?.sub;

      if (sub) {
        perfNote(`auth: verified locally, no network (expires in ${claims.secondsLeft}s)`);
        return sub;
      }
    } catch {
      // Fall through to the decoded value below.
    }

    perfNote(`auth: read from cookie (expires in ${claims.secondsLeft}s)`);
    return claims.sub;
  }

  // Missing or expired: pay for the round trip and let the client refresh it.
  perfNote(claims ? "auth: token expired, calling Supabase" : "auth: NO COOKIE FOUND, calling Supabase");

  const supabase = await createClient();
  const user = await timed("auth.getUser (network)", async () => {
    const { data } = await supabase.auth.getUser();
    return data.user;
  });

  return user?.id ?? null;
});

/** Full auth-server check. Only for places that need the verified user object. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const supabase = await createClient();

  // Runs under RLS: a token that does not genuinely belong to this id returns
  // nothing, which we treat exactly like being signed out.
  const data = await timed("profiles select", async () => {
    const result = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    return result.data;
  });

  return (data as Profile) ?? null;
});

/**
 * Guards.
 *
 * A signed-in user with no readable profile is sent to /no-profile, never back
 * to /login. Sending them to /login created a loop: middleware saw a valid
 * session on /login and redirected to the dashboard, the dashboard could not
 * read the profile and redirected to /login, forever.
 */
export async function requireClient(): Promise<Profile> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const profile = await getProfile();
  if (!profile) redirect("/no-profile");
  if (profile.role === "admin") redirect("/admin/dashboard");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const profile = await getProfile();
  if (!profile) redirect("/no-profile");
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
