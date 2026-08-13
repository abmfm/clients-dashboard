"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeading } from "@/components/PageHeading";
import { Card } from "@/components/ui/Card";
import { Alert, Field } from "@/components/ui/Field";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { formatDate, initials } from "@/lib/utils";

export function ProfileView({ profile }: { profile: Profile }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: profile.first_name,
    last_name: profile.last_name,
    phone: profile.phone ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const { error: updateError } = await createClient()
      .from("profiles")
      .update({ first_name: form.first_name, last_name: form.last_name, phone: form.phone || null })
      .eq("id", profile.id);

    setBusy(false);
    if (updateError) setError(updateError.message);
    else {
      setMessage(t.profile.saved);
      router.refresh();
    }
  }

  return (
    <>
      <PageHeading title={t.profile.title} subtitle={t.profile.subtitle} />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="card-pad h-fit">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-[18px] font-semibold text-brand-700">
              {initials(profile.full_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold text-ink-900">{profile.full_name}</p>
              <p className="ltr-nums truncate text-[13px] text-ink-400">@{profile.username}</p>
            </div>
          </div>

          <dl className="mt-6 space-y-3 text-[13.5px]">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">{t.profile.package}</dt>
              <dd className="text-end font-medium text-ink-900">
                {profile.package_name ?? t.common.none}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">{t.client.totalSessions}</dt>
              <dd className="ltr-nums font-medium text-ink-900">{profile.session_limit}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">{t.profile.memberSince}</dt>
              <dd className="ltr-nums font-medium text-ink-900">
                {formatDate(profile.created_at, locale)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="card-pad">
          <form onSubmit={save} className="max-w-lg space-y-4">
            {message ? <Alert tone="success">{message}</Alert> : null}
            {error ? <Alert tone="error">{error}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.profile.firstName} required>
                <input
                  className="input"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  required
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

            <Field label={t.profile.phone} optional optionalLabel={t.common.optional}>
              <input
                className="input ltr-nums"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>

            <button className="btn-dark" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {busy ? t.common.saving : t.common.save}
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
