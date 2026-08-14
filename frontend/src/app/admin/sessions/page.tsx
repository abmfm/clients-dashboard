import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type { Profile, SessionRow } from "@/lib/types";
import { AdminSessionsView } from "./AdminSessionsView";

export const dynamic = "force-dynamic";

export default async function AdminSessions() {
  const supabase = await createClient();

  const [, { data: sessions }, { data: clients }, { data: settings }] =
    await Promise.all([
    requireAdmin(),
    supabase
      .from("sessions")
      .select("*, client:profiles!sessions_client_id_fkey(id, full_name, username)")
      .order("scheduled_at", { ascending: false, nullsFirst: false }),
    supabase.from("profiles").select("id, full_name, username").eq("role", "client").order("full_name"),
      supabase.from("studio_settings").select("extra_session_price, currency").eq("id", 1).maybeSingle(),
    ]);

  return (
    <AdminSessionsView
      sessions={(sessions as SessionRow[]) ?? []}
      clients={(clients as Pick<Profile, "id" | "full_name" | "username">[]) ?? []}
      settings={(settings as { extra_session_price: number; currency: string }) ?? null}
    />
  );
}
