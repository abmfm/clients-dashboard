import "server-only";

import { explainGoogleError } from "./errors";
import { accessTokenFromRefresh } from "./oauth";

export interface BusyPeriod {
  start: string;
  end: string;
}

/**
 * Asks Google which stretches of a window are already taken.
 *
 * freeBusy is used rather than listing events on purpose: it returns only
 * start/end pairs, so the client's booking screen never sees the titles or
 * details of the photographer's other appointments.
 */
export async function fetchBusy(
  refreshToken: string,
  calendarIds: string[],
  timeMin: string,
  timeMax: string
): Promise<BusyPeriod[]> {
  const ids = calendarIds.filter(Boolean);
  if (ids.length === 0) return [];

  const token = await accessTokenFromRefresh(refreshToken);

  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin, timeMax, items: ids.map((id) => ({ id })) }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json()) as {
    calendars?: Record<string, { busy?: BusyPeriod[]; errors?: { reason: string }[] }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(explainGoogleError(data.error?.message ?? "freeBusy failed", response.status));
  }

  const periods: BusyPeriod[] = [];
  const failures: string[] = [];

  for (const id of ids) {
    const entry = data.calendars?.[id];
    if (entry?.errors?.length) failures.push(`${id}: ${entry.errors[0].reason}`);
    if (entry?.busy) periods.push(...entry.busy);
  }

  // Every calendar failing is a real problem; some failing still leaves useful
  // information, so those are ignored rather than blocking the booking screen.
  if (failures.length === ids.length) {
    throw new Error(`Google could not read the calendar - ${failures[0]}`);
  }

  return periods;
}

/** The calendars this account owns, for the picker in Settings. */
export async function listCalendars(refreshToken: string) {
  const token = await accessTokenFromRefresh(refreshToken);

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=100",
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
  );

  const data = (await response.json()) as {
    items?: { id: string; summary: string; primary?: boolean; accessRole?: string }[];
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      explainGoogleError(data.error?.message ?? "Could not list calendars.", response.status)
    );
  }

  return (data.items ?? []).map((c) => ({
    id: c.id,
    name: c.summary,
    primary: Boolean(c.primary),
  }));
}
