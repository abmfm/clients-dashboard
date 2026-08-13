"use client";

import { EmptyRow, TableWrap } from "../ui/Table";
import { StatusBadge } from "../ui/StatusBadge";
import { useI18n } from "@/lib/i18n/provider";
import type { SessionRow } from "@/lib/types";
import { cx, formatDateTime } from "@/lib/utils";

export function SessionsTable({
  sessions,
  showClient = false,
  renderActions,
}: {
  sessions: SessionRow[];
  showClient?: boolean;
  renderActions?: (session: SessionRow) => React.ReactNode;
}) {
  const { t, locale } = useI18n();

  return (
    <TableWrap>
      <thead className="bg-ink-50/70">
        <tr>
          <th className="th">{t.common.name}</th>
          {showClient ? <th className="th">{t.common.client}</th> : null}
          <th className="th">{t.common.type}</th>
          <th className="th">{t.common.date}</th>
          <th className="th">{t.common.status}</th>
          <th className="th">{t.common.details}</th>
          {renderActions ? <th className="th text-end">{t.common.actions}</th> : null}
        </tr>
      </thead>
      <tbody className="row-divider bg-surface">
        {sessions.length === 0 ? (
          <EmptyRow colSpan={showClient ? 7 : 6} label={t.common.noData} />
        ) : (
          sessions.map((s, i) => (
            <tr
              key={s.id}
              className={cx(
                "row-hover anim-fade-in stagger",
                s.status === "cancelled" && "row-cancelled"
              )}
              style={{ "--d": `${i * 45}ms` } as React.CSSProperties}
            >
              <td className="td font-medium text-ink-900">
                <span className="cancellable">{s.title}</span>
                {s.reschedule_status === "pending" ? (
                  <span className="ms-2 pill bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25">
                    <span className="pill-dot" />
                    {t.reschedule.pendingBadge}
                  </span>
                ) : null}
              </td>
              {showClient ? (
                <td className="td text-ink-600">{s.client?.full_name ?? t.common.none}</td>
              ) : null}
              <td className="td text-ink-600">{s.session_type}</td>
              <td className="td ltr-nums text-ink-500">
                <span className="cancellable">{formatDateTime(s.scheduled_at, locale)}</span>
                {s.reschedule_status === "pending" && s.reschedule_requested_for ? (
                  <span className="block text-[12px] text-amber-600 dark:text-amber-400">
                    → {formatDateTime(s.reschedule_requested_for, locale)}
                  </span>
                ) : null}
              </td>
              <td className="td">
                <StatusBadge status={s.status} />
              </td>
              <td className="td text-ink-500">
                <span
                  className={
                    s.is_extra
                      ? "pill bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300 ring-violet-200"
                      : "pill bg-ink-100 text-ink-600 ring-ink-200"
                  }
                >
                  {s.is_extra ? t.client.extraSession : t.client.included}
                </span>
              </td>
              {renderActions ? <td className="td text-end">{renderActions(s)}</td> : null}
            </tr>
          ))
        )}
      </tbody>
    </TableWrap>
  );
}
