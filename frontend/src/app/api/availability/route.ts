import { NextResponse } from "next/server";

import { buildDaySlots, isWorkingDay, toDateISO, type StudioSettings } from "@/lib/booking/slots";
import { decryptSecret } from "@/lib/crypto";
import { fetchBusy, type BusyPeriod } from "@/lib/google/freebusy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What can this client book?
 *
 *   GET /api/availability?month=YYYY-MM   -> a per-day summary for the calendar
 *   GET /api/availability?date=YYYY-MM-DD -> the slots for one day
 *
 * Availability is the union of two sources: the photographer's Google Calendar
 * (via freeBusy, which returns only start/end pairs - never the titles of their
 * other appointments) and sessions already booked in this system, so a slot
 * cannot be taken twice even before it reaches Google.
 *
 * Runs with the service role because the calendar token belongs to the admin,
 * not to the client asking. Nothing about the admin's calendar is returned -
 * only whether each slot is free.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const date = url.searchParams.get("date");

  const admin = createAdminClient();

  const { data: settingsRow } = await admin
    .from("studio_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const settings = (settingsRow as StudioSettings) ?? {
    working_days: [1, 2, 3, 4, 5, 6, 7],
    day_start: "09:00",
    day_end: "21:00",
    slot_hours: 3,
    max_days_ahead: 90,
    min_hours_notice: 24,
    extra_session_price: 230,
    currency: "KD",
    timezone: "Asia/Kuwait",
  };

  // ---- the window we need to inspect ---------------------------------------
  let from: Date;
  let to: Date;

  if (date) {
    const [y, m, d] = date.split("-").map(Number);
    from = new Date(Date.UTC(y, m - 1, d - 1));
    to = new Date(Date.UTC(y, m - 1, d + 2));
  } else if (month) {
    const [y, m] = month.split("-").map(Number);
    from = new Date(Date.UTC(y, m - 1, 1));
    to = new Date(Date.UTC(y, m, 1));
  } else {
    return NextResponse.json({ error: "Pass either month or date." }, { status: 400 });
  }

  // ---- busy from Google ----------------------------------------------------
  let busy: BusyPeriod[] = [];
  let calendarConnected = false;

  const { data: account } = await admin
    .from("calendar_accounts")
    .select("refresh_token_enc, calendar_id, sync_enabled")
    .eq("provider", "google")
    .limit(1)
    .maybeSingle();

  if (account?.sync_enabled) {
    const refreshToken = decryptSecret(account.refresh_token_enc);
    if (refreshToken) {
      try {
        busy = await fetchBusy(
          refreshToken,
          account.calendar_id || "primary",
          from.toISOString(),
          to.toISOString()
        );
        calendarConnected = true;
      } catch {
        // A calendar problem must not stop someone booking - fall back to the
        // sessions we know about locally.
        calendarConnected = false;
      }
    }
  }

  // ---- busy from sessions already in the system ----------------------------
  const { data: booked } = await admin
    .from("sessions")
    .select("scheduled_at, duration_mins")
    .not("scheduled_at", "is", null)
    .neq("status", "cancelled")
    .gte("scheduled_at", from.toISOString())
    .lt("scheduled_at", to.toISOString());

  for (const s of booked ?? []) {
    const start = new Date(s.scheduled_at as string);
    const end = new Date(start.getTime() + (s.duration_mins ?? 180) * 60_000);
    busy.push({ start: start.toISOString(), end: end.toISOString() });
  }

  // ---- one day -------------------------------------------------------------
  if (date) {
    const slots = isWorkingDay(date, settings) ? buildDaySlots(date, settings, busy) : [];
    return NextResponse.json({ date, settings, calendarConnected, slots });
  }

  // ---- a whole month, summarised -------------------------------------------
  const days: {
    date: string;
    working: boolean;
    total: number;
    free: number;
  }[] = [];

  const cursor = new Date(from);
  const horizon = new Date(Date.now() + settings.max_days_ahead * 86_400_000);

  while (cursor < to) {
    const iso = toDateISO(cursor);
    const working = isWorkingDay(iso, settings) && cursor <= horizon;
    const slots = working ? buildDaySlots(iso, settings, busy) : [];

    days.push({
      date: iso,
      working,
      total: slots.length,
      free: slots.filter((s) => s.available).length,
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return NextResponse.json({ month, settings, calendarConnected, days });
}
