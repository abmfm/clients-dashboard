"use client";

import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ProjectCard } from "@/components/ProjectCard";
import { PageHeading } from "@/components/PageHeading";
import { StatusSelect } from "@/components/StatusSelect";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert, Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { WORK_TYPES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/provider";
import { syncSessionToCalendar } from "@/lib/calendar/client";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Project, SessionRow, WorkStatus, WorkType } from "@/lib/types";
import { cx, fill } from "@/lib/utils";

type ClientOption = Pick<Profile, "id" | "full_name" | "username">;

export function AdminProjectsView({
  projects,
  clients,
  sessions,
}: {
  projects: Project[];
  clients: ClientOption[];
  sessions: SessionRow[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = createClient();

  const [clientFilter, setClientFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [unfiling, setUnfiling] = useState<{ session: SessionRow; project: Project } | null>(null);

  const [form, setForm] = useState({
    client_id: "",
    name: "",
    type: "photos" as WorkType,
    type_label: "",
  });

  const visible = useMemo(
    () => (clientFilter === "all" ? projects : projects.filter((p) => p.client_id === clientFilter)),
    [projects, clientFilter]
  );

  /** Sessions belonging to this client that are not filed anywhere yet. */
  function unfiled(project: Project) {
    return sessions.filter((s) => s.client_id === project.client_id && !s.project_id);
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: insertError } = await supabase.from("projects").insert({
      client_id: form.client_id,
      name: form.name,
      type: form.type,
      type_label: form.type === "other" ? form.type_label.trim() || null : null,
      status: "pending_approval",
      progress: 0,
    });

    setBusy(false);
    if (insertError) return setError(insertError.message);

    setOpen(false);
    setForm({ client_id: "", name: "", type: "photos", type_label: "" });
    router.refresh();
  }

  /**
   * Moving a session through the workflow from here. The database advances the
   * session's own progress and re-averages the project, so nothing needs to be
   * recalculated in the browser - a refresh shows both new numbers.
   */
  async function updateSessionStatus(session: SessionRow, status: WorkStatus) {
    setStatusBusy(session.id);

    await supabase.from("sessions").update({ status }).eq("id", session.id);

    // The event description carries the status, so keep Google in step.
    if (session.scheduled_at && session.google_event_id) {
      await syncSessionToCalendar({ session_id: session.id });
    }

    setStatusBusy(null);
    router.refresh();
  }

  /** Filing a session updates its row; the database rolls the progress up. */
  async function fileSession(projectId: string | null, sessionId: string) {
    setAssigning(sessionId);
    await supabase.from("sessions").update({ project_id: projectId }).eq("id", sessionId);
    setAssigning(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);

    const { error: removeError } = await supabase.from("projects").delete().eq("id", target.id);
    setDeleting(false);

    if (removeError) return setError(removeError.message);

    setTarget(null);
    router.refresh();
  }

  return (
    <>
      <PageHeading
        title={t.projects.title}
        subtitle={t.projects.subtitle}
        action={
          <button className="btn-dark" onClick={() => setOpen(true)}>
            <Plus size={17} />
            {t.projects.newProject}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setClientFilter("all")}
          className={cx(
            "rounded-xl px-3.5 py-2 text-[13px] font-medium transition",
            clientFilter === "all"
              ? "bg-ink-900 text-surface"
              : "border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50"
          )}
        >
          {t.common.all}
        </button>
        {clients.map((c) => (
          <button
            key={c.id}
            onClick={() => setClientFilter(c.id)}
            className={cx(
              "rounded-xl px-3.5 py-2 text-[13px] font-medium transition",
              clientFilter === c.id
                ? "bg-ink-900 text-surface"
                : "border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50"
            )}
          >
            {c.full_name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="card-pad text-center text-[14px] text-ink-400">{t.common.noData}</Card>
      ) : (
        <div className="space-y-4">
          {visible.map((p, i) => (
            <div key={p.id}>
              <ProjectCard
                project={p}
                showClient
                delay={i * 60}
                actions={
                  <>
                    <AddSessionMenu
                      options={unfiled(p)}
                      busyId={assigning}
                      onPick={(id) => fileSession(p.id, id)}
                    />
                    <button
                      onClick={() => setTarget(p)}
                      className="btn-ghost btn-sm !px-2 text-ink-400 hover:!border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={t.projects.deleteProject}
                      title={t.projects.deleteProject}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                }
                sessionActions={(s) => (
                  <div className="flex items-center gap-2">
                    <StatusSelect
                      value={s.status}
                      disabled={statusBusy === s.id}
                      onChange={(next) => updateSessionStatus(s, next)}
                    />
                    {statusBusy === s.id ? (
                      <Loader2 size={14} className="animate-spin text-ink-400" />
                    ) : null}
                    <button
                      onClick={() => setUnfiling({ session: s, project: p })}
                      disabled={assigning === s.id}
                      className="btn-ghost btn-sm text-ink-500 hover:!border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      title={t.projects.removeHint}
                    >
                      {assigning === s.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <X size={14} />
                      )}
                      <span className="hidden sm:inline">{t.projects.remove}</span>
                    </button>
                  </div>
                )}
              />
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t.projects.newProject}>
        <form onSubmit={createProject} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <Field label={t.common.client} required>
            <select
              className="input"
              required
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            >
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t.projects.name} required>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field label={t.common.type}>
            <select
              className="input"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as WorkType })}
            >
              {WORK_TYPES.map((w) => (
                <option key={w} value={w}>
                  {(t.types as Record<string, string>)[w]}
                </option>
              ))}
            </select>
          </Field>

          {form.type === "other" ? (
            <div className="anim-fade-up">
              <Field label={t.projects.typeLabel} required>
                <input
                  className="input"
                  required
                  maxLength={40}
                  placeholder={t.projects.typeLabelPlaceholder}
                  value={form.type_label}
                  onChange={(e) => setForm({ ...form, type_label: e.target.value })}
                />
              </Field>
            </div>
          ) : null}

          <p className="rounded-xl bg-ink-50 px-4 py-3 text-[12.5px] text-ink-500">
            {t.projects.progressAuto}
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button className="btn-dark" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!unfiling}
        onClose={() => setUnfiling(null)}
        onConfirm={async () => {
          if (!unfiling) return;
          await fileSession(null, unfiling.session.id);
          setUnfiling(null);
        }}
        busy={assigning === unfiling?.session.id}
        tone="warning"
        note={t.projects.removeNote}
        title={t.projects.removeTitle}
        message={fill(t.projects.removeBody, {
          name: unfiling?.session.title ?? "",
          project: unfiling?.project.name ?? "",
        })}
        confirmLabel={t.projects.remove}
        impacts={[
          t.projects.removeImpactKept,
          t.projects.removeImpactProgress,
          t.projects.removeImpactRefile,
        ]}
      />

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={confirmDelete}
        busy={deleting}
        title={t.projects.deleteProject}
        message={fill(t.admin.deleteProjectBody, {
          name: target?.name ?? "",
          client: target?.client?.full_name ?? t.common.client,
        })}
        confirmLabel={t.projects.deleteProject}
        impacts={[t.admin.deleteProjectImpactClient, t.admin.deleteProjectImpactSession]}
      />
    </>
  );
}

/** Small dropdown for filing one of the client's loose sessions. */
function AddSessionMenu({
  options,
  busyId,
  onPick,
}: {
  options: SessionRow[];
  busyId: string | null;
  onPick: (sessionId: string) => void;
}) {
  const { t } = useI18n();

  if (options.length === 0) {
    return (
      <span className="hidden text-[12px] text-ink-400 sm:inline" title={t.projects.noneAvailable}>
        —
      </span>
    );
  }

  return (
    <select
      className="input !w-auto !py-1.5 !text-[13px]"
      value=""
      disabled={!!busyId}
      onChange={(e) => e.target.value && onPick(e.target.value)}
      aria-label={t.projects.addSession}
      title={t.projects.addSessionHint}
    >
      <option value="">+ {t.projects.addSession}</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
        </option>
      ))}
    </select>
  );
}
