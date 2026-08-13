import { CalendarSettings, type CalendarAccount } from "@/components/CalendarSettings";
import { SettingsView } from "@/components/SettingsView";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const supabase = await createClient();

  const [profile, { data: account }] = await Promise.all([
    requireAdmin(),
    supabase
      .from("calendar_accounts")
      .select("google_email, calendar_id, sync_enabled, last_synced_at, last_error, scopes")
      .maybeSingle(),
  ]);

  return (
    <SettingsView
      mustChangePassword={profile.must_change_password}
      profileId={profile.id}
      extra={<CalendarSettings account={(account as CalendarAccount) ?? null} />}
    />
  );
}
