import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type { Profile, Project, SessionRow } from "@/lib/types";
import { AdminProjectsView } from "./AdminProjectsView";

export const dynamic = "force-dynamic";

export default async function AdminProjects() {
  const supabase = await createClient();

  const [, { data: projects }, { data: clients }, { data: sessions }] = await Promise.all([
    requireAdmin(),
    supabase
      .from("projects")
      .select("*, client:profiles!projects_client_id_fkey(id, full_name, username)")
      .order("updated_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, username")
      .eq("role", "client")
      .order("full_name"),
    supabase
      .from("sessions")
      .select("*, client:profiles!sessions_client_id_fkey(id, full_name, username)")
      .order("scheduled_at", { ascending: true, nullsFirst: false }),
  ]);

  // Nest the sessions under their project in one pass rather than asking
  // Postgres for a nested select per project.
  const all = (sessions as SessionRow[]) ?? [];
  const withSessions = ((projects as Project[]) ?? []).map((p) => ({
    ...p,
    sessions: all.filter((s) => s.project_id === p.id),
  }));

  return (
    <AdminProjectsView
      projects={withSessions}
      clients={(clients as Pick<Profile, "id" | "full_name" | "username">[]) ?? []}
      sessions={all}
    />
  );
}
