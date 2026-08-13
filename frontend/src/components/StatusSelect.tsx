"use client";

import { ALL_WORK_STATUSES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/provider";
import type { WorkStatus } from "@/lib/types";

export function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: WorkStatus;
  onChange: (next: WorkStatus) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <select
      className="input !w-auto !py-1.5 !text-[13px]"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as WorkStatus)}
    >
      {ALL_WORK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {(t.status as Record<string, string>)[s]}
        </option>
      ))}
    </select>
  );
}
