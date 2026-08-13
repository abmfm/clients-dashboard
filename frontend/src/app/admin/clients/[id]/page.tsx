import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type { Profile, Project, SessionRequest, SessionRow } from "@/lib/types";
import { ClientDetailView } from "./ClientDetailView";

export const dynamic = "force-dynamic";

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (!profile) notFound();

  const [{ data: sessions }, { data: projects }, { data: requests }, { data: credentials }] =
    await Promise.all([
      supabase.from("sessions").select("*").eq("client_id", id).order("scheduled_at", { ascending: false }),
      supabase.from("projects").select("*").eq("client_id", id).order("updated_at", { ascending: false }),
      supabase.from("requests").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase
        .from("client_credentials")
        .select("username, initial_password_enc")
        .eq("profile_id", id)
        .maybeSingle(),
    ]);

  return (
    <ClientDetailView
      profile={profile as Profile}
      sessions={(sessions as SessionRow[]) ?? []}
      projects={(projects as Project[]) ?? []}
      requests={(requests as SessionRequest[]) ?? []}
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
