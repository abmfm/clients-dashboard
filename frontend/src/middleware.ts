import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { claimsFromCookies } from "@/lib/supabase/jwt";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATHS = ["/login", "/auth", "/no-profile"];
const SKIP_PREFIXES = ["/_next", "/favicon", "/api/health"];

/** Refresh a little before expiry so a request never races the deadline. */
const REFRESH_WINDOW_SECONDS = 120;

/**
 * Coarse route protection plus token refresh.
 *
 * The expensive part used to be `auth.getUser()`, a network round trip to
 * Supabase Auth on EVERY request - including RSC prefetches. Now the token is
 * decoded locally and that round trip only happens when the token is actually
 * close to expiring, roughly once an hour instead of once a click.
 *
 * This is not a weakening of the security model: every layout re-checks the
 * profile, and Postgres verifies the token's signature under RLS on each query.
 * Middleware only decides which page to show.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const claims = claimsFromCookies(request.cookies.getAll());

  // ---- Fast path: a healthy token, nothing to do but continue -------------
  if (claims && claims.secondsLeft > REFRESH_WINDOW_SECONDS && !isPublic) {
    return NextResponse.next({ request });
  }

  // ---- No session at all, and the page needs one --------------------------
  if (!claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ---- Slow path: refresh the session, or decide where /login should go ----
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // An expired or revoked cookie surfaces here as an error; it simply means no
  // session, so it is handled rather than logged.
  const { data, error: authError } = await supabase.auth.getUser();
  const user = authError ? null : data.user;

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Send an already-signed-in visitor away from the login form - but only if
  // they actually have a profile with a role, otherwise this bounces
  // profile-less accounts between /login and /dashboard forever.
  if (user && pathname === "/login") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role) {
      const url = request.nextUrl.clone();
      url.pathname = profile.role === "admin" ? "/admin/dashboard" : "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
