import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type { Profile, SessionRow } from "@/lib/types";
import { AdminSessionsView } from "./AdminSessionsView";

export const dynamic = "force-dynamic";

export default async function AdminSessions() {
  const supabase = await createClient();

  const [, { data: sessions }, { data: clients }, { data: projects }] = await Promise.all([
    requireAdmin(),
    supabase
      .from("sessions")
      .select("*, client:profiles!sessions_client_id_fkey(id, full_name, username)")
      .order("scheduled_at", { ascending: false, nullsFirst: false }),
    supabase.from("profiles").select("id, full_name, username").eq("role", "client").order("full_name"),
    supabase.from("projects").select("id, name, client_id").order("name"),
  ]);

  return (
    <AdminSessionsView
      sessions={(sessions as SessionRow[]) ?? []}
      clients={(clients as Pick<Profile, "id" | "full_name" | "username">[]) ?? []}
      projects={(projects as { id: string; name: string; client_id: string }[]) ?? []}
    />
  );
}
