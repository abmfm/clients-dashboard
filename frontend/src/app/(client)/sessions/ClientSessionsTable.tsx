"use client";

import { RescheduleButton } from "@/components/RescheduleButton";
import { SessionsTable } from "@/components/tables/SessionsTable";
import { useI18n } from "@/lib/i18n/provider";
import type { SessionRow } from "@/lib/types";

export function ClientSessionsTable({ sessions }: { sessions: SessionRow[] }) {
  const { t } = useI18n();

  return (
    <SessionsTable
      sessions={sessions}
      renderActions={(s) =>
        s.status === "cancelled" ? (
          <span className="pill bg-ink-100 text-ink-500 ring-ink-200">
            {t.reschedule.cancelBadge}
          </span>
        ) : (
          <RescheduleButton session={s} />
        )
      }
    />
  );
}
