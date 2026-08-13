"use client";

import { CalendarDays } from "lucide-react";

import { ProjectCard } from "@/components/ProjectCard";
import { PageHeading } from "@/components/PageHeading";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/lib/i18n/provider";
import type { Project, SessionRow } from "@/lib/types";
import { cx, formatDateTime } from "@/lib/utils";

export function ProjectsView({
  projects,
  loose,
}: {
  projects: Project[];
  loose: SessionRow[];
}) {
  const { t, locale } = useI18n();

  return (
    <>
      <PageHeading title={t.projects.clientTitle} subtitle={t.projects.clientSubtitle} />

      {projects.length === 0 && loose.length === 0 ? (
        <Card className="card-pad text-center text-[14px] text-ink-400">{t.common.noData}</Card>
      ) : null}

      <div className="space-y-4">
        {projects.map((p, i) => (
          <ProjectCard key={p.id} project={p} delay={i * 60} defaultOpen={projects.length <= 2} />
        ))}

        {loose.length > 0 ? (
          <Card className="overflow-hidden" delay={projects.length * 60}>
            <header className="px-5 pb-4 pt-5 sm:px-6">
              <h3 className="section-title">{t.client.sessionsTitle}</h3>
              <p className="section-sub">{t.projects.noSessions}</p>
            </header>

            <ol className="divide-y divide-ink-200/70 border-t border-ink-200/70 bg-ink-50/40">
              {loose.map((s, i) => (
                <li
                  key={s.id}
                  className={cx(
                    "anim-fade-in stagger flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6",
                    s.status === "cancelled" && "row-cancelled"
                  )}
                  style={{ "--d": `${i * 40}ms` } as React.CSSProperties}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-500">
                    <CalendarDays size={17} strokeWidth={1.9} />
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
                </li>
              ))}
            </ol>
          </Card>
        ) : null}
      </div>
    </>
  );
}
