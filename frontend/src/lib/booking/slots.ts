/**
 * Turns opening hours plus a list of busy periods into bookable slots.
 *
 * Pure and timezone-explicit so it can be reasoned about: every boundary is an
 * absolute instant, and "is this slot taken" is a simple interval overlap.
 */

export interface StudioSettings {
  working_days: number[];
  day_start: string;
  day_end: string;
  slot_hours: number;
  max_days_ahead: number;
  min_hours_notice: number;
  extra_session_price: number;
  currency: string;
  timezone: string;
}

export interface Slot {
  /** ISO instant. */
  start: string;
  end: string;
  /** Local wall-clock label, e.g. "13:00". */
  label: string;
  endLabel: string;
  available: boolean;
}

interface Period {
  start: string;
  end: string;
}

/** ISO weekday, 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function minutesFromTime(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function hhmm(minutes: number) {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

/**
 * The absolute instant of a wall-clock time on a given day in a given zone.
 *
 * The offset is measured at that moment rather than assumed, so this stays
 * correct across daylight-saving boundaries.
 */
export function zonedInstant(dateISO: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(guess).map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute)
  );

  return new Date(guess.getTime() - (asUTC - guess.getTime()));
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** Every slot for one day, each marked free or taken. */
export function buildDaySlots(
  dateISO: string,
  settings: StudioSettings,
  busy: Period[],
  now: Date = new Date()
): Slot[] {
  const open = minutesFromTime(settings.day_start);
  const close = minutesFromTime(settings.day_end);
  const step = settings.slot_hours * 60;

  const noticeCutoff = now.getTime() + settings.min_hours_notice * 60 * 60 * 1000;
  const busyRanges = busy.map(
    (b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const
  );

  const slots: Slot[] = [];

  for (let minute = open; minute + step <= close; minute += step) {
    const start = zonedInstant(dateISO, minute, settings.timezone);
    const end = new Date(start.getTime() + step * 60 * 1000);

    const clashes = busyRanges.some(([bs, be]) =>
      overlaps(start.getTime(), end.getTime(), bs, be)
    );

    slots.push({
      start: start.toISOString(),
      end: end.toISOString(),
      label: hhmm(minute),
      endLabel: hhmm(minute + step),
      available: !clashes && start.getTime() >= noticeCutoff,
    });
  }

  return slots;
}

/** Does the studio open at all on this date? */
export function isWorkingDay(dateISO: string, settings: StudioSettings): boolean {
  const [y, m, d] = dateISO.split("-").map(Number);
  return settings.working_days.includes(isoWeekday(new Date(Date.UTC(y, m - 1, d))));
}

export function toDateISO(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
