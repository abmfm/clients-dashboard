"use client";

import { Field } from "./Field";
import { SESSION_TYPES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/provider";

export const OTHER = "Other";

/**
 * Session type dropdown that reveals a free-text field when "Other" is chosen.
 *
 * The parent keeps two pieces of state - the picked option and the typed text -
 * and calls `resolveSessionType` at submit time. Keeping them separate means
 * switching away from "Other" and back does not lose what was typed.
 */
export function SessionTypePicker({
  value,
  custom,
  onChange,
  onCustomChange,
  required = true,
}: {
  value: string;
  custom: string;
  onChange: (value: string) => void;
  onCustomChange: (value: string) => void;
  required?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <Field label={t.requestForm.sessionType} required={required}>
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          {SESSION_TYPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      {value === OTHER ? (
        <div className="anim-fade-up">
          <Field label={t.requestForm.otherType} required>
            <input
              className="input"
              required
              maxLength={60}
              placeholder={t.requestForm.otherTypePlaceholder}
              value={custom}
              onChange={(e) => onCustomChange(e.target.value)}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** What actually gets stored: the typed text when "Other", otherwise the option. */
export function resolveSessionType(value: string, custom: string) {
  return value === OTHER ? custom.trim() || OTHER : value;
}
