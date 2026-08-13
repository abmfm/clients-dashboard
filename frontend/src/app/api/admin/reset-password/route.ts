import { createClient as createPlainClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { encryptSecret } from "@/lib/crypto";
import { generatePassword } from "@/lib/credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Repairs a client login end to end.
 *
 *   1. Finds the auth user by the email stored on the profile.
 *   2. Creates it if it is missing, resets the password if it exists.
 *   3. Immediately proves the credentials work by signing in with them
 *      server-side, using the same publishable key the browser uses.
 *
 * Step 3 matters: "Invalid login credentials" is returned by Supabase both for
 * a wrong password and for an account that does not exist, so without an actual
 * sign-in attempt there is no way to tell those apart.
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

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, username, login_email, first_name, last_name")
    .eq("id", clientId)
    .single();

  if (!target) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const password = generatePassword(14);
  const steps: string[] = [];

  // -------------------------------------------------------------------------
  // 1. Does an auth user actually exist for this profile?
  // -------------------------------------------------------------------------
  const { data: byId } = await admin.auth.admin.getUserById(clientId);
  let authEmail = byId?.user?.email ?? null;

  if (byId?.user) {
    steps.push(`Auth user found (${authEmail}).`);

    const { error: updateError } = await admin.auth.admin.updateUserById(clientId, {
      email: target.login_email,
      password,
      email_confirm: true,
    });

    if (updateError) {
      return NextResponse.json(
        { error: `Could not update the auth user: ${updateError.message}`, steps },
        { status: 500 }
      );
    }

    authEmail = target.login_email;
    steps.push("Password reset and email confirmed.");
  } else {
    // The profile row exists but the auth user does not - recreate it with the
    // same id so every foreign key keeps pointing at the right person.
    steps.push("No auth user for this profile — recreating it.");

    const { error: createError } = await admin.auth.admin.createUser({
      email: target.login_email,
      password,
      email_confirm: true,
      user_metadata: {
        username: target.username,
        first_name: target.first_name,
        last_name: target.last_name,
        role: "client",
      },
    });

    if (createError) {
      return NextResponse.json(
        { error: `Could not recreate the auth user: ${createError.message}`, steps },
        { status: 500 }
      );
    }

    authEmail = target.login_email;
    steps.push("Auth user created.");
  }

  await admin.from("profiles").update({ must_change_password: true }).eq("id", clientId);
  await admin.from("client_credentials").upsert(
    {
      profile_id: clientId,
      username: target.username,
      initial_password_enc: encryptSecret(password),
    },
    { onConflict: "profile_id" }
  );

  // -------------------------------------------------------------------------
  // 2. Prove it works, exactly the way the browser will.
  // -------------------------------------------------------------------------
  let verified = false;
  let verifyError: string | null = null;

  try {
    const probe = createPlainClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error: signInError } = await probe.auth.signInWithPassword({
      email: target.login_email,
      password,
    });

    if (signInError) {
      verifyError = signInError.message;
      steps.push(`Sign-in test FAILED: ${signInError.message}`);
    } else {
      verified = true;
      steps.push("Sign-in test passed — these credentials work.");
    }
  } catch (err) {
    verifyError = err instanceof Error ? err.message : "Sign-in test could not run.";
    steps.push(`Sign-in test could not run: ${verifyError}`);
  }

  return NextResponse.json({
    username: target.username,
    password,
    login_email: authEmail,
    verified,
    verifyError,
    steps,
  });
}
