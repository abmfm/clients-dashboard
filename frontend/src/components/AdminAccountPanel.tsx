"use client";

import { Loader2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card } from "./ui/Card";
import { Alert, Field } from "./ui/Field";
import { useI18n } from "@/lib/i18n/provider";
import type { Profile } from "@/lib/types";

/**
 * Hands the studio account to a different person.
 *
 * The same profile is edited rather than a new admin created, so every client,
 * session and calendar connection stays attached.
 */
export function AdminAccountPanel({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const router = useRouter();

  const [form, setForm] = useState({
    email: profile.login_email,
    username: profile.username,
    first_name: profile.first_name,
    last_name: profile.last_name,
    password: "",
  });

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);

    const response = await fetch("/api/admin/change-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await response.json();
    setBusy(false);

    if (!response.ok) return setError(data.error ?? "Could not update the account.");
    if (data.verified === false) return setError(data.verifyError ?? "Could not verify sign-in.");

    setDone(true);
    setForm({ ...form, password: "" });
    router.refresh();
  }

  return (
    <Card className="card-pad">
      <div className="mb-4 flex items-center gap-2">
        <UserCog size={18} className="text-ink-400" />
        <h2 className="section-title">{t.account.title}</h2>
      </div>
      <p className="section-sub mb-5 !mt-0">{t.account.subtitle}</p>

      <form onSubmit={save} className="max-w-md space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {done ? <Alert tone="success">{t.account.saved}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.profile.firstName} required>
            <input
              className="input"
              required
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </Field>
          <Field label={t.profile.lastName}>
            <input
              className="input"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </Field>
        </div>

        <Field label={t.account.email} hint={t.account.emailHint} required>
          <input
            type="email"
            className="input ltr-nums"
            dir="ltr"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label={t.account.username} required>
          <input
            className="input ltr-nums"
            dir="ltr"
            required
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </Field>

        <Field label={t.account.newPassword} hint={t.account.newPasswordHint} optional
          optionalLabel={t.common.optional}>
          <input
            type="text"
            className="input ltr-nums"
            dir="ltr"
            autoComplete="off"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <Alert tone="info">{t.account.warning}</Alert>

        <button className="btn-dark" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          {t.account.save}
        </button>
      </form>
    </Card>
  );
}
