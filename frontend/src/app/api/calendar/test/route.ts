import { NextResponse } from "next/server";

import { explainGoogleError } from "@/lib/google/errors";
import { accessTokenFromRefresh } from "@/lib/google/oauth";
import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proves the stored connection can really reach the chosen calendar, and says
 * precisely what is wrong when it cannot.
 */
export async function POST() {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("calendar_accounts")
    .select("refresh_token_enc, calendar_id, scopes")
    .eq("profile_id", guard.userId)
    .maybeSingle();

  if (!account) return NextResponse.json({ ok: false, reason: "No calendar connected." });

  const refreshToken = decryptSecret(account.refresh_token_enc);
  if (!refreshToken) {
    return NextResponse.json({
      ok: false,
      reason: "The stored token could not be decrypted. Reconnect the calendar.",
    });
  }

  try {
    const token = await accessTokenFromRefresh(refreshToken);
    const calendarId = account.calendar_id || "primary";

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events?maxResults=1`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    );

    if (response.ok) {
      await admin
        .from("calendar_accounts")
        .update({ last_error: null })
        .eq("profile_id", guard.userId);

      return NextResponse.json({ ok: true, calendarId, scopes: account.scopes });
    }

    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    const message = data.error?.message ?? `Google returned ${response.status}.`;

    const reason = explainGoogleError(message, response.status);

    await admin
      .from("calendar_accounts")
      .update({ last_error: reason })
      .eq("profile_id", guard.userId);

    return NextResponse.json({ ok: false, reason, scopes: account.scopes });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      reason: err instanceof Error ? err.message : "The test could not run.",
    });
  }
}
