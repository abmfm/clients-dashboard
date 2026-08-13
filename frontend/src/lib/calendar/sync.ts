import "server-only";

import { createEvent, deleteEvent, updateEvent } from "@/lib/google/calendar";
import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Keeps Google Calendar in step with the sessions table.
 *
 * Deliberately never throws into the caller's happy path: if Google is down or
 * the token was revoked, approving a session must still succeed. The failure is
 * recorded on the connection so the admin can see it in Settings.
 */

const DEFAULT_DURATION_MINUTES = 120;

interface SyncResult {
  synced: boolean;
  reason?: string;
}

async function connectionFor(adminId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("calendar_accounts")
    .select("refresh_token_enc, calendar_id, sync_enabled")
    .eq("profile_id", adminId)
    .maybeSingle();

  if (!data) return null;
  if (!data.sync_enabled) return null;

  const refreshToken = decryptSecret(data.refresh_token_enc);
  if (!refreshToken) return null;

  return { refreshToken, calendarId: data.calendar_id || "primary" };
}

async function noteResult(adminId: string, error: string | null) {
  const admin = createAdminClient();
  await admin
    .from("calendar_accounts")
    .update({ last_synced_at: new Date().toISOString(), last_error: error })
    .eq("profile_id", adminId);
}

/** Creates or updates the event for one session. */
export async function syncSession(adminId: string, sessionId: string): Promise<SyncResult> {
  const connection = await connectionFor(adminId);
  if (!connection) return { synced: false, reason: "No calendar connected." };

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("sessions")
    .select(
      "id, title, session_type, scheduled_at, duration_mins, location, notes, status, google_event_id, client:profiles!sessions_client_id_fkey(full_name)"
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { synced: false, reason: "Session not found." };

  // Nothing to put on a calendar without a date.
  if (!session.scheduled_at) return { synced: false, reason: "Session has no date yet." };

  const clientRecord = session.client as unknown as { full_name?: string } | null;
  const clientName = clientRecord?.full_name ?? "Client";

  const start = new Date(session.scheduled_at);
  const end = new Date(
    start.getTime() + (session.duration_mins ?? DEFAULT_DURATION_MINUTES) * 60_000
  );

  const details = [
    `Client: ${clientName}`,
    `Type: ${session.session_type}`,
    `Status: ${String(session.status).replace(/_/g, " ")}`,
    session.notes ? `\nNotes: ${session.notes}` : "",
    "\nTwelve East",
  ]
    .filter(Boolean)
    .join("\n");

  const event = {
    summary: `${session.title} — ${clientName}`,
    description: details,
    location: session.location ?? undefined,
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: process.env.STUDIO_TIMEZONE || "UTC",
  };

  try {
    const eventId = session.google_event_id
      ? await updateEvent(
          connection.refreshToken,
          connection.calendarId,
          session.google_event_id,
          event
        )
      : await createEvent(connection.refreshToken, connection.calendarId, event);

    if (eventId !== session.google_event_id) {
      await admin.from("sessions").update({ google_event_id: eventId }).eq("id", session.id);
    }

    await noteResult(adminId, null);
    return { synced: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Calendar sync failed.";
    await noteResult(adminId, reason);
    return { synced: false, reason };
  }
}

/** Removes an event whose session is being deleted. */
export async function removeEvent(adminId: string, eventId: string): Promise<SyncResult> {
  const connection = await connectionFor(adminId);
  if (!connection) return { synced: false, reason: "No calendar connected." };

  try {
    await deleteEvent(connection.refreshToken, connection.calendarId, eventId);
    await noteResult(adminId, null);
    return { synced: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Could not remove the event.";
    await noteResult(adminId, reason);
    return { synced: false, reason };
  }
}
