"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { LanguageToggle } from "./LanguageToggle";
import { PageHeading } from "./PageHeading";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ThemeToggle";
import { Card } from "./ui/Card";
import { Alert, Field } from "./ui/Field";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { cx } from "@/lib/utils";

function score(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

export function SettingsView({
  mustChangePassword,
  profileId,
  extra,
}: {
  mustChangePassword: boolean;
  profileId: string;
  /** Admin-only panels, rendered above the security section. */
  extra?: React.ReactNode;
}) {
  const { t } = useI18n();

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = score(pw);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (pw !== confirm) return setError(t.settings.passwordMismatch);
    if (strength < 3) return setError(t.settings.passwordWeak);

    setBusy(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password: pw });

    if (authError) {
      setBusy(false);
      return setError(authError.message);
    }

    await supabase.from("profiles").update({ must_change_password: false }).eq("id", profileId);
    // The one-time password is no longer valid, so clear the admin's copy.
    await supabase.from("client_credentials").update({ initial_password_enc: null }).eq("profile_id", profileId);

    setBusy(false);
    setDone(true);
    setPw("");
    setConfirm("");
  }

  return (
    <>
      <PageHeading title={t.settings.title} subtitle={t.settings.subtitle} />

      <div className="grid max-w-3xl gap-6">
        <Card className="card-pad">
          <h2 className="section-title">{t.settings.appearance}</h2>
          <p className="section-sub mb-4">{t.settings.appearanceHint}</p>
          <ThemeToggle />
        </Card>

        <Card className="card-pad">
          <h2 className="section-title">{t.settings.language}</h2>
          <p className="section-sub mb-4">{t.settings.languageHint}</p>
          <LanguageToggle />
        </Card>

        {extra}

        <Card className="card-pad">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck size={18} className="text-ink-400" />
            <h2 className="section-title">{t.settings.security}</h2>
          </div>

          {mustChangePassword ? (
            <div className="mb-4">
              <Alert tone="info">{t.settings.mustChange}</Alert>
            </div>
          ) : null}

          <form onSubmit={changePassword} className="max-w-md space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            {done ? <Alert tone="success">{t.settings.passwordChanged}</Alert> : null}

            <Field label={t.settings.newPassword} required>
              <input
                type="password"
                className="input"
                dir="ltr"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
              <div className="mt-2 flex gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={cx(
                      "h-1 flex-1 rounded-full transition",
                      i < strength
                        ? strength <= 2
                          ? "bg-amber-400"
                          : "bg-emerald-500"
                        : "bg-ink-200"
                    )}
                  />
                ))}
              </div>
            </Field>

            <Field label={t.settings.confirmPassword} required>
              <input
                type="password"
                className="input"
                dir="ltr"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>

            <button className="btn-dark" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {t.settings.changePassword}
            </button>
          </form>
        </Card>

        <Card className="card-pad">
          <SignOutButton className="btn-ghost" />
        </Card>
      </div>
    </>
  );
}
