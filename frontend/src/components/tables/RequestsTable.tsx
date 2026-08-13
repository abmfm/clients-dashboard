"use client";

import { CalendarClock } from "lucide-react";

import { RequestDetails } from "../RequestDetails";
import { EmptyRow, TableWrap } from "../ui/Table";
import { StatusBadge } from "../ui/StatusBadge";
import { useI18n } from "@/lib/i18n/provider";
import type { SessionRequest } from "@/lib/types";
import { cx, formatDate } from "@/lib/utils";

export function RequestsTable({
  requests,
  showClient = false,
  renderActions,
}: {
  requests: SessionRequest[];
  showClient?: boolean;
  renderActions?: (request: SessionRequest) => React.ReactNode;
}) {
  const { t, locale } = useI18n();

  return (
    <TableWrap>
      <thead className="bg-ink-50/70">
        <tr>
          <th className="th">{t.client.request}</th>
          {showClient ? <th className="th">{t.common.client}</th> : null}
          <th className="th">{t.client.kind}</th>
          <th className="th">{t.common.date}</th>
          <th className="th">{t.common.status}</th>
          <th className="th">{t.common.details}</th>
          {renderActions ? <th className="th text-end">{t.common.actions}</th> : null}
        </tr>
      </thead>
      <tbody className="row-divider bg-surface">
        {requests.length === 0 ? (
          <EmptyRow colSpan={showClient ? 7 : 6} label={t.common.noData} />
        ) : (
          requests.map((r, i) => (
            <tr
              key={r.id}
              className={cx("row-hover anim-fade-in stagger", r.cancelled_at && "row-cancelled")}
              style={{ "--d": `${i * 45}ms` } as React.CSSProperties}
            >
              <td className="td">
                <div className="flex items-center gap-3">
                  <span
                    className={
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl " +
                      (r.cancelled_at
                        ? "bg-ink-100 text-ink-400"
                        : r.is_extra
                          ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"
                          : "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300")
                    }
                  >
                    <CalendarClock size={18} strokeWidth={1.9} />
                  </span>
                  <div>
                    <p className="font-medium text-ink-900">
                      <span className="cancellable">{r.title}</span>
                    </p>
                    <p className="text-[12.5px] text-ink-400">{r.session_type}</p>
                  </div>
                </div>
              </td>
              {showClient ? (
                <td className="td text-ink-600">{r.client?.full_name ?? t.common.none}</td>
              ) : null}
              <td className="td">
                <span
                  className={
                    r.is_extra
                      ? "pill bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300 ring-violet-200"
                      : "pill bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 ring-sky-200"
                  }
                >
                  {r.is_extra ? t.client.kindExtra : t.client.kindPackage}
                </span>
              </td>
              <td className="td ltr-nums text-ink-500">
                {formatDate(r.preferred_date ?? r.created_at, locale)}
              </td>
              <td className="td">
                {r.cancelled_at ? (
                  <span className="pill bg-ink-100 text-ink-500 ring-ink-200">
                    <span className="pill-dot" />
                    {t.reschedule.cancelBadge}
                  </span>
                ) : (
                  <StatusBadge status={r.status} />
                )}
              </td>
              <td className="td max-w-[300px] whitespace-normal text-ink-500">
                <div className="flex items-center justify-between gap-3">
                  <span className="line-clamp-2">
                    {r.admin_note || r.notes || t.common.none}
                  </span>
                  <RequestDetails request={r} />
                </div>
              </td>
              {renderActions ? <td className="td text-end">{renderActions(r)}</td> : null}
            </tr>
          ))
        )}
      </tbody>
    </TableWrap>
  );
}
