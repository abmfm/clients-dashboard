import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Changes which calendar events land in, and turns sync on or off. */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  let payload: { calendar_id?: string; sync_enabled?: boolean };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const update: Record<string, unknown> = { last_error: null };

  if (typeof payload.calendar_id === "string") {
    update.calendar_id = payload.calendar_id.trim() || "primary";
  }
  if (typeof payload.sync_enabled === "boolean") {
    update.sync_enabled = payload.sync_enabled;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("calendar_accounts")
    .update(update)
    .eq("profile_id", guard.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved: true });
}
