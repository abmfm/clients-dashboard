"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import type { Slot, StudioSettings } from "@/lib/booking/slots";
import { cx } from "@/lib/utils";

interface DaySummary {
  date: string;
  working: boolean;
  total: number;
  free: number;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/**
 * A calendar of days, then the three-hour slots inside the chosen day.
 *
 * Days are shaded by how much is left rather than only free/full, so the client
 * can see at a glance where there is room. A day with nothing free is not
 * clickable at all - better than letting someone open it and find nothing.
 */
export function SlotPicker({
  value,
  onChange,
  onSettings,
}: {
  value: Slot | null;
  onChange: (slot: Slot | null) => void;
  onSettings?: (settings: StudioSettings) => void;
}) {
  const { t, locale } = useI18n();

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });

  const [days, setDays] = useState<DaySummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMonth = useCallback(
    async (month: string) => {
      setLoadingMonth(true);
      setNotice(null);

      const response = await fetch(`/api/availability?month=${month}`);
      const data = await response.json();

      setLoadingMonth(false);
      if (!response.ok) return setNotice(data.error ?? "Could not load availability.");

      setDays((data.days as DaySummary[]) ?? []);
      if (data.settings && onSettings) onSettings(data.settings as StudioSettings);
      if (data.calendarConnected === false) {
        // The specific reason is far more useful than "unavailable" - it tells
        // the admin exactly what to fix.
        setNotice(data.calendarError ? `${t.booking.calendarOffline} ${data.calendarError}` : t.booking.calendarOffline);
      }
    },
    [onSettings, t.booking.calendarOffline]
  );

  useEffect(() => {
    loadMonth(monthKey(cursor));
  }, [cursor, loadMonth]);

  async function pickDay(date: string) {
    setSelected(date);
    onChange(null);
    setLoadingDay(true);

    const response = await fetch(`/api/availability?date=${date}`);
    const data = await response.json();

    setLoadingDay(false);
    setSlots((data.slots as Slot[]) ?? []);
  }

  // Leading blanks so the 1st lands under the right weekday (Monday first).
  const grid = useMemo(() => {
    if (days.length === 0) return [] as (DaySummary | null)[];
    const first = new Date(`${days[0].date}T00:00:00Z`);
    const weekday = first.getUTCDay() === 0 ? 7 : first.getUTCDay();
    return [...Array<DaySummary | null>(weekday - 1).fill(null), ...days];
  }, [days]);

  const monthLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(cursor);

  const weekdays =
    locale === "ar"
      ? ["إث", "ثل", "أر", "خم", "جم", "سب", "أح"]
      : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            className="btn-ghost btn-sm !px-2"
            onClick={() =>
              setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1)))
            }
            aria-label="Previous month"
          >
            <ChevronLeft size={16} className="rtl:rotate-180" />
          </button>

          <span className="text-[14px] font-medium text-ink-900">
            {monthLabel}
            {loadingMonth ? (
              <Loader2 size={13} className="ms-2 inline animate-spin text-ink-400" />
            ) : null}
          </span>

          <button
            type="button"
            className="btn-ghost btn-sm !px-2"
            onClick={() =>
              setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)))
            }
            aria-label="Next month"
          >
            <ChevronRight size={16} className="rtl:rotate-180" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((w) => (
            <span key={w} className="py-1 text-[11px] font-medium text-ink-400">
              {w}
            </span>
          ))}

          {grid.map((day, i) =>
            day === null ? (
              <span key={`blank-${i}`} />
            ) : (
              <button
                key={day.date}
                type="button"
                disabled={!day.working || day.free === 0}
                onClick={() => pickDay(day.date)}
                className={cx(
                  "ltr-nums rounded-lg py-2 text-[13px] font-medium transition",
                  selected === day.date
                    ? "bg-ink-900 text-surface"
                    : !day.working || day.free === 0
                      ? "cursor-not-allowed text-ink-300 line-through"
                      : day.free === day.total
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300"
                )}
                title={day.working && day.free > 0 ? `${day.free}/${day.total}` : t.booking.dayFull}
              >
                {Number(day.date.slice(-2))}
              </button>
            )
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 border-t border-ink-200/70 pt-2.5 text-[11.5px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-emerald-200 dark:bg-emerald-500/40" />
            {t.booking.legendFree}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-amber-200 dark:bg-amber-500/40" />
            {t.booking.legendPartial}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-ink-200" />
            {t.booking.legendFull}
          </span>
        </div>
      </div>

      {notice ? (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          {notice}
        </p>
      ) : null}

      {selected ? (
        <div>
          <p className="label">{t.booking.pickTime}</p>

          {loadingDay ? (
            <p className="flex items-center gap-2 py-3 text-[13px] text-ink-400">
              <Loader2 size={14} className="animate-spin" />
              {t.common.loading}
            </p>
          ) : slots.length === 0 ? (
            <p className="rounded-xl bg-ink-50 px-4 py-3 text-[13px] text-ink-500">
              {t.booking.dayFull}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  disabled={!s.available}
                  onClick={() => onChange(s)}
                  className={cx(
                    "ltr-nums rounded-xl border px-3 py-2.5 text-[13px] font-medium transition",
                    value?.start === s.start
                      ? "border-ink-900 bg-ink-900 text-surface"
                      : s.available
                        ? "border-ink-200 bg-surface text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                        : "cursor-not-allowed border-ink-200/60 bg-ink-50 text-ink-300 line-through"
                  )}
                >
                  {s.label} – {s.endLabel}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
