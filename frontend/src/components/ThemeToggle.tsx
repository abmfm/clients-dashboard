"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useI18n } from "@/lib/i18n/provider";
import { useTheme, type Theme } from "@/lib/theme/provider";
import { cx } from "@/lib/utils";

const OPTIONS: { value: Theme; icon: React.ElementType }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { theme, resolved, setTheme } = useTheme();

  if (compact) {
    // One button that flips between light and dark, ignoring "system" so a
    // single click always does the obvious thing.
    const next = resolved === "dark" ? "light" : "dark";
    const Icon = resolved === "dark" ? Sun : Moon;

    return (
      <button
        onClick={() => setTheme(next)}
        className="rounded-xl border border-ink-200 bg-surface p-2 text-ink-600 transition hover:bg-ink-50"
        aria-label={t.theme[next]}
        title={t.theme[next]}
      >
        <Icon size={16} />
      </button>
    );
  }

  return (
    <div className="inline-flex rounded-xl border border-ink-200 bg-surface p-1">
      {OPTIONS.map(({ value, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={cx(
            "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition",
            theme === value ? "bg-ink-900 text-surface" : "text-ink-500 hover:text-ink-800"
          )}
        >
          <Icon size={15} />
          {t.theme[value]}
        </button>
      ))}
    </div>
  );
}
