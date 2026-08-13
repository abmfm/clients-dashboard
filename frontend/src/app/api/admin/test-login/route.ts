import { createClient as createPlainClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Walks the exact login chain and reports where it breaks.
 *
 *   username -> email_for_username RPC -> auth user -> sign-in
 *
 * Every step is reported separately, so "it says the password is wrong" turns
 * into a precise answer instead of a guess.
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

  let identifier = "";
  let password = "";
  try {
    const body = (await request.json()) as { identifier?: string; password?: string };
    identifier = (body.identifier ?? "").trim();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!identifier) return NextResponse.json({ error: "Enter a username or email." }, { status: 400 });

  const admin = createAdminClient();
  const anon = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const steps: { step: string; ok: boolean; detail: string }[] = [];
  const push = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });

  // ---- 1. Resolve the identifier the same way the login page does ----------
  let email = identifier;

  if (!identifier.includes("@")) {
    const { data, error } = await anon.rpc("email_for_username", { p_username: identifier });

    if (error) {
      push("Username lookup", false, error.message);
      return NextResponse.json({ steps, verdict: "rpc_error" });
    }
    if (!data) {
      push("Username lookup", false, `No profile has the username "${identifier}".`);
      return NextResponse.json({ steps, verdict: "unknown_username" });
    }

    email = data as string;
    push("Username lookup", true, `Resolved to ${email}`);
  } else {
    push("Username lookup", true, "An email was entered, so no lookup was needed.");
  }

  // ---- 2. Profile row -------------------------------------------------------
  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, login_email, role, status")
    .ilike("login_email", email)
    .maybeSingle();

  if (!profile) {
    push("Profile row", false, `No profile has login_email = ${email}`);
  } else {
    push(
      "Profile row",
      Boolean(profile.role),
      `username=${profile.username}  role=${profile.role ?? "MISSING"}  status=${profile.status}`
    );
  }

  // ---- 3. Auth user ---------------------------------------------------------
  if (profile?.id) {
    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);

    if (!authUser?.user) {
      push("Auth account", false, "No auth user exists for this profile id.");
    } else {
      const sameEmail = (authUser.user.email ?? "").toLowerCase() === email.toLowerCase();
      push(
        "Auth account",
        sameEmail && !!authUser.user.email_confirmed_at,
        `email=${authUser.user.email}  confirmed=${!!authUser.user.email_confirmed_at}` +
          (sameEmail ? "" : "  MISMATCH with the profile's login_email")
      );
    }
  }

  // ---- 4. The actual sign-in ------------------------------------------------
  if (!password) {
    push("Sign-in", false, "No password supplied, so sign-in was not attempted.");
    return NextResponse.json({ steps, verdict: "no_password" });
  }

  const { error: signInError } = await anon.auth.signInWithPassword({ email, password });

  if (signInError) {
    push("Sign-in", false, signInError.message);
    return NextResponse.json({ steps, verdict: "bad_password" });
  }

  push("Sign-in", true, "These exact credentials sign in successfully.");
  return NextResponse.json({ steps, verdict: "ok" });
}
