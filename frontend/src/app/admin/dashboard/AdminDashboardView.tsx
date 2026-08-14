"use client";

import { CalendarDays, CheckCircle2, Clock, Film, Users } from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/PageHeading";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { SessionsTable } from "@/components/tables/SessionsTable";
import { RequestsTable } from "@/components/tables/RequestsTable";
import { useI18n } from "@/lib/i18n/provider";
import type { AdminStats, SessionRequest, SessionRow } from "@/lib/types";

export function AdminDashboardView({
  stats,
  requests,
  sessions,
}: {
  stats: AdminStats | null;
  requests: SessionRequest[];
  sessions: SessionRow[];
}) {
  const { t } = useI18n();

  const seeAll = (href: string, label: string) => (
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

  return (
    <>
      <PageHeading
        title={t.admin.title}
        subtitle={t.admin.subtitle}
        action={
          <Link href="/admin/create" className="btn-dark">
            + {t.create.openButton}
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          delay={0}
          tone="blue"
          icon={<Users size={20} strokeWidth={1.9} />}
          label={t.admin.totalClients}
          value={stats?.clients ?? 0}
          hint={t.admin.totalClientsHint}
        />
        <StatCard
          delay={70}
          tone="violet"
          icon={<CalendarDays size={20} strokeWidth={1.9} />}
          label={t.admin.totalSessions}
          value={stats?.sessions ?? 0}
          hint={t.admin.totalSessionsHint}
        />
        <StatCard
          delay={140}
          tone="rose"
          icon={<Film size={20} strokeWidth={1.9} />}
          label={t.admin.activeProjects}
          value={stats?.active_projects ?? 0}
          hint={t.admin.activeProjectsHint}
        />
        <StatCard
          delay={210}
          tone="amber"
          icon={<Clock size={20} strokeWidth={1.9} />}
          label={t.admin.pendingRequests}
          value={stats?.pending_requests ?? 0}
          hint={t.admin.pendingRequestsHint}
        />
        <StatCard
          delay={280}
          tone="green"
          icon={<CheckCircle2 size={20} strokeWidth={1.9} />}
          label={t.admin.completedWork}
          value={stats?.completed ?? 0}
          hint={t.admin.completedWorkHint}
        />
      </div>

      <div className="mt-6 space-y-6">
        <Card hover delay={260}>
          <CardHeader
            title={t.admin.requestsTitle}
            subtitle={t.admin.requestsSubtitle}
            action={seeAll("/admin/requests", t.common.viewAllRequests)}
          />
          <RequestsTable requests={requests} showClient />
        </Card>

        <Card hover delay={370}>
          <CardHeader
            title={t.admin.upcomingTitle}
            subtitle={t.admin.upcomingSubtitle}
            action={seeAll("/admin/sessions", t.common.viewAll)}
          />
          <SessionsTable sessions={sessions} showClient />
        </Card>
      </div>
    </>
  );
}
