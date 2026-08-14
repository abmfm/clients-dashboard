"use client";

import { Clock, Loader2, Mail, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card } from "./ui/Card";
import { Alert, Field } from "./ui/Field";
import type { StudioSettings } from "@/lib/booking/slots";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { cx } from "@/lib/utils";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * How the studio works. These values drive the availability calendar clients
 * book from, which is why they live in the database rather than in the code -
 * opening hours change without a deployment.
 */
export function StudioSettingsPanel({
  settings,
}: {
  settings: (StudioSettings & { notify_email?: string; notify_on_booking?: boolean }) | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [form, setForm] = useState({
    working_days: settings?.working_days ?? DAYS,
    day_start: (settings?.day_start ?? "09:00").slice(0, 5),
    day_end: (settings?.day_end ?? "21:00").slice(0, 5),
    slot_hours: settings?.slot_hours ?? 3,
    min_hours_notice: settings?.min_hours_notice ?? 24,
    max_days_ahead: settings?.max_days_ahead ?? 90,
    extra_session_price: settings?.extra_session_price ?? 230,
    currency: settings?.currency ?? "KD",
    timezone: settings?.timezone ?? "Asia/Kuwait",
    notify_email: settings?.notify_email ?? "",
    notify_on_booking: settings?.notify_on_booking ?? true,
  });

  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ sent: boolean; reason?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayNames =
    locale === "ar"
      ? ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      working_days: f.working_days.includes(day)
        ? f.working_days.filter((d) => d !== day)
        : [...f.working_days, day].sort(),
    }));
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);

    const response = await fetch("/api/notify/test", { method: "POST" });
    setTestResult(await response.json());
    setTesting(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);

    const { error: updateError } = await createClient()
      .from("studio_settings")
      .update(form)
      .eq("id", 1);

    setBusy(false);
    if (updateError) return setError(updateError.message);

    setSaved(true);
    router.refresh();
  }

  return (
    <Card className="card-pad">
      <div className="mb-4 flex items-center gap-2">
        <Clock size={18} className="text-ink-400" />
        <h2 className="section-title">{t.studio.title}</h2>
      </div>
      <p className="section-sub mb-5 !mt-0">{t.studio.subtitle}</p>

      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {saved ? <Alert tone="success">{t.profile.saved}</Alert> : null}

        <div>
          <p className="label">{t.studio.workingDays}</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={cx(
                  "rounded-xl px-3 py-2 text-[13px] font-medium transition",
                  form.working_days.includes(d)
                    ? "bg-ink-900 text-surface"
                    : "border border-ink-200 bg-surface text-ink-500 hover:bg-ink-50"
                )}
              >
                {dayNames[i]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.studio.dayStart}>
            <input
              type="time"
              className="input"
              value={form.day_start}
              onChange={(e) => setForm({ ...form, day_start: e.target.value })}
            />
          </Field>
          <Field label={t.studio.dayEnd}>
            <input
              type="time"
              className="input"
              value={form.day_end}
              onChange={(e) => setForm({ ...form, day_end: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.studio.slotHours}>
            <input
              type="number"
              min={1}
              max={12}
              className="input ltr-nums"
              value={form.slot_hours}
              onChange={(e) => setForm({ ...form, slot_hours: Number(e.target.value) })}
            />
          </Field>
          <Field label={t.studio.notice} hint={t.studio.noticeHint}>
            <input
              type="number"
              min={0}
              max={168}
              className="input ltr-nums"
              value={form.min_hours_notice}
              onChange={(e) => setForm({ ...form, min_hours_notice: Number(e.target.value) })}
            />
          </Field>
          <Field label={t.studio.horizon} hint={t.studio.horizonHint}>
            <input
              type="number"
              min={1}
              max={365}
              className="input ltr-nums"
              value={form.max_days_ahead}
              onChange={(e) => setForm({ ...form, max_days_ahead: Number(e.target.value) })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.studio.extraPrice}>
            <input
              type="number"
              min={0}
              step="0.01"
              className="input ltr-nums"
              value={form.extra_session_price}
              onChange={(e) => setForm({ ...form, extra_session_price: Number(e.target.value) })}
            />
          </Field>
          <Field label={t.studio.currency}>
            <input
              className="input"
              maxLength={6}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </Field>
          <Field label={t.studio.timezone} hint={t.studio.timezoneHint}>
            <input
              className="input ltr-nums"
              dir="ltr"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </Field>
        </div>

        <div className="border-t border-ink-200/70 pt-4">
          <div className="mb-3 flex items-center gap-2">
            <Mail size={16} className="text-ink-400" />
            <p className="text-[14px] font-medium text-ink-900">{t.studio.emailTitle}</p>
          </div>

          <Field label={t.studio.notifyEmail} hint={t.studio.notifyEmailHint}>
            <input
              type="email"
              className="input ltr-nums"
              dir="ltr"
              placeholder="you@example.com"
              value={form.notify_email}
              onChange={(e) => setForm({ ...form, notify_email: e.target.value })}
            />
          </Field>

          <label className="mt-3 flex items-start gap-2.5 text-[13.5px] text-ink-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-ink-300"
              checked={form.notify_on_booking}
              onChange={(e) => setForm({ ...form, notify_on_booking: e.target.checked })}
            />
            <span>
              <span className="block font-medium text-ink-900">{t.studio.notifyOnBooking}</span>
              <span className="block text-[12.5px] text-ink-500">{t.studio.notifyOnBookingHint}</span>
            </span>
          </label>

          <button
            type="button"
            onClick={sendTest}
            disabled={testing || !form.notify_email}
            className="btn-ghost btn-sm mt-3"
          >
            {testing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {t.studio.sendTest}
          </button>

          {testResult ? (
            <div className="mt-3">
              <Alert tone={testResult.sent ? "success" : "error"}>
                {testResult.sent ? t.studio.testSent : testResult.reason}
              </Alert>
            </div>
          ) : null}
        </div>

        <button className="btn-dark" onClick={save} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          {t.common.save}
        </button>
      </div>
    </Card>
  );
}
