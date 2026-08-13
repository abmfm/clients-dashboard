import { cx } from "@/lib/utils";

export function Field({
  label,
  hint,
  required,
  optional,
  optionalLabel = "Optional",
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  optionalLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label">
          {label}
          {required ? <span className="text-rose-500"> *</span> : null}
        </label>
        {optional ? <span className="text-[12px] text-ink-400">{optionalLabel}</span> : null}
      </div>
      {children}
      {hint ? <p className="mt-1.5 text-[12px] text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    error:
      "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25",
    success:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
    info: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25",
  } as const;

  return (
    <div className={cx("rounded-xl px-4 py-3 text-[13.5px] ring-1 ring-inset", tones[tone])}>
      {children}
    </div>
  );
}
