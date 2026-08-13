import { createClient } from "@/lib/supabase/server";
import { getSessionUserId, requireClient } from "@/lib/supabase/session";
import type { Project, SessionRow } from "@/lib/types";
import { ProjectsView } from "./ProjectsView";

export const dynamic = "force-dynamic";

export default async function ClientProjects() {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const [, { data: projects }, { data: sessions }] = await Promise.all([
    requireClient(),
    supabase
      .from("projects")
      .select("*")
      .eq("client_id", userId!)
      .order("updated_at", { ascending: false }),
    supabase
      .from("sessions")
      .select("*")
      .eq("client_id", userId!)
      .order("scheduled_at", { ascending: true, nullsFirst: false }),
  ]);

  const all = (sessions as SessionRow[]) ?? [];

  const projectsWithSessions = ((projects as Project[]) ?? []).map((p) => ({
    ...p,
    sessions: all.filter((s) => s.project_id === p.id),
  }));

  // Anything not filed yet still deserves to be visible.
  const loose = all.filter((s) => !s.project_id);

  return <ProjectsView projects={projectsWithSessions} loose={loose} />;
}
