"use client";

import { CalendarCheck, CalendarDays, CheckCircle2, Clock, History } from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/PageHeading";
import { RequestSessionButton } from "@/components/RequestSessionButton";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ProjectsTable } from "@/components/tables/ProjectsTable";
import { RequestsTable } from "@/components/tables/RequestsTable";
import { useI18n } from "@/lib/i18n/provider";
import type { ClientStats, Project, SessionRequest } from "@/lib/types";

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[13.5px] font-medium text-ink-500 transition hover:text-ink-900"
    >
      {label}
      <span aria-hidden className="rtl:rotate-180">
        ›
      </span>
    </Link>
  );
}

export function DashboardView({
  clientId,
  stats,
  projects,
  requests,
}: {
  clientId: string;
  stats: ClientStats | null;
  projects: Project[];
  requests: SessionRequest[];
}) {
  const { t } = useI18n();

  return (
    <>
      <PageHeading
        title={t.client.welcome}
        subtitle={t.client.subtitle}
        action={
          <div className="flex flex-wrap gap-2">
            <RequestSessionButton
              clientId={clientId}
              mode="package"
              sessionsLeft={stats?.sessions_left ?? 0}
            />
            <RequestSessionButton clientId={clientId} variant="ghost" />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          delay={0}
          tone="blue"
          icon={<CalendarDays size={20} strokeWidth={1.9} />}
          label={t.client.totalSessions}
          value={stats?.session_limit ?? 0}
          hint={t.client.totalSessionsHint}
        />
        <StatCard
          delay={70}
          tone="green"
          icon={<CalendarCheck size={20} strokeWidth={1.9} />}
          label={t.client.sessionsLeft}
          value={stats?.sessions_left ?? 0}
          hint={t.client.sessionsLeftHint}
        />
        <StatCard
          delay={140}
          tone="amber"
          icon={<Clock size={20} strokeWidth={1.9} />}
          label={t.client.additionalRequests}
          value={stats?.pending_requests ?? 0}
          hint={t.client.additionalRequestsHint}
        />
        <StatCard
          delay={210}
          tone="blue"
          icon={<CheckCircle2 size={20} strokeWidth={1.9} />}
          label={t.client.completedWork}
          value={stats?.completed ?? 0}
          hint={t.client.completedWorkHint}
        />
        <StatCard
          delay={280}
          tone="violet"
          icon={<History size={20} strokeWidth={1.9} />}
          label={t.client.inProgress}
          value={stats?.in_progress ?? 0}
          hint={t.client.inProgressHint}
        />
      </div>

      <div className="mt-6 space-y-6">
        <Card hover delay={260}>
          <CardHeader
            title={t.client.bookingsTitle}
            subtitle={t.client.bookingsSubtitle}
            action={<SeeAll href="/requests" label={t.common.viewAllRequests} />}
          />
          <RequestsTable requests={requests} />
        </Card>

        <Card hover delay={370}>
          <CardHeader
            title={t.client.projectsTitle}
            subtitle={t.client.projectsSubtitle}
            action={<SeeAll href="/projects" label={t.common.viewAllProjects} />}
          />
          <ProjectsTable projects={projects} />
        </Card>
      </div>
    </>
  );
}
