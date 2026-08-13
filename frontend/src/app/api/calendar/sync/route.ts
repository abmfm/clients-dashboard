import { NextResponse } from "next/server";

import { removeEvent, syncSession } from "@/lib/calendar/sync";
import { requireAdminApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called after a session is created, rescheduled or deleted.
 *
 * Always returns 200: calendar sync is a side effect, and a failure here must
 * never make the admin think their actual change did not save.
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  let payload: { session_id?: string; delete_event_id?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ synced: false, reason: "Invalid request body." });
  }

  if (payload.delete_event_id) {
    return NextResponse.json(await removeEvent(guard.userId, payload.delete_event_id));
  }

  if (payload.session_id) {
    return NextResponse.json(await syncSession(guard.userId, payload.session_id));
  }

  return NextResponse.json({ synced: false, reason: "Nothing to sync." });
}
