"use client";

import { Camera, CalendarRange, Video } from "lucide-react";

import { Card } from "./ui/Card";
import { useI18n } from "@/lib/i18n/provider";
import type { ClientContract } from "@/lib/types";
import { cx, formatDate } from "@/lib/utils";

/**
 * The contract, month by month. Admin only, and only on this page.
 *
 * Kept off the client's own screens on purpose: they need to know what is left
 * this month, not how many months of contract remain. Showing a countdown to
 * expiry to the person paying invites a conversation nobody asked for.
 */
export function ContractPanel({ contract }: { contract: ClientContract | null }) {
  const { t, locale } = useI18n();

  if (!contract || !contract.contract_start) {
    return (
      <Card className="card-pad">
        <h3 className="section-title">{t.contract.title}</h3>
        <p className="section-sub">{t.contract.none}</p>
      </Card>
    );
  }

  const current = contract.current_month ?? 0;
  const total = contract.contract_months;
  const remaining = Math.max(total - current, 0);

  return (
    <Card className="card-pad">
      <div className="mb-4 flex items-center gap-2">
        <CalendarRange size={18} className="text-ink-400" />
        <h3 className="section-title">{t.contract.title}</h3>
      </div>

      <dl className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-ink-50 px-4 py-3">
          <dt className="text-[12px] text-ink-500">{t.contract.package}</dt>
          <dd className="mt-0.5 text-[14px] font-medium text-ink-900">
            {contract.package ?? t.common.none}
          </dd>
        </div>
        <div className="rounded-xl bg-ink-50 px-4 py-3">
          <dt className="text-[12px] text-ink-500">{t.contract.started}</dt>
          <dd className="ltr-nums mt-0.5 text-[14px] font-medium text-ink-900">
            {formatDate(contract.contract_start, locale)}
          </dd>
        </div>
        <div className="rounded-xl bg-ink-50 px-4 py-3">
          <dt className="text-[12px] text-ink-500">{t.contract.remaining}</dt>
          <dd className="ltr-nums mt-0.5 text-[14px] font-medium text-ink-900">
            {remaining} / {total}
          </dd>
        </div>
      </dl>

      <p className="mb-1 text-[12.5px] font-medium uppercase tracking-wide text-ink-400">
        {t.contract.monthly}
      </p>
      <p className="mb-2.5 text-[12px] text-ink-400">{t.contract.rolloverNote}</p>

      <ol className="space-y-1.5">
        {contract.months.map((m) => {
          const isNow = m.n === current;
          const past = current > 0 && m.n < current;

          return (
            <li
              key={m.n}
              className={cx(
                "flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5",
                isNow ? "bg-brand-50 ring-1 ring-inset ring-brand-100" : "bg-ink-50",
                past && "opacity-60"
              )}
            >
              <span
                className={cx(
                  "ltr-nums grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold",
                  isNow ? "bg-brand-600 text-canvas" : "bg-ink-200 text-ink-600"
                )}
              >
                {m.n}
              </span>

              <span className="ltr-nums min-w-0 flex-1 text-[13px] text-ink-600">
                {formatDate(m.starts_on, locale)}
              </span>

              {/* used that month, then the balance still carried after it */}
              <span className="ltr-nums flex items-center gap-1.5 text-[13px] text-ink-700">
                <Video size={14} className="text-ink-400" />
                {m.video_used}
                <span className="text-ink-400">·</span>
                <span className="text-ink-500">{m.video_balance} {t.contract.left}</span>
              </span>

              <span className="ltr-nums flex items-center gap-1.5 text-[13px] text-ink-700">
                <Camera size={14} className="text-ink-400" />
                {m.photo_used}
                <span className="text-ink-400">·</span>
                <span className="text-ink-500">{m.photo_balance} {t.contract.left}</span>
              </span>

              {isNow ? (
                <span className="pill bg-brand-50 text-brand-600 ring-brand-100">
                  {t.contract.thisMonth}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
