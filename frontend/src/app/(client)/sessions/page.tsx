import { Card } from "@/components/ui/Card";
import { ClientSessionsTable } from "./ClientSessionsTable";
import { createClient } from "@/lib/supabase/server";
import { getSessionUserId, requireClient } from "@/lib/supabase/session";
import type { ClientStats, SessionRow } from "@/lib/types";
import { PackageUsage, SessionsHeading } from "./SessionsView";

export const dynamic = "force-dynamic";

export default async function ClientSessions() {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const [profile, { data: sessions }, { data: stats }] = await Promise.all([
    requireClient(),
    supabase
      .from("sessions")
      .select("*")
      .eq("client_id", userId!)
      .order("scheduled_at", { ascending: false, nullsFirst: false }),
    supabase.rpc("client_stats"),
  ]);

  const clientStats = (stats as ClientStats) ?? null;

  return (
    <>
      <SessionsHeading clientId={profile.id} stats={clientStats} />
      <PackageUsage stats={clientStats} />
      <Card className="mt-6 pt-5">
        <ClientSessionsTable sessions={(sessions as SessionRow[]) ?? []} />
      </Card>
    </>
  );
}
