"use client";

import { Check, Loader2, Stethoscope, X } from "lucide-react";
import { useState } from "react";

import { PageHeading } from "@/components/PageHeading";
import { Card } from "@/components/ui/Card";
import { Alert, Field } from "@/components/ui/Field";
import { useI18n } from "@/lib/i18n/provider";

interface Step {
  step: string;
  ok: boolean;
  detail: string;
}

export function DiagnoseView() {
  const { t } = useI18n();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSteps([]);
    setVerdict(null);

    const response = await fetch("/api/admin/test-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? "Could not run the check.");
      return;
    }

    setSteps((data.steps as Step[]) ?? []);
    setVerdict((data.verdict as string) ?? null);
  }

  return (
    <>
      <PageHeading title={t.diagnose.title} subtitle={t.diagnose.subtitle} />

      <div className="grid max-w-3xl gap-6">
        <Card className="card-pad">
          <form onSubmit={run} className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.login.identifier} required>
                <input
                  className="input ltr-nums font-mono"
                  dir="ltr"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </Field>
              <Field label={t.login.password}>
                <input
                  className="input ltr-nums font-mono"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </div>

            <button className="btn-dark" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Stethoscope size={16} />}
              {t.diagnose.run}
            </button>
            <p className="text-[12px] text-ink-400">{t.diagnose.hint}</p>
          </form>
        </Card>

        {steps.length > 0 ? (
          <Card className="card-pad">
            <ul className="space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className={
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full " +
                      (s.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")
                    }
                  >
                    {s.ok ? <Check size={13} /> : <X size={13} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-ink-900">{s.step}</p>
                    <p className="break-words font-mono text-[12.5px] text-ink-500" dir="ltr">
                      {s.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {verdict ? (
              <div className="mt-5 border-t border-ink-200/70 pt-4">
                <p
                  className={
                    "text-[14px] font-medium " +
                    (verdict === "ok" ? "text-emerald-700" : "text-rose-700")
                  }
                >
                  {(t.diagnose.verdicts as Record<string, string>)[verdict] ?? verdict}
                </p>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}
