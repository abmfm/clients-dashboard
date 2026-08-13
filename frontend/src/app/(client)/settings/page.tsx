import { requireClient } from "@/lib/supabase/session";
import { SettingsView } from "@/components/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await requireClient();
  return <SettingsView mustChangePassword={profile.must_change_password} profileId={profile.id} />;
}
