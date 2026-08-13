import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Removes a client completely - from the app and from Supabase Auth.
 *
 * `profiles.id` references `auth.users(id) on delete cascade`, and sessions,
 * projects, requests, notifications and credentials all cascade from the
 * profile. Deleting the auth user therefore removes every trace in one step,
 * with no orphaned rows left behind.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  let clientId: string | undefined;
  try {
    ({ client_id: clientId } = (await request.json()) as { client_id?: string });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!clientId) return NextResponse.json({ error: "client_id is required." }, { status: 400 });

  // Guard rails: never let an admin delete themselves or another admin here.
  if (clientId === user.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, full_name, username, role")
    .eq("id", clientId)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  if (target.role === "admin") {
    return NextResponse.json(
      { error: "Admin accounts cannot be deleted from here." },
      { status: 400 }
    );
  }

  // Delete the auth user - the cascade clears everything downstream.
  const { error: authError } = await admin.auth.admin.deleteUser(clientId);

  if (authError) {
    return NextResponse.json(
      { error: `Could not delete the login: ${authError.message}` },
      { status: 500 }
    );
  }

  // Belt and braces: if the auth user was already missing, the cascade never
  // fired, so clear the profile directly.
  await admin.from("profiles").delete().eq("id", clientId);

  return NextResponse.json({ deleted: true, full_name: target.full_name });
}
