"use client";

/**
 * Fires the calendar sync after a session changes.
 *
 * Never throws and never blocks: the session itself is already saved, so a
 * calendar problem must not surface as a failed action. It returns the reason
 * so a screen can show a quiet note if it wants to.
 */
export async function syncSessionToCalendar(payload: {
  session_id?: string;
  delete_event_id?: string;
}): Promise<{ synced: boolean; reason?: string }> {
  try {
    const response = await fetch("/api/calendar/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await response.json()) as { synced: boolean; reason?: string };
  } catch {
    return { synced: false, reason: "Calendar sync could not run." };
  }
}
