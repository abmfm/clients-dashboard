import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type { AdminStats, Project, SessionRequest } from "@/lib/types";
import { AdminDashboardView } from "./AdminDashboardView";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = await createClient();

  // One round trip instead of four sequential ones.
  const [, { data: stats }, { data: requests }, { data: projects }] = await Promise.all([
    requireAdmin(),
    supabase.rpc("admin_stats"),
    supabase
      .from("requests")
      .select("*, client:profiles!requests_client_id_fkey(id, full_name, username)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("projects")
      .select("*, client:profiles!projects_client_id_fkey(id, full_name, username)")
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  return (
    <AdminDashboardView
      stats={(stats as AdminStats) ?? null}
      requests={(requests as SessionRequest[]) ?? []}
      projects={(projects as Project[]) ?? []}
    />
  );
}
