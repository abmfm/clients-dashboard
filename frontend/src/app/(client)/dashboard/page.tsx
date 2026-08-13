import { timed } from "@/lib/perf";
import { createClient } from "@/lib/supabase/server";
import { getSessionUserId, requireClient } from "@/lib/supabase/session";
import type { ClientStats, Project, SessionRequest } from "@/lib/types";
import { DashboardView } from "./DashboardView";

export const dynamic = "force-dynamic";

export default async function ClientDashboard() {
  // The id comes from the cookie with no network call, so the guard and all
  // three queries can start at the same time instead of one after another.
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const [profile, { data: stats }, { data: projects }, { data: requests }] = await timed(
    "dashboard queries",
    async () =>
      Promise.all([
    requireClient(),
    supabase.rpc("client_stats"),
    supabase
      .from("projects")
      .select("*")
      .eq("client_id", userId!)
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("requests")
      .select("*")
      .eq("client_id", userId!)
      .order("created_at", { ascending: false })
      .limit(4),
      ] as const)
  );

  return (
    <DashboardView
      clientId={profile.id}
      stats={(stats as ClientStats) ?? null}
      projects={(projects as Project[]) ?? []}
      requests={(requests as SessionRequest[]) ?? []}
    />
  );
}
