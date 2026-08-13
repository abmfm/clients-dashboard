"use client";

import { CheckCircle2, Copy, Eye, EyeOff, KeyRound, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeading } from "@/components/PageHeading";
import { Card } from "@/components/ui/Card";
import { Alert, Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n/provider";

interface CreatedClient {
  id: string;
  username: string;
  password: string;
  login_email: string;
  full_name: string;
  session_limit: number;
  verified: boolean;
  verifyError: string | null;
}

export function CreateClientView() {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedClient | null>(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    session_count: "",
    package_name: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          session_count: form.session_count === "" ? null : Number(form.session_count),
          package_name: form.package_name || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Something went wrong.");

      setResult(data as CreatedClient);
      setOpen(false);
      setReveal(false);
      setForm({ first_name: "", last_name: "", session_count: "", package_name: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <>
      <PageHeading title={t.create.title} subtitle={t.create.subtitle} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="card-pad">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <UserPlus size={24} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="section-title">{t.create.openButton}</h2>
              <p className="section-sub">{t.create.subtitle}</p>
            </div>
            <button className="btn-dark shrink-0" onClick={() => setOpen(true)}>
              <UserPlus size={17} />
              {t.create.openButton}
            </button>
          </div>

          {result ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 size={18} />
                <p className="text-[15px] font-semibold">{t.create.successTitle}</p>
              </div>
              <p className="mt-1 text-[13.5px] text-emerald-800/80 dark:text-emerald-300/80">{t.create.successBody}</p>
              <p className="mt-3 text-[14px] font-medium text-ink-900">{result.full_name}</p>

              <div className="mt-4 space-y-2">
                <CredentialRow
                  label={t.create.username}
                  value={result.username}
                  onCopy={() => copy("u", result.username)}
                  copied={copied === "u"}
                  copyLabel={t.common.copied}
                />
                <CredentialRow
                  label={t.create.loginEmail}
                  value={result.login_email}
                  onCopy={() => copy("e", result.login_email)}
                  copied={copied === "e"}
                  copyLabel={t.common.copied}
                />
                <CredentialRow
                  label={t.create.password}
                  value={reveal ? result.password : "••••••••••••••"}
                  onCopy={() => copy("p", result.password)}
                  copied={copied === "p"}
                  copyLabel={t.common.copied}
                  extra={
                    <button
                      onClick={() => setReveal((v) => !v)}
                      className="text-ink-400 transition hover:text-ink-800"
                      aria-label="Toggle password"
                    >
                      {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  }
                />
              </div>

              <p
                className={
                  "mt-3 text-[12.5px] font-medium " +
                  (result.verified ? "text-emerald-700" : "text-rose-600")
                }
              >
                {result.verified
                  ? t.admin.verifyPassed
                  : `${t.admin.verifyFailed} ${result.verifyError ?? ""}`}
              </p>
              <p className="mt-1 text-[12px] text-ink-500">{t.create.eitherWorks}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn-ghost btn-sm"
                  onClick={() =>
                    copy(
                      "both",
                      `Username: ${result.username}\nEmail: ${result.login_email}\nPassword: ${result.password}`
                    )
                  }
                >
                  <Copy size={15} />
                  {copied === "both" ? t.common.copied : t.create.copyBoth}
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
                  {t.create.createAnother}
                </button>
                <Link href="/admin/clients" className="btn-ghost btn-sm">
                  {t.create.goToClients}
                </Link>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="card-pad h-fit">
          <div className="mb-3 flex items-center gap-2">
            <KeyRound size={17} className="text-ink-400" />
            <h2 className="section-title">{t.create.password}</h2>
          </div>
          <ul className="space-y-3 text-[13.5px] text-ink-600">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              {t.create.ruleUsername}
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              {t.create.rulePassword}
            </li>
          </ul>
          <div className="mt-4 rounded-xl bg-ink-50 px-3.5 py-3 font-mono text-[12.5px] text-ink-600">
            <p dir="ltr">Sarah + M + 482 + # → SarahM482#</p>
          </div>
        </Card>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t.create.title} subtitle={t.create.subtitle}>
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.create.firstName} required>
              <input
                className="input"
                required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </Field>
            <Field label={t.create.lastName} required>
              <input
                className="input"
                required
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </Field>
          </div>

          <Field
            label={t.create.sessionCount}
            hint={t.create.sessionCountHint}
            optional
            optionalLabel={t.common.optional}
          >
            <input
              type="number"
              min={0}
              max={999}
              className="input ltr-nums"
              value={form.session_count}
              onChange={(e) => setForm({ ...form, session_count: e.target.value })}
            />
          </Field>

          <Field label={t.create.packageName} optional optionalLabel={t.common.optional}>
            <input
              className="input"
              placeholder="Standard Package"
              value={form.package_name}
              onChange={(e) => setForm({ ...form, package_name: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button className="btn-dark" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {busy ? t.create.creating : t.create.submit}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function CredentialRow({
  label,
  value,
  onCopy,
  copied,
  copyLabel,
  extra,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  copyLabel: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200/70 bg-surface px-3.5 py-2.5 dark:border-emerald-500/25">
      <div className="min-w-0">
        <p className="text-[11.5px] uppercase tracking-wide text-ink-400">{label}</p>
        <p className="ltr-nums truncate font-mono text-[14px] font-medium text-ink-900" dir="ltr">
          {value}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {extra}
        <button onClick={onCopy} className="text-ink-400 transition hover:text-ink-800" aria-label="Copy">
          <Copy size={15} />
        </button>
      </div>
    </div>
  );
}
