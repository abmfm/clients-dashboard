import { createClient } from "@/lib/supabase/server";
import { getSessionUserId, requireClient } from "@/lib/supabase/session";
import type { ClientStats, SessionRequest } from "@/lib/types";
import { RequestsView } from "./RequestsView";

export const dynamic = "force-dynamic";

export default async function ClientRequests() {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const [profile, { data }, { data: stats }] = await Promise.all([
    requireClient(),
    supabase
      .from("requests")
      .select("*")
      .eq("client_id", userId!)
      .order("created_at", { ascending: false }),
    supabase.rpc("client_stats"),
  ]);

  return (
    <RequestsView
      clientId={profile.id}
      requests={(data as SessionRequest[]) ?? []}
      stats={(stats as ClientStats) ?? null}
    />
  );
}
