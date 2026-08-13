import { NextResponse } from "next/server";

import { encryptSecret } from "@/lib/crypto";
import { emailFromIdToken, exchangeCode, hasCalendarScope } from "@/lib/google/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/admin/settings?${new URLSearchParams(params).toString()}`, origin)
    );

  const guard = await requireAdminApi();
  if (guard.error) return back({ calendar_error: "Sign in as an admin first." });

  const denied = url.searchParams.get("error");
  if (denied) return back({ calendar_error: denied });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("google_oauth_state="))
    ?.split("=")[1];

  if (!code) return back({ calendar_error: "Google did not return an authorisation code." });
  if (!state || state !== expected) {
    return back({ calendar_error: "Security check failed. Please try connecting again." });
  }

  try {
    const tokens = await exchangeCode(code, origin);

    if (!tokens.refresh_token) {
      return back({
        calendar_error:
          "Google did not return a refresh token. Remove Twelve East at myaccount.google.com/permissions and connect again.",
      });
    }

    // Refuse to store a token that cannot actually write events - otherwise the
    // connection looks healthy and every sync fails with a cryptic scope error.
    if (!hasCalendarScope(tokens.scope)) {
      return back({
        calendar_scope_error: "1",
        calendar_granted: tokens.scope ?? "none",
      });
    }

    const admin = createAdminClient();

    await admin.from("calendar_accounts").upsert(
      {
        profile_id: guard.userId,
        provider: "google",
        google_email: emailFromIdToken(tokens.id_token),
        refresh_token_enc: encryptSecret(tokens.refresh_token),
        scopes: tokens.scope ?? null,
        sync_enabled: true,
        last_error: null,
      },
      { onConflict: "profile_id" }
    );

    const response = back({ calendar_connected: "1" });
    response.cookies.delete("google_oauth_state");
    return response;
  } catch (err) {
    return back({
      calendar_error: err instanceof Error ? err.message : "Could not connect the calendar.",
    });
  }
}
