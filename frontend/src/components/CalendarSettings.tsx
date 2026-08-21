"use client";

import { CalendarCheck, CalendarX, Link2, Loader2, RefreshCw, Stethoscope } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Card } from "./ui/Card";
import { Alert, Field } from "./ui/Field";
import { useI18n } from "@/lib/i18n/provider";
import { cx, formatDateTime } from "@/lib/utils";

export interface CalendarAccount {
  google_email: string | null;
  calendar_id: string;
  sync_enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  scopes: string | null;
  availability_calendar_ids?: string[] | null;
  /** Invited to every session event. */
  event_guests?: string[] | null;
}

function Inner({ account }: { account: CalendarAccount | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const [calendarId, setCalendarId] = useState(account?.calendar_id ?? "primary");
  const [guests, setGuests] = useState((account?.event_guests ?? []).join(", "));
  const [calendars, setCalendars] = useState<{ id: string; name: string; primary: boolean }[]>([]);
  const [checking, setChecking] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [availabilityIds, setAvailabilityIds] = useState<string[]>(
    account?.availability_calendar_ids?.length
      ? account.availability_calendar_ids
      : [account?.calendar_id ?? "primary"]
  );

  // Loaded on demand: it needs a Google round trip, and most visits to this
  // page are not about changing which calendars count as busy.
  async function loadCalendars() {
    setChecking(true);
    setListError(null);

    const response = await fetch("/api/calendar/list");
    const data = await response.json();

    setChecking(false);
    setCalendars(data.calendars ?? []);
    if (data.error) setListError(data.error);
  }

  function toggleCalendar(id: string) {
    setAvailabilityIds((ids) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]));
  }
  const [enabled, setEnabled] = useState(account?.sync_enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectError = params.get("calendar_error");
  const scopeError = params.get("calendar_scope_error") === "1";
  const granted = params.get("calendar_granted");
  const justConnected = params.get("calendar_connected") === "1";

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; reason?: string } | null>(null);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);

    const response = await fetch("/api/calendar/test", { method: "POST" });
    const data = await response.json();

    setTesting(false);
    setTestResult({ ok: Boolean(data.ok), reason: data.reason });
    router.refresh();
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);

    const response = await fetch("/api/calendar/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendar_id: calendarId,
        sync_enabled: enabled,
        event_guests: guests
          .split(/[,\n;]/)
          .map((g) => g.trim())
          .filter(Boolean),
        availability_calendar_ids: availabilityIds,
      }),
    });

    const data = await response.json();
    setBusy(false);

    if (!response.ok) return setError(data.error ?? "Could not save.");
    setSaved(true);
    router.refresh();
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/calendar/disconnect", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card className="card-pad">
      <div className="mb-4 flex items-center gap-2">
        <CalendarCheck size={18} className="text-ink-400" />
        <h2 className="section-title">{t.calendar.title}</h2>
      </div>
      <p className="section-sub mb-5 !mt-0">{t.calendar.subtitle}</p>

      <div className="space-y-4">
        {connectError ? <Alert tone="error">{connectError}</Alert> : null}

        {scopeError ? (
          <Alert tone="error">
            <p className="font-medium">{t.calendar.scopeErrorTitle}</p>
            <ol className="mt-2 list-decimal space-y-1 ps-4">
              <li>{t.calendar.scopeFix1}</li>
              <li>{t.calendar.scopeFix2}</li>
              <li>{t.calendar.scopeFix3}</li>
            </ol>
            {granted ? (
              <p className="ltr-nums mt-2 break-all font-mono text-[11.5px] opacity-70" dir="ltr">
                granted: {granted}
              </p>
            ) : null}
          </Alert>
        ) : null}
        {justConnected ? <Alert tone="success">{t.calendar.connected}</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        {saved ? <Alert tone="success">{t.profile.saved}</Alert> : null}

        {!account ? (
          <>
            <div className="rounded-xl bg-ink-50 px-4 py-3 text-[13.5px] text-ink-600">
              {t.calendar.notConnected}
            </div>
            <a href="/api/calendar/connect" className="btn-dark">
              <Link2 size={16} />
              {t.calendar.connect}
            </a>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <div className="min-w-0">
                <p className="text-[13px] text-emerald-800/70 dark:text-emerald-300/80">
                  {t.calendar.connectedAs}
                </p>
                <p className="ltr-nums truncate font-mono text-[13.5px] font-medium text-ink-900" dir="ltr">
                  {account.google_email ?? "Google account"}
                </p>
              </div>
              <button onClick={disconnect} disabled={busy} className="btn-ghost btn-sm shrink-0">
                <CalendarX size={15} />
                {t.calendar.disconnect}
              </button>
            </div>

            <Field label={t.calendar.targetCalendar} hint={t.calendar.targetHint}>
              <input
                className="input ltr-nums font-mono"
                dir="ltr"
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                placeholder="primary"
              />
            </Field>

            <label className="flex items-start gap-3 rounded-xl border border-ink-200 px-4 py-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-ink-300"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>
                <span className="block text-[13.5px] font-medium text-ink-900">
                  {t.calendar.syncEnabled}
                </span>
                <span className="block text-[12.5px] text-ink-500">{t.calendar.syncHint}</span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button onClick={save} disabled={busy} className="btn-dark">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {t.common.save}
              </button>
              <button onClick={testConnection} disabled={testing} className="btn-ghost">
                {testing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Stethoscope size={16} />
                )}
                {t.calendar.test}
              </button>
              <a href="/api/calendar/connect" className="btn-ghost">
                <Link2 size={16} />
                {t.calendar.reconnect}
              </a>
            </div>

            {testResult ? (
              <Alert tone={testResult.ok ? "success" : "error"}>
                {testResult.ok ? t.calendar.testPassed : testResult.reason}
              </Alert>
            ) : null}

            <div className="space-y-1 text-[12.5px] text-ink-400">
              {account.last_synced_at ? (
                <p className="ltr-nums">
                  {t.calendar.lastSynced}: {formatDateTime(account.last_synced_at, locale)}
                </p>
              ) : null}
              {account.last_error ? (
                <p className={cx("text-rose-600")}>
                  {t.calendar.lastError}: {account.last_error}
                </p>
              ) : null}
              {account.scopes ? (
                <p className="ltr-nums break-all font-mono text-[11px] opacity-70" dir="ltr">
                  {account.scopes}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function CalendarSettings({ account }: { account: CalendarAccount | null }) {
  return (
    <Suspense fallback={null}>
      <Inner account={account} />
    </Suspense>
  );
}
