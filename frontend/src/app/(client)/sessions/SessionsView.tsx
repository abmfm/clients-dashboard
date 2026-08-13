"use client";

import { PageHeading } from "@/components/PageHeading";
import { RequestSessionButton } from "@/components/RequestSessionButton";
import { useI18n } from "@/lib/i18n/provider";
import type { ClientStats } from "@/lib/types";

export function SessionsHeading({
  clientId,
  sessionsLeft,
}: {
  clientId: string;
  sessionsLeft: number;
}) {
  const { t } = useI18n();
  return (
    <PageHeading
      title={t.client.sessionsTitle}
      subtitle={t.client.sessionsSubtitle}
      action={
        <div className="flex flex-wrap gap-2">
          <RequestSessionButton clientId={clientId} mode="package" sessionsLeft={sessionsLeft} />
          <RequestSessionButton clientId={clientId} variant="ghost" />
        </div>
      }
    />
  );
}

export function PackageUsage({ stats }: { stats: ClientStats | null }) {
  const { t } = useI18n();
  const limit = stats?.session_limit ?? 0;
  const used = stats?.sessions_used ?? 0;
  const remaining = stats?.sessions_left ?? Math.max(limit - used, 0);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-ink-600">{t.client.packageUsage}</p>
          <p className="ltr-nums mt-1 text-[26px] font-semibold tracking-tight text-ink-900">
            {used} <span className="text-ink-400">/ {limit}</span>
          </p>
        </div>
        <p className="ltr-nums text-[13px] text-ink-500">
          {remaining} {t.client.remaining}
        </p>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
