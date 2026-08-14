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
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<BusyPeriod[]> {
  const token = await accessTokenFromRefresh(refreshToken);

  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json()) as {
    calendars?: Record<string, { busy?: BusyPeriod[]; errors?: { reason: string }[] }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(explainGoogleError(data.error?.message ?? "freeBusy failed", response.status));
  }

  const calendar = data.calendars?.[calendarId];
  if (calendar?.errors?.length) {
    throw new Error(`Google could not read that calendar: ${calendar.errors[0].reason}`);
  }

  return calendar?.busy ?? [];
}
