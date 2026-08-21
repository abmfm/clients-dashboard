"use client";

import { CalendarPlus, Loader2, Plus, Video, Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SlotPicker } from "./booking/SlotPicker";
import { Modal } from "./ui/Modal";
import { Alert, Field } from "./ui/Field";
import type { Slot, StudioSettings } from "@/lib/booking/slots";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type { ClientStats, SessionKind } from "@/lib/types";
import { cx, fill } from "@/lib/utils";

/**
 * One form, two modes.
 *
 *  - "package": spends one of this month's included sessions. The kind picker
 *    disables whichever kind is used up, and the database enforces the same
 *    limit so the rule holds even if this screen is bypassed.
 *  - "extra":   a session beyond the package, charged separately. Always open.
 */
export function RequestSessionButton({
  clientId,
  mode = "extra",
  stats,
  variant = "solid",
}: {
  clientId: string;
  mode?: "package" | "extra";
  stats: ClientStats | null;
  variant?: "solid" | "ghost";
}) {
  const { t } = useI18n();
  const router = useRouter();

  const isPackage = mode === "package";

  const videoLeft = stats?.video_left ?? 0;
  const photoLeft = stats?.photo_left ?? 0;
  const totalLeft = videoLeft + photoLeft;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState<SessionKind>(videoLeft > 0 ? "video" : "photo");

  const disabled = isPackage && totalLeft <= 0;

  function allowed(k: SessionKind) {
    if (!isPackage) return true;
    return k === "video" ? videoLeft > 0 : photoLeft > 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!slot) return setError(t.booking.noSlot);

    setBusy(true);
    setError(null);

    const date = slot.start.slice(0, 10);
    const time = new Date(slot.start).toISOString().slice(11, 19);

    const { data: created, error: insertError } = await createClient()
      .from("requests")
      .insert({
      client_id: clientId,
      title: isPackage ? "Package Session" : "Extra Photoshoot Session",
      session_type: kind === "video" ? "Video" : "Photography",
      kind,
      preferred_date: date,
      preferred_time: time,
      location: location || null,
      notes: notes || null,
      is_extra: !isPackage,
      })
      .select("id")
      .single();

    // The database refuses anything over the monthly allowance or outside the
    // contract, and its message is written for a person to read.
    if (insertError) {
      setBusy(false);
      return setError(insertError.message);
    }

    // Tell the studio by email. Deliberately not awaited into the happy path -
    // the booking is already saved, and an email problem must not surface here.
    if (created?.id) {
      fetch("/api/notify/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: created.id }),
      }).catch(() => {});
    }

    setOpen(false);
    setSlot(null);
    setNotes("");
    setLocation("");
    setBusy(false);
    router.refresh();
  }

  const KindButton = ({ value, icon: Icon, label }: { value: SessionKind; icon: React.ElementType; label: string }) => {
    const left = value === "video" ? videoLeft : photoLeft;
    const usable = allowed(value);

    return (
      <button
        type="button"
        disabled={!usable}
        onClick={() => setKind(value)}
        className={cx(
          "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-start transition",
          kind === value
            ? "border-ink-900 bg-ink-900 text-surface"
            : usable
              ? "border-ink-200 bg-surface text-ink-700 hover:border-ink-300 hover:bg-ink-50"
              : "cursor-not-allowed border-ink-200/60 bg-ink-50 text-ink-300"
        )}
      >
        <Icon size={18} />
        <span className="min-w-0">
          <span className="block text-[13.5px] font-medium">{label}</span>
          {isPackage ? (
            <span className="ltr-nums block text-[11.5px] opacity-70">
              {left} {t.booking.monthlyLeft}
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  return (
    <>
      <button
        className={variant === "ghost" ? "btn-ghost" : "btn-dark"}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? t.client.packageUsedUp : undefined}
      >
        {isPackage ? <CalendarPlus size={17} /> : <Plus size={17} />}
        {isPackage ? t.client.bookButton : t.client.requestButton}
        {isPackage && totalLeft > 0 ? (
          <span className="ltr-nums rounded-md bg-white/15 px-1.5 py-0.5 text-[12px]">
            {totalLeft}
          </span>
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isPackage ? t.requestForm.bookTitle : t.requestForm.title}
        subtitle={isPackage ? t.requestForm.bookSubtitle : t.requestForm.subtitle}
      >
        <form onSubmit={submit} className="space-y-5">
          {error ? <Alert tone="error">{error}</Alert> : null}

          {!isPackage ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="flex items-baseline gap-2">
                <span className="ltr-nums text-[24px] font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">
                  {settings?.extra_session_price ?? 230}
                </span>
                <span className="text-[14px] font-medium text-emerald-700 dark:text-emerald-300">
                  {settings?.currency ?? "KD"}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-emerald-800/80 dark:text-emerald-300/80">
                {t.booking.extraNote}
              </p>
            </div>
          ) : null}

          <div>
            <p className="label">{t.booking.kind}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <KindButton value="video" icon={Video} label={t.booking.video} />
              <KindButton value="photo" icon={Camera} label={t.booking.photo} />
            </div>
          </div>

          <div>
            <p className="label">{t.booking.pickDay}</p>
            <SlotPicker value={slot} onChange={setSlot} onSettings={setSettings} />
          </div>

          <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-[12.5px] text-ink-500">
            {fill(t.booking.duration, { hours: settings?.slot_hours ?? 3 })}
          </p>

          <Field label={t.requestForm.location} optional optionalLabel={t.common.optional}>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>

          <Field label={t.requestForm.notes} optional optionalLabel={t.common.optional}>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder={t.requestForm.notesPlaceholder}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {slot ? (
              <span className="ltr-nums text-[13px] text-ink-500">
                {t.booking.selected}: {slot.start.slice(0, 10)} · {slot.label}–{slot.endLabel}
              </span>
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </button>
              <button type="submit" disabled={busy || !slot} className="btn-dark">
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {isPackage ? t.client.bookButton : t.requestForm.submit}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
