"use client";

import { STATUS_STYLES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/provider";
import type { RequestStatus, WorkStatus } from "@/lib/types";
import { cx, titleCase } from "@/lib/utils";

export function StatusBadge({ status }: { status: WorkStatus | RequestStatus }) {
  const { t } = useI18n();
  const label = (t.status as Record<string, string>)[status] ?? titleCase(status);
  return (
    <span className={cx("pill", STATUS_STYLES[status])}>
      <span className="pill-dot" />
      {label}
    </span>
  );
}

export function TypeBadge({ type, label: custom }: { type: string; label?: string | null }) {
  const { t } = useI18n();
  // A project typed as "other" carries its own name.
  const label = custom?.trim() || (t.types as Record<string, string>)[type] || titleCase(type);
  return (
    <span className="inline-flex items-center rounded-lg bg-ink-100 px-2.5 py-1 text-[12.5px] font-medium text-ink-600">
      {label}
    </span>
  );
}
