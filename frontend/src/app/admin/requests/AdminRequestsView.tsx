"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeading } from "@/components/PageHeading";
import { Card } from "@/components/ui/Card";
import { Alert, Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { RequestsTable } from "@/components/tables/RequestsTable";
import { useI18n } from "@/lib/i18n/provider";
import { syncSessionToCalendar } from "@/lib/calendar/client";
import { createClient } from "@/lib/supabase/client";
import type { SessionRequest } from "@/lib/types";
import { cx } from "@/lib/utils";

type Decision = "approve" | "reject";

export function AdminRequestsView({
  adminId,
  requests,
}: {
  adminId: string;
  requests: SessionRequest[];
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [target, setTarget] = useState<SessionRequest | null>(null);
  const [decision, setDecision] = useState<Decision>("approve");
  const [note, setNote] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  function open(request: SessionRequest, next: Decision) {
    setTarget(request);
    setDecision(next);
    setNote("");
    setError(null);
    const date = request.preferred_date ?? "";
    const time = (request.preferred_time ?? "10:00").slice(0, 5);
    setScheduledAt(date ? `${date}T${time}` : "");
  }

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("requests")
      .update({
        status: decision === "approve" ? "approved" : "rejected",
        admin_note: note || null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", target.id);

    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }

    // Approving materialises the shoot. A package booking stays inside the
    // contract (is_extra false); an extra request does not.
    if (decision === "approve") {
      const { data: created, error: sessionError } = await supabase
        .from("sessions")
        .insert({
        client_id: target.client_id,
        request_id: target.id,
        title: target.title,
        session_type: target.session_type,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        location: target.location,
        notes: target.notes,
        status: scheduledAt ? "scheduled" : "approved",
        is_extra: target.is_extra,
        })
        .select("id")
        .single();

      if (sessionError) {
        setBusy(false);
        setError(sessionError.message);
        return;
      }

      // Push it to Google Calendar. The session is already saved, so a calendar
      // failure is reported as a note rather than rolling anything back.
      if (created?.id && scheduledAt) {
        const result = await syncSessionToCalendar({ session_id: created.id });
        if (!result.synced && result.reason && !result.reason.includes("No calendar")) {
          setNotice(`${t.calendar.syncFailed}: ${result.reason}`);
        }
      }
    }

    setBusy(false);
    setTarget(null);
    router.refresh();
  }

  return (
    <>
      <PageHeading title={t.admin.requestsTitle} subtitle={t.admin.requestsSubtitle} />

      {notice ? (
        <div className="mb-4">
          <Alert tone="info">{notice}</Alert>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              "rounded-xl px-3.5 py-2 text-[13px] font-medium transition",
              filter === f
                ? "bg-ink-900 text-canvas"
                : "border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50"
            )}
          >
            {f === "all" ? t.common.all : (t.status as Record<string, string>)[f]}
          </button>
        ))}
      </div>

      <Card className="pt-5">
        <RequestsTable
          requests={visible}
          showClient
          renderActions={(r) =>
            r.status === "pending" ? (
              <div className="flex justify-end gap-2">
                <button className="btn-ghost btn-sm" onClick={() => open(r, "reject")}>
                  <X size={15} />
                  {t.common.reject}
                </button>
                <button className="btn-dark btn-sm" onClick={() => open(r, "approve")}>
                  <Check size={15} />
                  {t.common.approve}
                </button>
              </div>
            ) : (
              <span className="text-[13px] text-ink-400">{t.common.none}</span>
            )
          }
        />
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={decision === "approve" ? t.admin.approveRequest : t.admin.rejectRequest}
        subtitle={target?.client?.full_name ?? undefined}
      >
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="rounded-xl bg-ink-50 px-4 py-3 text-[13.5px] text-ink-600">
            <p className="font-medium text-ink-900">{target?.session_type}</p>
            {target?.notes ? <p className="mt-1">{target.notes}</p> : null}
          </div>

          {decision === "approve" ? (
            <>
              <Alert tone="info">{t.admin.createSessionFromRequest}</Alert>
              <Field label={`${t.common.date} / ${t.common.time}`}>
                <input
                  type="datetime-local"
                  className="input"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </Field>
            </>
          ) : null}

          <Field label={t.admin.adminNote} optional optionalLabel={t.common.optional}>
            <textarea
              className="input min-h-[80px] resize-y"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setTarget(null)}>
              {t.common.cancel}
            </button>
            <button className="btn-dark" onClick={confirm} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {decision === "approve" ? t.common.approve : t.common.reject}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
