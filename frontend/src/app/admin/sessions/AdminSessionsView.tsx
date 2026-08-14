"use client";

import {
  ArrowDownUp,
  CalendarClock,
  CalendarX,
  Check,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeading } from "@/components/PageHeading";
import { StatusSelect } from "@/components/StatusSelect";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert, Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { SlotPicker } from "@/components/booking/SlotPicker";
import type { Slot } from "@/lib/booking/slots";

import { SessionsTable } from "@/components/tables/SessionsTable";

import { useI18n } from "@/lib/i18n/provider";
import { syncSessionToCalendar } from "@/lib/calendar/client";
import { createClient } from "@/lib/supabase/client";
import type { Profile, SessionKind, SessionRow, WorkStatus } from "@/lib/types";
import { cx, fill, formatDateTime } from "@/lib/utils";

type ClientOption = Pick<Profile, "id" | "full_name" | "username">;

export function AdminSessionsView({
  sessions,
  clients,
  settings = null,
}: {
  sessions: SessionRow[];
  clients: ClientOption[];
  settings?: { extra_session_price: number; currency: string } | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const supabase = createClient();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [target, setTarget] = useState<SessionRow | null>(null);
  const [reviewing, setReviewing] = useState<SessionRow | null>(null);
  const [cancelling, setCancelling] = useState<SessionRow | null>(null);
  const [rescheduling, setRescheduling] = useState<SessionRow | null>(null);
  const [newTime, setNewTime] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [sort, setSort] = useState<"none" | "priority" | "recent" | "oldest">("priority");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    title: "",
    kind: "video" as SessionKind,
    location: "",
    notes: "",
    is_extra: false,
  });

  async function updateStatus(session: SessionRow, status: WorkStatus) {
    setBusyId(session.id);
    await supabase.from("sessions").update({ status }).eq("id", session.id);

    // Keep Google in step. Cancelling removes the event; any other change
    // refreshes its description, which carries the status.
    if (session.scheduled_at || status === "cancelled") {
      await syncSessionToCalendar({ session_id: session.id });
    }

    setBusyId(null);
    router.refresh();
  }

  // Admins may delete sessions directly - the RLS policy on `sessions` already
  // restricts every write to is_admin(), so no privileged route is needed.
  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    setDeleteError(null);

    // Remove the calendar event first - once the row is gone we lose the id.
    if (target.google_event_id) {
      await syncSessionToCalendar({ delete_event_id: target.google_event_id });
    }

    const { error: deleteError } = await supabase.from("sessions").delete().eq("id", target.id);
    setDeleting(false);

    if (deleteError) {
      setDeleteError(deleteError.message);
      return;
    }

    setTarget(null);
    router.refresh();
  }

  /**
   * How urgently a session needs attention. Never shown anywhere - it only
   * decides the order when "Needs attention first" is chosen.
   *
   * Staleness is the signal: a booking whose status has not moved in over ten
   * days has almost certainly been forgotten, and that matters more than how
   * far away the shoot is. Six days is the softer warning. Finished and
   * cancelled work is exempt - it is meant to sit still.
   */
  const STALE_URGENT_DAYS = 10;
  const STALE_WARN_DAYS = 6;

  function daysSinceUpdate(s: SessionRow) {
    return (Date.now() - new Date(s.updated_at).getTime()) / 86_400_000;
  }

  function priorityScore(s: SessionRow) {
    if (s.reschedule_status === "pending") return 0;
    if (s.status === "cancelled") return 6;
    if (s.status === "completed") return 5;

    const idle = daysSinceUpdate(s);
    if (idle > STALE_URGENT_DAYS) return 1;
    if (idle > STALE_WARN_DAYS) return 2;

    return s.scheduled_at && new Date(s.scheduled_at) >= new Date() ? 3 : 4;
  }

  const visible = useMemo(() => {
    const rows =
      clientFilter === "all" ? sessions : sessions.filter((s) => s.client_id === clientFilter);

    if (sort === "none") return rows;

    const copy = [...rows];

    if (sort === "recent") {
      copy.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    } else if (sort === "oldest") {
      copy.sort((a, b) => +new Date(a.updated_at) - +new Date(b.updated_at));
    } else {
      copy.sort((a, b) => {
        const diff = priorityScore(a) - priorityScore(b);
        if (diff !== 0) return diff;

        const at = a.scheduled_at ? +new Date(a.scheduled_at) : Infinity;
        const bt = b.scheduled_at ? +new Date(b.scheduled_at) : Infinity;
        return at - bt;
      });
    }

    return copy;
  }, [sessions, clientFilter, sort]);

  function toLocalInput(iso: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  }

  /** Moves a session to a new time and keeps the calendar in step. */
  async function applyNewTime(session: SessionRow, iso: string, fromRequest: boolean) {
    setActionBusy(true);
    setActionError(null);

    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        scheduled_at: iso,
        status: session.status === "approved" ? "scheduled" : session.status,
        reschedule_status: fromRequest ? "approved" : "none",
        reschedule_requested_for: null,
        reschedule_note: null,
      })
      .eq("id", session.id);

    if (updateError) {
      setActionBusy(false);
      setActionError(updateError.message);
      return;
    }

    await syncSessionToCalendar({ session_id: session.id });

    setActionBusy(false);
    setReviewing(null);
    setRescheduling(null);
    router.refresh();
  }

  /** Declines the request; the original time stands. */
  async function rejectReschedule(session: SessionRow) {
    setActionBusy(true);
    setActionError(null);

    const { error: updateError } = await supabase
      .from("sessions")
      .update({ reschedule_status: "rejected", reschedule_requested_for: null })
      .eq("id", session.id);

    setActionBusy(false);
    if (updateError) return setActionError(updateError.message);

    setReviewing(null);
    router.refresh();
  }

  /**
   * Cancelling keeps the row. The client still sees the session, struck
   * through and labelled, which is far clearer than it silently vanishing.
   */
  async function cancelSession(session: SessionRow) {
    setActionBusy(true);
    setActionError(null);

    if (session.google_event_id) {
      await syncSessionToCalendar({ delete_event_id: session.google_event_id });
    }

    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: cancelReason || null,
        reschedule_status: "none",
        reschedule_requested_for: null,
        google_event_id: null,
      })
      .eq("id", session.id);

    setActionBusy(false);
    if (updateError) return setActionError(updateError.message);

    setCancelling(null);
    setReviewing(null);
    setCancelReason("");
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { data: created, error: insertError } = await supabase
      .from("sessions")
      .insert({
      client_id: form.client_id,
      // Falls back to the type (and the trigger adds the date) so the form
      // works whether or not migration 11 has been applied yet.
      title: form.title.trim() || (form.kind === "video" ? "Video" : "Photography"),
      session_type: form.kind === "video" ? "Video" : "Photography",
      kind: form.kind,
      duration_mins: 180,
      scheduled_at: slot?.start ?? null,
      location: form.location || null,
      notes: form.notes || null,
      is_extra: form.is_extra,
      status: slot ? "scheduled" : "approved",
      })
      .select("id")
      .single();

    setBusy(false);
    if (insertError) return setError(insertError.message);

    if (created?.id && slot) {
      await syncSessionToCalendar({ session_id: created.id });
    }

    setOpen(false);
    setSlot(null);
    setForm({
      client_id: "",
        title: "",
      kind: "video",
        location: "",
      notes: "",
      is_extra: false,
    });
    router.refresh();
  }

  return (
    <>
      <PageHeading
        title={t.admin.sessionsTitle}
        subtitle={t.admin.sessionsSubtitle}
        action={
          <button className="btn-dark" onClick={() => setOpen(true)}>
            <Plus size={17} />
            {t.admin.newSession}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setClientFilter("all")}
          className={cx(
            "rounded-xl px-3.5 py-2 text-[13px] font-medium transition",
            clientFilter === "all"
              ? "bg-ink-900 text-surface"
              : "border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50"
          )}
        >
          {t.common.all}
        </button>

        {clients.map((c) => (
          <button
            key={c.id}
            onClick={() => setClientFilter(c.id)}
            className={cx(
              "rounded-xl px-3.5 py-2 text-[13px] font-medium transition",
              clientFilter === c.id
                ? "bg-ink-900 text-surface"
                : "border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50"
            )}
          >
            {c.full_name}
          </button>
        ))}

        <div className="ms-auto flex items-center gap-2">
          <ArrowDownUp size={15} className="text-ink-400" />
          <select
            className="input !w-auto !py-2 !text-[13px]"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label={t.sort.label}
          >
            <option value="priority">{t.sort.priority}</option>
            <option value="recent">{t.sort.recent}</option>
            <option value="oldest">{t.sort.oldest}</option>
            <option value="none">{t.sort.none}</option>
          </select>
        </div>
      </div>

      <Card className="pt-5">
        <SessionsTable
          sessions={visible}
          showClient
          renderActions={(s) => (
            <div className="flex items-center justify-end gap-2">
              {s.reschedule_status === "pending" ? (
                <button
                  onClick={() => {
                    setActionError(null);
                    setReviewing(s);
                  }}
                  className="btn bg-amber-500 px-3 py-1.5 text-[13px] text-canvas hover:bg-amber-600"
                >
                  <CalendarClock size={15} />
                  {t.reschedule.reviewTitle}
                </button>
              ) : null}

              {s.status !== "cancelled" ? (
                <>
                  <button
                    onClick={() => {
                      setActionError(null);
                      setNewTime(toLocalInput(s.scheduled_at));
                      setRescheduling(s);
                    }}
                    className="btn-ghost btn-sm !px-2"
                    aria-label={t.reschedule.adminReschedule}
                    title={t.reschedule.adminReschedule}
                  >
                    <CalendarClock size={15} />
                  </button>
                  <button
                    onClick={() => {
                      setActionError(null);
                      setCancelReason("");
                      setCancelling(s);
                    }}
                    className="btn-ghost btn-sm !px-2 text-ink-400 hover:!border-amber-200 hover:bg-amber-50 hover:text-amber-600"
                    aria-label={t.reschedule.cancelSession}
                    title={t.reschedule.cancelSession}
                  >
                    <CalendarX size={15} />
                  </button>
                </>
              ) : null}

              <StatusSelect
                value={s.status}
                disabled={busyId === s.id}
                onChange={(next) => updateStatus(s, next)}
              />
              {busyId === s.id ? <Loader2 size={15} className="animate-spin text-ink-400" /> : null}
              <button
                onClick={() => {
                  setDeleteError(null);
                  setTarget(s);
                }}
                className="btn-ghost btn-sm !px-2 text-ink-400 hover:!border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 hover:text-rose-600"
                aria-label={t.admin.deleteSession}
                title={t.admin.deleteSession}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        />
      </Card>

      {/* ---- Review a client's reschedule request ---- */}
      <Modal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title={t.reschedule.reviewTitle}
        subtitle={`${reviewing?.client?.full_name ?? ""} ${t.reschedule.reviewFor}`}
      >
        <div className="space-y-4">
          {actionError ? <Alert tone="error">{actionError}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-ink-50 px-4 py-3">
              <p className="text-[12.5px] text-ink-500">{t.reschedule.from}</p>
              <p className="ltr-nums mt-0.5 text-[14px] font-medium text-ink-900 line-through decoration-ink-400">
                {formatDateTime(reviewing?.scheduled_at, locale)}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
              <p className="text-[12.5px] text-emerald-700/80 dark:text-emerald-300/80">
                {t.reschedule.to}
              </p>
              <p className="ltr-nums mt-0.5 text-[14px] font-medium text-emerald-800 dark:text-emerald-200">
                {formatDateTime(reviewing?.reschedule_requested_for, locale)}
              </p>
            </div>
          </div>

          {reviewing?.reschedule_note ? (
            <div className="rounded-xl border border-ink-200 px-4 py-3 text-[13.5px] text-ink-600">
              {reviewing.reschedule_note}
            </div>
          ) : null}

          <div className="space-y-2 pt-1">
            <button
              className="btn-dark w-full"
              disabled={actionBusy}
              onClick={() =>
                reviewing?.reschedule_requested_for &&
                applyNewTime(reviewing, reviewing.reschedule_requested_for, true)
              }
            >
              {actionBusy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {t.reschedule.accept}
            </button>
            <button
              className="btn-ghost w-full"
              disabled={actionBusy}
              onClick={() => reviewing && rejectReschedule(reviewing)}
            >
              <X size={16} />
              {t.reschedule.reject}
            </button>
            <button
              className="btn w-full border border-amber-200 bg-surface text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300"
              disabled={actionBusy}
              onClick={() => {
                setCancelReason("");
                setCancelling(reviewing);
              }}
            >
              <CalendarX size={16} />
              {t.reschedule.cancelSession}
            </button>
          </div>
        </div>
      </Modal>

      {/* ---- Admin changes the time directly ---- */}
      <Modal
        open={!!rescheduling}
        onClose={() => setRescheduling(null)}
        title={t.reschedule.adminRescheduleTitle}
        subtitle={t.reschedule.adminRescheduleSubtitle}
      >
        <div className="space-y-4">
          {actionError ? <Alert tone="error">{actionError}</Alert> : null}

          <div className="rounded-xl bg-ink-50 px-4 py-3">
            <p className="text-[12.5px] text-ink-500">{t.reschedule.currentTime}</p>
            <p className="ltr-nums mt-0.5 text-[14px] font-medium text-ink-900">
              {formatDateTime(rescheduling?.scheduled_at, locale)}
            </p>
          </div>

          <Field label={t.reschedule.newTime} required>
            <input
              type="datetime-local"
              className="input"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setRescheduling(null)}>
              {t.common.cancel}
            </button>
            <button
              className="btn-dark"
              disabled={actionBusy || !newTime}
              onClick={() =>
                rescheduling && applyNewTime(rescheduling, new Date(newTime).toISOString(), false)
              }
            >
              {actionBusy ? <Loader2 size={16} className="animate-spin" /> : null}
              {t.common.save}
            </button>
          </div>
        </div>
      </Modal>

      {/* ---- Cancel (keeps the row) ---- */}
      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title={t.reschedule.cancelTitle}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          {actionError ? <Alert tone="error">{actionError}</Alert> : null}

          <p className="text-[14px] leading-relaxed text-ink-700">
            {fill(t.reschedule.cancelBody, { name: cancelling?.title ?? "" })}
          </p>

          <ul className="space-y-1.5 rounded-xl bg-ink-50 px-4 py-3">
            {[t.reschedule.cancelImpactCalendar, t.reschedule.cancelImpactPackage].map((line) => (
              <li key={line} className="flex gap-2 text-[13px] text-ink-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                {line}
              </li>
            ))}
          </ul>

          <Field label={t.reschedule.cancelReason} optional optionalLabel={t.common.optional}>
            <textarea
              className="input min-h-[72px] resize-y"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setCancelling(null)} autoFocus>
              {t.common.cancel}
            </button>
            <button
              className="btn bg-amber-500 text-canvas hover:bg-amber-600"
              disabled={actionBusy}
              onClick={() => cancelling && cancelSession(cancelling)}
            >
              {actionBusy ? <Loader2 size={16} className="animate-spin" /> : <CalendarX size={16} />}
              {t.reschedule.cancelSession}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={confirmDelete}
        busy={deleting}
        error={deleteError}
        title={t.admin.deleteSessionTitle}
        message={fill(t.admin.deleteSessionBody, { name: target?.title ?? "" })}
        confirmLabel={t.admin.deleteSession}
        impacts={[t.admin.deleteSessionImpactProjects]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title={t.admin.newSession}>
        <form onSubmit={create} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <Field label={t.common.client} required>
            <select
              className="input"
              required
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            >
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={t.common.name}
            hint={t.admin.nameFallback}
            optional
            optionalLabel={t.common.optional}
          >
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.booking.kind} required>
              <select
                className="input"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as SessionKind })}
              >
                <option value="video">{t.booking.video}</option>
                <option value="photo">{t.booking.photo}</option>
              </select>
            </Field>

          </div>

          <div>
            <p className="label">{t.booking.pickDay}</p>
            <SlotPicker value={slot} onChange={setSlot} />
          </div>

          <Field label={t.common.location} optional optionalLabel={t.common.optional}>
            <input
              className="input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>

          <Field label={t.common.notes} optional optionalLabel={t.common.optional}>
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          <label className="flex items-start gap-2.5 rounded-xl border border-ink-200 px-3.5 py-3 text-[13.5px] text-ink-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-ink-300"
              checked={form.is_extra}
              onChange={(e) => setForm({ ...form, is_extra: e.target.checked })}
            />
            <span>
              <span className="block font-medium text-ink-900">{t.client.extraSession}</span>
              <span className="ltr-nums mt-1 inline-flex items-baseline gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <span className="text-[15px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {settings?.extra_session_price ?? 230}
                </span>
                <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
                  {settings?.currency ?? "KD"}
                </span>
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button className="btn-dark" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {t.common.save}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
