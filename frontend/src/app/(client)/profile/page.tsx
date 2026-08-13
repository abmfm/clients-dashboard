import { requireClient } from "@/lib/supabase/session";
import { ProfileView } from "./ProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await requireClient();
  return <ProfileView profile={profile} />;
}
