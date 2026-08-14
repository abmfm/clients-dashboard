import { NextResponse } from "next/server";

import { bookingEmail, sendEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends a sample booking alert so the address can be proven before it matters. */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("studio_settings")
    .select("notify_email")
    .eq("id", 1)
    .maybeSingle();

  if (!settings?.notify_email) {
    return NextResponse.json({ sent: false, reason: "Add an address and save it first." });
  }

  const { subject, html, text } = bookingEmail({
    clientName: "Test Client",
    kind: "video",
    when: "Sat, 5 Sep 2026, 15:00",
    isExtra: false,
    notes: "This is a test — no booking was made.",
    siteUrl: new URL(request.url).origin,
  });

  return NextResponse.json(
    await sendEmail({ to: settings.notify_email, subject: `[Test] ${subject}`, html, text })
  );
}
