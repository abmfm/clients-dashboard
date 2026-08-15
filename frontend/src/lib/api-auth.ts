import "server-only";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Single admin guard for every privileged route, so the check is written once
 * rather than copy-pasted into each handler.
 */
export async function requireAdminApi(): Promise<
  { userId: string; error: null } | { userId: ""; error: NextResponse }
> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user;

  if (!user) {
    return { userId: "", error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { userId: "", error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }

  return { userId: user.id, error: null };
}
