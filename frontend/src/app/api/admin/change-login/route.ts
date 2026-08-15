import { createClient as createPlainClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Moves the studio account to a different person - new email, username, name
 * and optionally a new password, all on the SAME profile row.
 *
 * Changing the existing account rather than creating a second admin matters:
 * every client, session and calendar connection is tied to this profile id. A
 * fresh admin would start with no calendar link and no history, and the old
 * account would linger with access.
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  let body: {
    email?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
    password?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const username = body.username?.trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!username || username.length < 3) {
    return NextResponse.json({ error: "Username must be at least 3 characters." }, { status: 400 });
  }
  if (body.password && body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Neither the address nor the username may belong to somebody else.
  const { data: clash } = await admin
    .from("profiles")
    .select("id")
    .or(`login_email.ilike.${email},username.ilike.${username}`)
    .neq("id", guard.userId)
    .maybeSingle();

  if (clash) {
    return NextResponse.json(
      { error: "Another account already uses that email or username." },
      { status: 400 }
    );
  }

  const { error: authError } = await admin.auth.admin.updateUserById(guard.userId, {
    email,
    email_confirm: true,
    ...(body.password ? { password: body.password } : {}),
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      login_email: email,
      contact_email: email,
      username,
      ...(body.first_name ? { first_name: body.first_name.trim() } : {}),
      ...(body.last_name !== undefined ? { last_name: body.last_name.trim() } : {}),
      must_change_password: false,
    })
    .eq("id", guard.userId);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Prove the new credentials work before telling anyone to use them.
  let verified = true;
  let verifyError: string | null = null;

  if (body.password) {
    try {
      const probe = createPlainClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { error } = await probe.auth.signInWithPassword({ email, password: body.password });
      verified = !error;
      verifyError = error?.message ?? null;
    } catch (err) {
      verified = false;
      verifyError = err instanceof Error ? err.message : "Verification failed.";
    }
  }

  return NextResponse.json({ email, username, verified, verifyError });
}
