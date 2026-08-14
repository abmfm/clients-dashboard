import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type { AdminStats, SessionRequest, SessionRow } from "@/lib/types";
import { AdminDashboardView } from "./AdminDashboardView";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = await createClient();

  // One round trip instead of four sequential ones.
  const [, { data: stats }, { data: requests }, { data: upcoming }] = await Promise.all([
    requireAdmin(),
    supabase.rpc("admin_stats"),
    supabase
      .from("requests")
      .select("*, client:profiles!requests_client_id_fkey(id, full_name, username)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("sessions")
      .select("*, client:profiles!sessions_client_id_fkey(id, full_name, username)")
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(6),
  ]);

  return (
    <AdminDashboardView
      stats={(stats as AdminStats) ?? null}
      requests={(requests as SessionRequest[]) ?? []}
      sessions={(upcoming as SessionRow[]) ?? []}
    />
  );
}
