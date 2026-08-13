"use client";

import { Languages } from "lucide-react";

import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/utils";

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();

  if (compact) {
    return (
      <button
        onClick={() => setLocale(locale === "en" ? "ar" : "en")}
        className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-surface px-2.5 py-2 text-[13px] font-medium text-ink-600 transition hover:bg-ink-50"
        title="English / العربية"
      >
        <Languages size={16} />
        {locale === "en" ? "AR" : "EN"}
      </button>
    );
  }

  return (
    <div className="inline-flex rounded-xl border border-ink-200 bg-surface p-1">
      {(["en", "ar"] as const).map((code) => (
        <button
          key={code}
          onClick={() => setLocale(code)}
          className={cx(
            "rounded-lg px-4 py-1.5 text-[13px] font-medium transition",
            locale === code ? "bg-ink-900 text-canvas" : "text-ink-500 hover:text-ink-800"
          )}
        >
          {code === "en" ? "English" : "العربية"}
        </button>
      ))}
    </div>
  );
}
