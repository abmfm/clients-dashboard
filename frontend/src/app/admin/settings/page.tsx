import { AdminAccountPanel } from "@/components/AdminAccountPanel";
import { CalendarSettings, type CalendarAccount } from "@/components/CalendarSettings";
import { StudioSettingsPanel } from "@/components/StudioSettingsPanel";
import type { StudioSettings } from "@/lib/booking/slots";
import { SettingsView } from "@/components/SettingsView";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const supabase = await createClient();

  const [profile, { data: account }, { data: studio }] = await Promise.all([
    requireAdmin(),
    supabase
      .from("calendar_accounts")
      .select("google_email, calendar_id, sync_enabled, last_synced_at, last_error, scopes")
      .maybeSingle(),
    supabase.from("studio_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  return (
    <SettingsView
      mustChangePassword={profile.must_change_password}
      profileId={profile.id}
      extra={
        <>
          <AdminAccountPanel profile={profile} />
          <StudioSettingsPanel settings={(studio as StudioSettings) ?? null} />
          <CalendarSettings
            account={
              account
                ? {
                    ...(account as CalendarAccount),
                    event_guests:
                      (studio as { event_guests?: string[] } | null)?.event_guests ?? [],
                  }
                : null
            }
          />
        </>
      }
    />
  );
}
