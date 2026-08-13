"use client";

import { CalendarPlus, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Modal } from "./ui/Modal";
import { resolveSessionType, SessionTypePicker } from "./ui/SessionTypePicker";
import { Alert, Field } from "./ui/Field";
import { SESSION_TYPES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";

/**
 * One form, two modes.
 *
 *  - "package": books one of the sessions included in the contract.
 *     Hidden once the package is used up; the database enforces the same limit.
 *  - "extra":   asks for a session beyond the contract. Always available.
 *
 * Both create a row in `requests` and wait for the admin to approve.
 */
export function RequestSessionButton({
  clientId,
  mode = "extra",
  sessionsLeft = 0,
  variant = "solid",
}: {
  clientId: string;
  mode?: "package" | "extra";
  sessionsLeft?: number;
  variant?: "solid" | "ghost";
}) {
  const { t } = useI18n();
  const router = useRouter();

  const isPackage = mode === "package";

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    session_type: SESSION_TYPES[isPackage ? 0 : 2],
    custom_type: "",
    preferred_date: "",
    preferred_time: "",
    location: "",
    notes: "",
  });

  const disabled = isPackage && sessionsLeft <= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: insertError } = await createClient().from("requests").insert({
      client_id: clientId,
      title: isPackage ? "Package Session" : "Extra Photoshoot Session",
      session_type: resolveSessionType(form.session_type, form.custom_type),
      preferred_date: form.preferred_date || null,
      preferred_time: form.preferred_time || null,
      location: form.location || null,
      notes: form.notes || null,
      is_extra: !isPackage,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setOpen(false);
    setForm({
      session_type: SESSION_TYPES[isPackage ? 0 : 2],
      custom_type: "",
      preferred_date: "",
      preferred_time: "",
      location: "",
      notes: "",
    });
    router.refresh();
  }

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
        {isPackage && sessionsLeft > 0 ? (
          <span className="ltr-nums rounded-md bg-white/15 px-1.5 py-0.5 text-[12px]">
            {sessionsLeft}
          </span>
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isPackage ? t.requestForm.bookTitle : t.requestForm.title}
        subtitle={isPackage ? t.requestForm.bookSubtitle : t.requestForm.subtitle}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          {isPackage ? (
            <Alert tone="info">
              <span className="ltr-nums font-medium">{sessionsLeft}</span> {t.requestForm.remaining}
            </Alert>
          ) : null}

          <SessionTypePicker
            value={form.session_type}
            custom={form.custom_type}
            onChange={(v) => setForm({ ...form, session_type: v })}
            onCustomChange={(v) => setForm({ ...form, custom_type: v })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.requestForm.preferredDate} required={isPackage}>
              <input
                type="date"
                className="input"
                required={isPackage}
                value={form.preferred_date}
                onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
              />
            </Field>
            <Field label={t.requestForm.preferredTime}>
              <input
                type="time"
                className="input"
                value={form.preferred_time}
                onChange={(e) => setForm({ ...form, preferred_time: e.target.value })}
              />
            </Field>
          </div>

          <Field label={t.requestForm.location} optional optionalLabel={t.common.optional}>
            <input
              className="input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>

          <Field label={t.requestForm.notes} optional optionalLabel={t.common.optional}>
            <textarea
              className="input min-h-[96px] resize-y"
              placeholder={t.requestForm.notesPlaceholder}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button type="submit" disabled={busy} className="btn-dark">
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {isPackage ? t.client.bookButton : t.requestForm.submit}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
