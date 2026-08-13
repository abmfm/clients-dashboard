"use client";

import { EmptyRow, TableWrap } from "../ui/Table";
import { ProgressBar } from "../ui/ProgressBar";
import { StatusBadge, TypeBadge } from "../ui/StatusBadge";
import { useI18n } from "@/lib/i18n/provider";
import type { Project } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function ProjectsTable({
  projects,
  showClient = false,
  renderActions,
}: {
  projects: Project[];
  showClient?: boolean;
  renderActions?: (project: Project) => React.ReactNode;
}) {
  const { t, locale } = useI18n();

  return (
    <TableWrap>
      <thead className="bg-ink-50/70">
        <tr>
          <th className="th">{t.client.project}</th>
          {showClient ? <th className="th">{t.common.client}</th> : null}
          <th className="th">{t.common.type}</th>
          <th className="th">{t.common.status}</th>
          <th className="th">{t.common.progress}</th>
          <th className="th">{t.common.lastUpdate}</th>
          {renderActions ? <th className="th text-end">{t.common.actions}</th> : null}
        </tr>
      </thead>
      <tbody className="row-divider bg-surface">
        {projects.length === 0 ? (
          <EmptyRow colSpan={showClient ? 7 : 6} label={t.common.noData} />
        ) : (
          projects.map((p, i) => (
            <tr key={p.id} className="row-hover anim-fade-in stagger"
              style={{ "--d": `${i * 45}ms` } as React.CSSProperties}>
              <td className="td font-medium text-ink-900">{p.name}</td>
              {showClient ? (
                <td className="td text-ink-600">{p.client?.full_name ?? t.common.none}</td>
              ) : null}
              <td className="td">
                <TypeBadge type={p.type} label={p.type_label} />
              </td>
              <td className="td">
                <StatusBadge status={p.status} />
              </td>
              <td className="td">
                <ProgressBar value={p.progress} />
              </td>
              <td className="td ltr-nums text-ink-500">{formatDate(p.updated_at, locale)}</td>
              {renderActions ? <td className="td text-end">{renderActions(p)}</td> : null}
            </tr>
          ))
        )}
      </tbody>
    </TableWrap>
  );
}
