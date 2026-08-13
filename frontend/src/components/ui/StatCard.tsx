"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/lib/utils";

const TONES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20",
  amber:
    "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
  green:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
  violet:
    "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20",
} as const;

export type StatTone = keyof typeof TONES;

/** Counts from 0 to the target, easing out. Skipped for reduced motion. */
function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const frame = useRef<number>(undefined);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return value;
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "blue",
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: StatTone;
  delay?: number;
}) {
  const shown = useCountUp(Number.isFinite(value) ? value : 0);

  return (
    <div
      className="card card-hover card-pad anim-fade-up stagger group"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <div className="flex items-start gap-4">
        <span
          className={cx(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
            "transition-transform duration-300 group-hover:scale-105",
            TONES[tone]
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-ink-500">{label}</p>
          <p className="ltr-nums mt-1 text-[30px] font-semibold leading-none tracking-tight text-ink-900 tabular-nums">
            {shown}
          </p>
        </div>
      </div>
      {hint ? <p className="mt-4 text-[12.5px] text-ink-400">{hint}</p> : null}
    </div>
  );
}
