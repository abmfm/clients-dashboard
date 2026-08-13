"use client";

import { AlertTriangle, Info, Loader2 } from "lucide-react";

import { Modal } from "./Modal";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Confirmation before an action the user cannot casually undo.
 *
 * Two tones, because honesty matters here: "danger" for deletions, which really
 * are permanent, and "warning" for reversible changes. Telling someone an
 * action "cannot be undone" when it can teaches them to ignore the warning.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  impacts = [],
  confirmLabel,
  busy = false,
  error,
  tone = "danger",
  note,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  impacts?: string[];
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  tone?: "danger" | "warning";
  /** Replaces the default "cannot be undone" line. */
  note?: string;
}) {
  const { t } = useI18n();

  const danger = tone === "danger";
  const Icon = danger ? AlertTriangle : Info;

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="flex gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300 ring-1 ring-inset ring-rose-100">
            <AlertTriangle size={20} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[14px] leading-relaxed text-ink-700">{message}</p>
          </div>
        </div>

        {impacts.length > 0 ? (
          <ul className="space-y-1.5 rounded-xl bg-ink-50 px-4 py-3">
            {impacts.map((line) => (
              <li key={line} className="flex gap-2 text-[13px] text-ink-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        <p
          className={
            "text-[13px] font-medium " +
            (danger ? "text-rose-600" : "text-ink-500")
          }
        >
          {note ?? t.common.cannotUndo}
        </p>

        {error ? (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-[13.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 ring-1 ring-inset ring-rose-200">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy} autoFocus>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn bg-rose-600 text-canvas shadow-sm hover:bg-rose-700"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
