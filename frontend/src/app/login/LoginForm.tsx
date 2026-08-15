"use client";

import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Alert, Field } from "@/components/ui/Field";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";

function Form() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const supabase = createClient();
    let email = identifier.trim();

    try {
      // Clients sign in with a username; resolve it to the stored login email.
      if (!email.includes("@")) {
        const { data, error: rpcError } = await supabase.rpc("email_for_username", {
          p_username: email,
        });

        if (rpcError) {
          setError(`${t.login.unknownUser} (${rpcError.message})`);
          setBusy(false);
          return;
        }
        if (!data) {
          setError(t.login.unknownUser);
          setBusy(false);
          return;
        }
        email = data as string;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        // Never swallow the real reason - an expired key or an unconfirmed
        // address looks identical to a typo otherwise.
        const detail = signInError.message?.toLowerCase().includes("invalid login")
          ? null
          : signInError.message;
        setError(detail ? `${t.login.error} (${detail})` : t.login.error);
        setBusy(false);
        return;
      }

      // Sign-in succeeded. Everything past this point is routing, not auth, so
      // it must never be reported as a credentials problem.
      //
      // Landing on "/" lets the server read the role and redirect. Doing that
      // lookup here instead meant a hiccup in an unrelated query surfaced as
      // "invalid password" on a login that had actually worked.
      const next = params.get("next");
      const target = next && next !== "/" && !next.startsWith("/login") ? next : "/";

      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? `${t.login.error} (${err.message})` : t.login.error);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <div className="anim-fade-up mx-auto w-full max-w-[400px]">
          <div className="mb-10 flex items-center justify-between">
            <span className="text-[17px] font-semibold tracking-tight">{t.brand}</span>
            <div className="flex items-center gap-2">
              <ThemeToggle compact />
              <LanguageToggle compact />
            </div>
          </div>

          <h1
            className="anim-fade-up stagger text-[28px] font-semibold tracking-tight text-ink-900"
            style={{ "--d": "80ms" } as React.CSSProperties}
          >
            {t.login.title}
          </h1>
          <p
            className="anim-fade-up stagger mt-2 text-[14.5px] text-ink-500"
            style={{ "--d": "140ms" } as React.CSSProperties}
          >
            {t.login.subtitle}
          </p>

          <form
            onSubmit={onSubmit}
            className="anim-fade-up stagger mt-8 space-y-4"
            style={{ "--d": "200ms" } as React.CSSProperties}
          >
            {error ? (
              <div className="anim-scale-in">
                <Alert tone="error">{error}</Alert>
              </div>
            ) : null}

            <Field label={t.login.identifier} hint={t.login.identifierHint}>
              <input
                className="input ltr-nums"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                required
                dir="ltr"
              />
            </Field>

            <Field label={t.login.password}>
              <div className="relative">
                <input
                  className="input pe-11"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  required
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                  aria-label="Toggle password"
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>

            <button type="submit" disabled={busy} className="btn-dark group w-full">
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {busy ? t.login.signingIn : t.login.signIn}
              {busy ? null : (
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                />
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-ink-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_0%,rgba(124,71,245,0.55),transparent_60%),radial-gradient(90%_70%_at_100%_100%,rgba(56,189,248,0.35),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-end p-14 text-canvas">
          <p
            className="anim-fade-up stagger max-w-sm text-[30px] font-semibold leading-tight tracking-tight"
            style={{ "--d": "150ms" } as React.CSSProperties}
          >
            {t.login.tagline}
          </p>
        </div>
      </div>
    </main>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}
