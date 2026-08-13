import { redirect } from "next/navigation";

import { getProfile, getSessionUserId } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

/**
 * The single place that decides where a signed-in user belongs.
 * The login page sends everyone here rather than resolving the role itself, so
 * a failure in this lookup can never be mistaken for a bad password.
 */
export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const profile = await getProfile();
  if (!profile) redirect("/no-profile");

  redirect(profile.role === "admin" ? "/admin/dashboard" : "/dashboard");
}
