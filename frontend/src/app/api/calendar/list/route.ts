import { NextResponse } from "next/server";

import { decryptSecret } from "@/lib/crypto";
import { listCalendars } from "@/lib/google/freebusy";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The calendars on the connected account, so they can be picked by name. */
export async function GET() {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("calendar_accounts")
    .select("refresh_token_enc")
    .eq("profile_id", guard.userId)
    .maybeSingle();

  if (!account) return NextResponse.json({ calendars: [], error: "No calendar connected." });

  const refreshToken = decryptSecret(account.refresh_token_enc);
  if (!refreshToken) {
    return NextResponse.json({ calendars: [], error: "Reconnect the calendar." });
  }

  try {
    return NextResponse.json({ calendars: await listCalendars(refreshToken) });
  } catch (err) {
    return NextResponse.json({
      calendars: [],
      error: err instanceof Error ? err.message : "Could not list calendars.",
    });
  }
}
