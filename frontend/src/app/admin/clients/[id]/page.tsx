import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type {
  ClientContract,
  PackageRow,
  Profile,
  SessionRequest,
  SessionRow,
} from "@/lib/types";
import { ClientDetailView } from "./ClientDetailView";

export const dynamic = "force-dynamic";

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (!profile) notFound();

  const [
    { data: sessions },
    { data: requests },
    { data: credentials },
    { data: contract },
    { data: packages },
  ] = await Promise.all([
      supabase.from("sessions").select("*").eq("client_id", id).order("scheduled_at", { ascending: false }),
      supabase.from("requests").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase
        .from("client_credentials")
        .select("username, initial_password_enc")
        .eq("profile_id", id)
        .maybeSingle(),
      supabase.rpc("client_contract", { p_client: id }),
      supabase.from("packages").select("*").eq("is_active", true).order("sort_order"),
    ]);

  return (
    <ClientDetailView
      profile={profile as Profile}
      sessions={(sessions as SessionRow[]) ?? []}
      requests={(requests as SessionRequest[]) ?? []}
      contract={(contract as ClientContract) ?? null}
      packages={(packages as PackageRow[]) ?? []}
      credentials={
        credentials
          ? {
              username: (credentials as { username: string }).username,
              // Only a flag crosses the wire - the ciphertext never reaches the browser.
              hasPassword: !!(credentials as { initial_password_enc: string | null })
                .initial_password_enc,
            }
          : null
      }
    />
  );
}
