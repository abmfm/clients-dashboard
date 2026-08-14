import { NextResponse } from "next/server";

import { bookingEmail, sendEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Emails the studio when a client books.
 *
 * Called by the client's own browser right after the booking saves, so it runs
 * as the client - which is why the request id is re-read here with the service
 * role and every detail comes from the database rather than the request body.
 * A caller cannot make this send an email about a booking that is not theirs,
 * or put words of their choosing into it.
 *
 * Always returns 200: the booking already succeeded.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ sent: false, reason: "Not authenticated." });

  let requestId: string | undefined;
  try {
    ({ request_id: requestId } = (await request.json()) as { request_id?: string });
  } catch {
    return NextResponse.json({ sent: false, reason: "Invalid body." });
  }
  if (!requestId) return NextResponse.json({ sent: false, reason: "No request id." });

  const admin = createAdminClient();

  const { data: row } = await admin
    .from("requests")
    .select("id, client_id, kind, session_type, preferred_date, preferred_time, location, notes, is_extra")
    .eq("id", requestId)
    .maybeSingle();

  // Only the person who made the booking can trigger its alert.
  if (!row || row.client_id !== user.id) {
    return NextResponse.json({ sent: false, reason: "Not found." });
  }

  const { data: settings } = await admin
    .from("studio_settings")
    .select("notify_email, notify_on_booking, timezone")
    .eq("id", 1)
    .maybeSingle();

  if (!settings?.notify_on_booking || !settings.notify_email) {
    return NextResponse.json({ sent: false, reason: "Email alerts are off." });
  }

  const { data: client } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", row.client_id)
    .maybeSingle();

  const when = formatWhen(
    row.preferred_date as string | null,
    row.preferred_time as string | null,
    settings.timezone ?? "Asia/Kuwait"
  );

  const { subject, html, text } = bookingEmail({
    clientName: client?.full_name ?? "A client",
    kind: row.kind === "video" ? "video" : "photography",
    when,
    isExtra: Boolean(row.is_extra),
    location: row.location as string | null,
    notes: row.notes as string | null,
    siteUrl: new URL(request.url).origin,
  });

  const result = await sendEmail({ to: settings.notify_email, subject, html, text });
  return NextResponse.json(result);
}

function formatWhen(date: string | null, time: string | null, timeZone: string) {
  if (!date) return "date to be confirmed";

  const instant = new Date(`${date}T${(time ?? "00:00:00").slice(0, 8)}Z`);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}
