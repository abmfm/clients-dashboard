"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";

import { PageHeading } from "@/components/PageHeading";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyRow, TableWrap } from "@/components/ui/Table";
import { useI18n } from "@/lib/i18n/provider";
import type { Profile } from "@/lib/types";
import { cx, fill, formatDate, initials } from "@/lib/utils";

export interface ClientRow extends Profile {
  session_count: number;
  project_count: number;
  active_projects: number;
}

export function AdminClientsView({ clients }: { clients: ClientRow[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<ClientRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!target) return;
    setBusy(true);
    setError(null);

    const response = await fetch("/api/admin/delete-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: target.id }),
    });

    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? "Could not delete this client.");
      return;
    }

    setTarget(null);
    router.refresh();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        (c.package_name ?? "").toLowerCase().includes(q)
    );
  }, [clients, query]);

  return (
    <>
      <PageHeading
        title={t.admin.clientsTitle}
        subtitle={t.admin.clientsSubtitle}
        action={
          <Link href="/admin/create" className="btn-dark">
            + {t.create.openButton}
          </Link>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          className="input ps-10"
          placeholder={t.common.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card className="pt-5">
        <TableWrap>
          <thead className="bg-ink-50/70">
            <tr>
              <th className="th">{t.common.client}</th>
              <th className="th">{t.admin.username}</th>
              <th className="th">{t.admin.package}</th>
              <th className="th">{t.nav.sessions}</th>
              <th className="th">{t.nav.projects}</th>
              <th className="th">{t.admin.account}</th>
              <th className="th">{t.profile.memberSince}</th>
              <th className="th text-end">{t.common.actions}</th>
            </tr>
          </thead>
          <tbody className="row-divider bg-surface">
            {filtered.length === 0 ? (
              <EmptyRow colSpan={8} label={t.common.noData} />
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="transition hover:bg-ink-50/40">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-[12.5px] font-semibold text-brand-700">
                        {initials(c.full_name)}
                      </span>
                      <span className="font-medium text-ink-900">{c.full_name}</span>
                    </div>
                  </td>
                  <td className="td ltr-nums text-ink-600">@{c.username}</td>
                  <td className="td text-ink-600">{c.package_name ?? t.common.none}</td>
                  <td className="td ltr-nums text-ink-600">
                    {c.session_count} / {c.session_limit}
                  </td>
                  <td className="td ltr-nums text-ink-600">
                    {c.project_count}
                    {c.active_projects > 0 ? (
                      <span className="ms-2 text-[12px] text-blue-600">
                        ({c.active_projects} {t.status.in_progress.toLowerCase()})
                      </span>
                    ) : null}
                  </td>
                  <td className="td">
                    <span
                      className={cx(
                        "pill",
                        c.status === "active"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 ring-emerald-200"
                          : "bg-ink-100 text-ink-500 ring-ink-200"
                      )}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="td ltr-nums text-ink-500">{formatDate(c.created_at, locale)}</td>
                  <td className="td text-end">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/clients/${c.id}`} className="btn-ghost btn-sm">
                        {t.common.view}
                      </Link>
                      <button
                        onClick={() => {
                          setError(null);
                          setTarget(c);
                        }}
                        className="btn-ghost btn-sm !px-2 text-ink-400 hover:!border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 hover:text-rose-600"
                        aria-label={t.admin.deleteClient}
                        title={t.admin.deleteClient}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Card>

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={confirmDelete}
        busy={busy}
        error={error}
        title={t.admin.deleteClientTitle}
        message={fill(t.admin.deleteClientBody, { name: target?.full_name ?? "" })}
        confirmLabel={t.admin.deleteClient}
        impacts={[
          fill(t.admin.deleteClientImpactSessions, { count: target?.session_count ?? 0 }),
          fill(t.admin.deleteClientImpactProjects, { count: target?.project_count ?? 0 }),
          t.admin.deleteClientImpactRequests,
          t.admin.deleteClientImpactLogin,
        ]}
      />
    </>
  );
}
