"use client";

import { Camera, Video } from "lucide-react";

import { PageHeading } from "@/components/PageHeading";
import { RequestSessionButton } from "@/components/RequestSessionButton";
import { useI18n } from "@/lib/i18n/provider";
import type { ClientStats } from "@/lib/types";

export function SessionsHeading({
  clientId,
  stats,
}: {
  clientId: string;
  stats: ClientStats | null;
}) {
  const { t } = useI18n();

  return (
    <PageHeading
      title={t.client.sessionsTitle}
      subtitle={t.client.sessionsSubtitle}
      action={
        <div className="flex flex-wrap gap-2">
          <RequestSessionButton clientId={clientId} mode="package" stats={stats} />
          <RequestSessionButton clientId={clientId} variant="ghost" stats={stats} />
        </div>
      }
    />
  );
}

/**
 * This month's allowance, per kind.
 *
 * Deliberately says "this month" everywhere: the allowance resets on the 1st
 * and unused sessions do not carry over, so a bare number without that context
 * would be misread as a running total for the whole contract.
 */
export function PackageUsage({ stats }: { stats: ClientStats | null }) {
  const { t } = useI18n();

  const rows = [
    {
      key: "video",
      icon: Video,
      label: t.booking.video,
      perMonth: stats?.video_allowance ?? 0,
      used: stats?.video_used ?? 0,
      left: stats?.video_left ?? 0,
      carried: stats?.video_carried ?? 0,
      bar: "bg-violet-500",
    },
    {
      key: "photo",
      icon: Camera,
      label: t.booking.photo,
      perMonth: stats?.photo_allowance ?? 0,
      used: stats?.photo_used ?? 0,
      left: stats?.photo_left ?? 0,
      carried: stats?.photo_carried ?? 0,
      bar: "bg-emerald-500",
    },
  ];

  return (
    <div className="card card-pad">
      <p className="text-[15px] font-semibold tracking-tight text-ink-900">
        {t.client.packageUsage}
      </p>
      <p className="section-sub mb-5 !mt-1">{t.client.monthlyResetHint}</p>

      <div className="grid gap-5 sm:grid-cols-2">
        {rows.map(({ key, icon: Icon, label, perMonth, used, left, carried, bar }) => {
          // The bar measures this month's own entitlement, so it still reads as
          // a monthly cycle. Anything carried in is shown beside it, not folded
          // into the bar - otherwise a full bar would look like nothing is left.
          const usedThisMonth = Math.min(used, perMonth);
          const pct = perMonth > 0 ? Math.round((usedThisMonth / perMonth) * 100) : 0;

          return (
            <div key={key}>
              <div className="mb-2 flex items-end justify-between gap-3">
                <span className="flex items-center gap-2 text-[13.5px] text-ink-600">
                  <Icon size={16} className="text-ink-400" />
                  {label}
                </span>
                <span className="ltr-nums text-[13.5px] text-ink-500">
                  {used} / {perMonth} {t.client.thisMonth}
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className={`anim-grow-x h-full rounded-full ${bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className="ltr-nums mt-2 flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
                <span className="text-[17px] font-semibold tracking-tight text-ink-900">
                  {left}
                </span>
                <span className="text-ink-500">{t.client.availableToBook}</span>

                {carried > 0 ? (
                  <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11.5px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    +{carried} {t.client.carried}
                  </span>
                ) : null}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
