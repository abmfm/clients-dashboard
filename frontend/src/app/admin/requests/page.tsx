import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type { SessionRequest } from "@/lib/types";
import { AdminRequestsView } from "./AdminRequestsView";

export const dynamic = "force-dynamic";

export default async function AdminRequests() {
  // Needs the admin's id for the reviewed_by column, so this one waits.
  // requireAdmin() is memoised, so the layout's call is reused - no extra trip.
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("requests")
    .select("*, client:profiles!requests_client_id_fkey(id, full_name, username)")
    .order("created_at", { ascending: false });

  return <AdminRequestsView adminId={admin.id} requests={(data as SessionRequest[]) ?? []} />;
}
