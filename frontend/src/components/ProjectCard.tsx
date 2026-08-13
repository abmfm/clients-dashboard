"use client";

import { ChevronDown, FolderOpen } from "lucide-react";
import { useState } from "react";

import { ProgressBar } from "./ui/ProgressBar";
import { StatusBadge, TypeBadge } from "./ui/StatusBadge";
import { useI18n } from "@/lib/i18n/provider";
import type { Project, SessionRow } from "@/lib/types";
import { cx, formatDateTime } from "@/lib/utils";

/**
 * One client project, with the sessions filed under it listed like a log.
 *
 * The overall bar is not editable anywhere in the UI: it is the average of the
 * sessions below it, recalculated by the database whenever one of them moves.
 * Showing a number nobody can type is deliberate - it can never drift from the
 * work it describes.
 */
export function ProjectCard({
  project,
  showClient = false,
  defaultOpen = false,
  delay = 0,
  actions,
  sessionActions,
}: {
  project: Project;
  showClient?: boolean;
  defaultOpen?: boolean;
  delay?: number;
  actions?: React.ReactNode;
  sessionActions?: (session: SessionRow) => React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(defaultOpen);

  const sessions = project.sessions ?? [];
  const live = sessions.filter((s) => s.status !== "cancelled");

  return (
    <section
      className="card anim-fade-up stagger overflow-hidden"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-start gap-4 px-5 py-5 sm:px-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <FolderOpen size={20} strokeWidth={1.9} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[16px] font-semibold tracking-tight text-ink-900">
              {project.name}
            </h3>
            <TypeBadge type={project.type} label={project.type_label} />
            <StatusBadge status={project.status} />
          </div>

          <p className="mt-1 text-[13px] text-ink-500">
            {showClient && project.client?.full_name ? `${project.client.full_name} · ` : ""}
            <span className="ltr-nums">{live.length}</span> {t.projects.sessionsInside}
          </p>
        </div>

        <div className="w-full sm:w-[220px]">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[12px] text-ink-400">{t.projects.overall}</span>
            <span className="ltr-nums text-[14px] font-semibold tabular-nums text-ink-900">
              {project.progress}%
            </span>
          </div>
          <ProgressBar value={project.progress} showLabel={false} />
        </div>

        <div className="flex items-center gap-2">
          {actions}
          <button
            onClick={() => setOpen((v) => !v)}
            className="btn-ghost btn-sm !px-2"
            aria-expanded={open}
            aria-label={open ? t.projects.collapse : t.projects.expand}
          >
            <ChevronDown
              size={16}
              className={cx("transition-transform duration-200", open && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-ink-200/70 bg-ink-50/40">
          {sessions.length === 0 ? (
            <p className="px-6 py-8 text-center text-[13.5px] text-ink-400">
              {t.projects.noSessions}
            </p>
          ) : (
            <ol className="divide-y divide-ink-200/70">
              {sessions.map((s, i) => (
                <li
                  key={s.id}
                  className={cx(
                    "anim-fade-in stagger flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6",
                    s.status === "cancelled" && "row-cancelled"
                  )}
                  style={{ "--d": `${i * 40}ms` } as React.CSSProperties}
                >
                  {/* Timeline rail */}
                  <span className="relative flex h-full items-center">
                    <span
                      className={cx(
                        "h-2.5 w-2.5 rounded-full ring-4",
                        s.status === "completed"
                          ? "bg-emerald-500 ring-emerald-500/15"
                          : s.status === "cancelled"
                            ? "bg-ink-300 ring-ink-300/20"
                            : "bg-blue-500 ring-blue-500/15"
                      )}
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-ink-900">
                      <span className="cancellable">{s.title}</span>
                    </p>
                    <p className="ltr-nums mt-0.5 text-[12.5px] text-ink-500">
                      {s.session_type} · {formatDateTime(s.scheduled_at, locale)}
                    </p>
                  </div>

                  <StatusBadge status={s.status} />

                  <div className="w-full sm:w-[160px]">
                    <ProgressBar value={s.progress} />
                  </div>

                  {sessionActions ? <div>{sessionActions(s)}</div> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
