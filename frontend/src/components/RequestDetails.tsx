"use client";

import { Eye } from "lucide-react";
import { useState } from "react";

import { Modal } from "./ui/Modal";
import { StatusBadge } from "./ui/StatusBadge";
import { useI18n } from "@/lib/i18n/provider";
import type { SessionRequest } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[13px] text-ink-500">{label}</dt>
      <dd className="text-end text-[13.5px] font-medium text-ink-900">{value}</dd>
    </div>
  );
}

function Note({ label, text, tone }: { label: string; text: string | null; tone: "client" | "admin" }) {
  const { t } = useI18n();

  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </p>
      <div
        className={
          "rounded-xl px-4 py-3 text-[13.5px] leading-relaxed " +
          (text
            ? tone === "admin"
              ? "bg-brand-50 text-ink-800"
              : "bg-ink-50 text-ink-700"
            : "bg-ink-50 text-ink-400")
        }
      >
        {text || t.details.noNote}
      </div>
    </div>
  );
}

/** Opens the full record of a request, including both sides' notes. */
export function RequestDetails({ request }: { request: SessionRequest }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);

  const time = request.preferred_time ? ` · ${request.preferred_time.slice(0, 5)}` : "";

  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <Eye size={15} />
        {t.details.view}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t.details.title}
        subtitle={request.client?.full_name ?? undefined}
      >
        <div className="space-y-5">
          <dl className="divide-y divide-ink-200/70">
            <Row label={t.details.request} value={request.title} />
            <Row label={t.common.type} value={request.session_type} />
            <Row
              label={t.details.kind}
              value={request.is_extra ? t.client.kindExtra : t.client.kindPackage}
            />
            <Row
              label={t.common.status}
              value={
                request.cancelled_at ? (
                  <span className="pill bg-ink-100 text-ink-500 ring-ink-200">
                    {t.reschedule.cancelBadge}
                  </span>
                ) : (
                  <StatusBadge status={request.status} />
                )
              }
            />
            <Row
              label={t.details.preferred}
              value={
                <span className="ltr-nums">
                  {formatDate(request.preferred_date, locale)}
                  {time}
                </span>
              }
            />
            {request.location ? <Row label={t.details.location} value={request.location} /> : null}
            <Row
              label={t.details.submitted}
              value={<span className="ltr-nums">{formatDateTime(request.created_at, locale)}</span>}
            />
            {request.reviewed_at ? (
              <Row
                label={t.details.reviewed}
                value={
                  <span className="ltr-nums">{formatDateTime(request.reviewed_at, locale)}</span>
                }
              />
            ) : null}
            {request.cancelled_at ? (
              <Row
                label={t.details.cancelled}
                value={
                  <span className="ltr-nums">{formatDateTime(request.cancelled_at, locale)}</span>
                }
              />
            ) : null}
          </dl>

          <Note label={t.details.clientNote} text={request.notes} tone="client" />
          <Note label={t.details.adminNote} text={request.admin_note} tone="admin" />

          <div className="flex justify-end">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              {t.common.close}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
