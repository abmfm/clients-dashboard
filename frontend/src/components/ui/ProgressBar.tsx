import { cx } from "@/lib/utils";

export function ProgressBar({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone = clamped >= 100 ? "bg-emerald-500" : clamped > 0 ? "bg-blue-500" : "bg-ink-300";

  return (
    <div className="min-w-[140px]">
      {showLabel ? (
        <p className="ltr-nums mb-1.5 text-[13px] font-medium tabular-nums text-ink-700">
          {clamped}%
        </p>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={cx("anim-grow-x h-full rounded-full", tone)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
