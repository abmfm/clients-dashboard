"use client";

import { ArrowLeft, Copy, Eye, EyeOff, KeyRound, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ContractPanel } from "@/components/ContractPanel";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { RequestsTable } from "@/components/tables/RequestsTable";
import { SessionsTable } from "@/components/tables/SessionsTable";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type {
  ClientContract,
  PackageRow,
  Profile,
  SessionRequest,
  SessionRow,
} from "@/lib/types";
import { fill, formatDate, initials } from "@/lib/utils";

export function ClientDetailView({
  profile,
  sessions,
  requests,
  credentials,
  contract,
  packages,
}: {
  profile: Profile;
  sessions: SessionRow[];
  requests: SessionRequest[];
  credentials: { username: string; hasPassword: boolean } | null;
  contract: ClientContract | null;
  packages: PackageRow[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [packageId, setPackageId] = useState(profile.package_id ?? "");
  const [startDate, setStartDate] = useState(profile.contract_start ?? "");
  const [months, setMonths] = useState(profile.contract_months ?? 6);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [verified, setVerified] = useState<boolean | null>(null);

  // Issues a brand-new password through Supabase Auth. Use when a client says
  // their credentials do not work.
  async function resetPassword() {
    setResetting(true);
    setResetError(null);
    setSteps([]);
    setVerified(null);

    const response = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: profile.id }),
    });

    const data = await response.json();
    setResetting(false);

    setSteps((data.steps as string[]) ?? []);

    if (!response.ok) {
      setResetError(data.error ?? "Could not reset the password.");
      return;
    }

    setVerified(Boolean(data.verified));
    if (!data.verified && data.verifyError) setResetError(data.verifyError as string);

    setSecret(data.password as string);
    setReveal(true);
    router.refresh();
  }

  // The stored password is encrypted at rest; ask the server to decrypt it only
  // when the admin actually wants to read it.
  // Returns the value as well as storing it. Reading `secret` straight after
  // awaiting this would see the stale closure value, which silently made the
  // copy button copy nothing.
  async function loadSecret(): Promise<string | null> {
    if (secret) return secret;

    setLoadingSecret(true);
    const response = await fetch(`/api/admin/credentials/${profile.id}`);
    const data = await response.json();
    setLoadingSecret(false);

    if (!response.ok) return null;

    const value = data.password as string;
    setSecret(value);
    return value;
  }

  async function toggleReveal() {
    if (reveal) return setReveal(false);
    const value = await loadSecret();
    if (value) setReveal(true);
  }

  async function save() {
    setBusy(true);
    const chosen = packages.find((p) => p.id === packageId);

    await createClient()
      .from("profiles")
      .update({
        package_id: packageId || null,
        package_name: chosen?.name ?? null,
        contract_start: startDate || null,
        contract_months: months,
      })
      .eq("id", profile.id);
    setBusy(false);
    router.refresh();
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);

    const response = await fetch("/api/admin/delete-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: profile.id }),
    });

    const data = await response.json();

    if (!response.ok) {
      setDeleting(false);
      setDeleteError(data.error ?? "Could not delete this client.");
      return;
    }

    // The record no longer exists, so there is nothing to come back to.
    router.replace("/admin/clients");
    router.refresh();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <Link
        href="/admin/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft size={15} className="rtl:rotate-180" />
        {t.admin.clientsTitle}
      </Link>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
        busy={deleting}
        error={deleteError}
        title={t.admin.deleteClientTitle}
        message={fill(t.admin.deleteClientBody, { name: profile.full_name })}
        confirmLabel={t.admin.deleteClient}
        impacts={[
          fill(t.admin.deleteClientImpactSessions, { count: sessions.length }),
          t.admin.deleteClientImpactRequests,
          t.admin.deleteClientImpactLogin,
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Card className="card-pad">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-[18px] font-semibold text-brand-700">
                {initials(profile.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[17px] font-semibold text-ink-900">{profile.full_name}</p>
                <p className="ltr-nums truncate text-[13px] text-ink-400">@{profile.username}</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <Field label={t.contract.pickPackage}>
                <select
                  className="input"
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                >
                  <option value="">—</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.video_per_month}V + {p.photo_per_month}P
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.contract.startDate}>
                <input
                  type="date"
                  className="input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label={t.contract.months}>
                <input
                  type="number"
                  min={1}
                  max={36}
                  className="input ltr-nums"
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                />
              </Field>
              <button className="btn-dark w-full" onClick={save} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {t.common.save}
              </button>
              <p className="ltr-nums text-[12.5px] text-ink-400">
                {t.profile.memberSince}: {formatDate(profile.created_at, locale)}
              </p>
            </div>
          </Card>

          <Card className="card-pad border-rose-200/70">
            <h3 className="section-title text-rose-700">{t.admin.deleteClient}</h3>
            <p className="section-sub mb-4">
              {fill(t.admin.deleteClientBody, { name: profile.full_name })}
            </p>
            <button
              onClick={() => {
                setDeleteError(null);
                setConfirmOpen(true);
              }}
              className="btn w-full border border-rose-200 dark:border-rose-500/30 bg-surface text-rose-600 hover:bg-rose-50"
            >
              <Trash2 size={16} />
              {t.admin.deleteClient}
            </button>
          </Card>

          {credentials ? (
            <Card className="card-pad">
              <h3 className="section-title">{t.create.successTitle}</h3>
              <p className="section-sub mb-4">{t.create.successBody}</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5">
                  <span className="ltr-nums font-mono text-[13.5px] font-medium text-ink-900" dir="ltr">
                    {credentials.username}
                  </span>
                  <button
                    className="text-ink-400 hover:text-ink-800"
                    onClick={() => copy(credentials.username)}
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5">
                  <span
                    className="ltr-nums truncate font-mono text-[13.5px] font-medium text-ink-900"
                    dir="ltr"
                  >
                    {profile.login_email}
                  </span>
                  <button
                    className="shrink-0 text-ink-400 hover:text-ink-800"
                    onClick={() => copy(profile.login_email)}
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5">
                  <span className="ltr-nums font-mono text-[13.5px] font-medium text-ink-900" dir="ltr">
                    {reveal && secret ? secret : credentials.hasPassword ? "••••••••••••" : "—"}
                  </span>
                  <div className="flex items-center gap-2 text-ink-400">
                    <button
                      onClick={toggleReveal}
                      className="hover:text-ink-800 disabled:opacity-40"
                      disabled={loadingSecret || (!credentials.hasPassword && !secret)}
                    >
                      {loadingSecret ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : reveal ? (
                        <EyeOff size={15} />
                      ) : (
                        <Eye size={15} />
                      )}
                    </button>
                    <button
                      className="hover:text-ink-800"
                      onClick={async () => {
                        const value = await loadSecret();
                        if (value) copy(value);
                      }}
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                </div>
              </div>
              {copied ? <p className="mt-2 text-[12.5px] text-emerald-600">{t.common.copied}</p> : null}
              {resetError ? (
                <p className="mt-2 text-[12.5px] text-rose-600">{resetError}</p>
              ) : null}

              <button
                onClick={resetPassword}
                disabled={resetting}
                className="btn-ghost btn-sm mt-4 w-full"
              >
                {resetting ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                {t.admin.resetPassword}
              </button>
              <p className="mt-2 text-[12px] text-ink-400">{t.admin.resetPasswordHint}</p>

              {steps.length > 0 ? (
                <div className="mt-3 rounded-xl bg-ink-50 px-3.5 py-3">
                  <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-ink-400">
                    {t.admin.diagnostics}
                  </p>
                  <ul className="space-y-1">
                    {steps.map((line, i) => (
                      <li key={i} className="font-mono text-[11.5px] leading-snug text-ink-600" dir="ltr">
                        {line}
                      </li>
                    ))}
                  </ul>
                  {verified !== null ? (
                    <p
                      className={
                        "mt-2 text-[12.5px] font-medium " +
                        (verified ? "text-emerald-600" : "text-rose-600")
                      }
                    >
                      {verified ? t.admin.verifyPassed : t.admin.verifyFailed}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <ContractPanel contract={contract} />

          <Card>
            <CardHeader title={t.admin.sessionsTitle} />
            <SessionsTable sessions={sessions} />
          </Card>
          <Card>
            <CardHeader title={t.admin.requestsTitle} />
            <RequestsTable requests={requests} />
          </Card>
        </div>
      </div>
    </>
  );
}
