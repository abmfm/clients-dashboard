import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type { Profile } from "@/lib/types";
import { AdminClientsView, type ClientRow } from "./AdminClientsView";

export const dynamic = "force-dynamic";

export default async function AdminClients() {
  const supabase = await createClient();

  const [, { data: profiles }, { data: sessions }, { data: projects }] = await Promise.all([
    requireAdmin(),
    supabase.from("profiles").select("*").eq("role", "client").order("created_at", { ascending: false }),
    supabase.from("sessions").select("id, client_id"),
    supabase.from("projects").select("id, client_id, status"),
  ]);

  const rows: ClientRow[] = ((profiles as Profile[]) ?? []).map((p) => ({
    ...p,
    session_count: (sessions ?? []).filter((s) => s.client_id === p.id).length,
    project_count: (projects ?? []).filter((pr) => pr.client_id === p.id).length,
    active_projects: (projects ?? []).filter(
      (pr) => pr.client_id === p.id && !["completed", "cancelled"].includes(pr.status as string)
    ).length,
  }));

  return <AdminClientsView clients={rows} />;
}
