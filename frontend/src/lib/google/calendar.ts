import "server-only";

import { explainGoogleError } from "./errors";
import { accessTokenFromRefresh } from "./oauth";

const API = "https://www.googleapis.com/calendar/v3/calendars";

export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  /** ISO string. */
  start: string;
  /** ISO string. */
  end: string;
  timeZone?: string;
  /** Invited to the event. Any address works - no Google account required. */
  guests?: string[];
}

function body(event: CalendarEventInput) {
  const timeZone = event.timeZone || "UTC";
  const guests = (event.guests ?? []).filter(Boolean);

  return {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: { dateTime: event.start, timeZone },
    end: { dateTime: event.end, timeZone },
    ...(guests.length ? { attendees: guests.map((email) => ({ email })) } : {}),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 24 * 60 },
        { method: "popup", minutes: 60 },
      ],
    },
  };
}

async function call(
  refreshToken: string,
  path: string,
  init: RequestInit
): Promise<Response> {
  const token = await accessTokenFromRefresh(refreshToken);

  return fetch(`${API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

export async function createEvent(
  refreshToken: string,
  calendarId: string,
  event: CalendarEventInput
): Promise<string> {
  const response = await call(
    refreshToken,
    `${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    { method: "POST", body: JSON.stringify(body(event)) }
  );

  const data = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !data.id) {
    throw new Error(
      explainGoogleError(data.error?.message ?? "Could not create the calendar event.", response.status)
    );
  }
  return data.id;
}

export async function updateEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string,
  event: CalendarEventInput
): Promise<string> {
  const response = await call(
    refreshToken,
    `${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "PATCH", body: JSON.stringify(body(event)) }
  );

  // The event was removed from Google's side - make a fresh one instead of failing.
  if (response.status === 404 || response.status === 410) {
    return createEvent(refreshToken, calendarId, event);
  }

  const data = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !data.id) {
    throw new Error(
      explainGoogleError(data.error?.message ?? "Could not update the calendar event.", response.status)
    );
  }
  return data.id;
}

export async function deleteEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const response = await call(
    refreshToken,
    `${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE" }
  );

  // Already gone is a success as far as we are concerned.
  if (response.ok || response.status === 404 || response.status === 410) return;

  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  throw new Error(
    explainGoogleError(data.error?.message ?? "Could not delete the calendar event.", response.status)
  );
}
