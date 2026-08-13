"use client";

import { CalendarClock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Modal } from "./ui/Modal";
import { Alert, Field } from "./ui/Field";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type { SessionRow } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

/** Client-side: asks the photographer to move a session. */
export function RescheduleButton({ session }: { session: SessionRow }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");

  const pending = session.reschedule_status === "pending";
  const finished = session.status === "completed" || session.status === "cancelled";

  if (finished) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Only the reschedule columns are writable by a client - the database
    // trigger reverts anything else, so this cannot become a way to self-approve.
    const { error: updateError } = await createClient()
      .from("sessions")
      .update({
        reschedule_status: "pending",
        reschedule_requested_for: new Date(when).toISOString(),
        reschedule_note: note || null,
        reschedule_requested_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    setBusy(false);
    if (updateError) return setError(updateError.message);

    setOpen(false);
    setWhen("");
    setNote("");
    router.refresh();
  }

  if (pending) {
    return (
      <span className="pill bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25">
        <span className="pill-dot" />
        {t.reschedule.pendingBadge}
      </span>
    );
  }

  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <CalendarClock size={15} />
        {t.reschedule.request}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t.reschedule.requestTitle}
        subtitle={t.reschedule.requestSubtitle}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="rounded-xl bg-ink-50 px-4 py-3">
            <p className="text-[12.5px] text-ink-500">{t.reschedule.currentTime}</p>
            <p className="ltr-nums mt-0.5 text-[14px] font-medium text-ink-900">
              {formatDateTime(session.scheduled_at, locale)}
            </p>
          </div>

          <Field label={t.reschedule.newTime} required>
            <input
              type="datetime-local"
              className="input"
              required
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </Field>

          <Field label={t.reschedule.reason} optional optionalLabel={t.common.optional}>
            <textarea
              className="input min-h-[88px] resize-y"
              placeholder={t.reschedule.reasonPlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button className="btn-dark" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {t.reschedule.submit}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
