import { createClient as createPlainClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  generatePassword,
  generateUsername,
  loginEmailFor,
  normalizeName,
} from "@/lib/credentials";
import { encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  first_name?: string;
  last_name?: string;
  session_count?: number | string | null;
  package_name?: string | null;
  package_id?: string | null;
  /** A real address, if the client has one. Falls back to a generated one. */
  email?: string | null;
}

export async function POST(request: Request) {
  // ---------------------------------------------------------------------
  // 1. Authenticate the caller and confirm they are an admin.
  //    The service-role key is only reachable after this check passes.
  // ---------------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  // ---------------------------------------------------------------------
  // 2. Validate input.
  // ---------------------------------------------------------------------
  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const firstName = normalizeName(body.first_name ?? "");
  const lastName = normalizeName(body.last_name ?? "");

  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: "First name and last name are required." },
      { status: 400 }
    );
  }

  const rawCount = body.session_count;
  const sessionLimit =
    rawCount === null || rawCount === undefined || rawCount === ""
      ? 0
      : Math.max(0, Math.min(999, Math.trunc(Number(rawCount))));

  if (Number.isNaN(sessionLimit)) {
    return NextResponse.json({ error: "Number of sessions must be a number." }, { status: 400 });
  }

  // ---------------------------------------------------------------------
  // 3. Generate credentials, retrying until the username is unique.
  // ---------------------------------------------------------------------
  const admin = createAdminClient();
  const domain = process.env.NEXT_PUBLIC_CLIENT_EMAIL_DOMAIN || "clients.studioflow.app";

  const contactEmail = body.email?.trim().toLowerCase() || null;

  if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "That email address is not valid." }, { status: 400 });
  }

  // FirstName + LastName, with a numeric suffix only if that name is taken.
  let username = "";

  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = generateUsername(firstName, lastName, attempt);

    const { data: clash } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", candidate)
      .maybeSingle();

    if (!clash) {
      username = candidate;
      break;
    }
  }

  if (!username) {
    return NextResponse.json(
      { error: "Could not generate a unique username. Try again." },
      { status: 500 }
    );
  }

  // A real address is used for the login when given, so the client can receive
  // calendar invites and password resets later.
  const loginEmail = contactEmail ?? loginEmailFor(username, domain);

  const { data: emailClash } = await admin
    .from("profiles")
    .select("id")
    .ilike("login_email", loginEmail)
    .maybeSingle();

  if (emailClash) {
    return NextResponse.json(
      { error: "Another client already uses that email address." },
      { status: 400 }
    );
  }

  const password = generatePassword(firstName);

  // ---------------------------------------------------------------------
  // 4. Create the auth user (pre-confirmed, since there is no real mailbox).
  // ---------------------------------------------------------------------
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: loginEmail,
    password,
    email_confirm: true,
    user_metadata: { username, first_name: firstName, last_name: lastName, role: "client" },
  });

  if (authError || !created.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Could not create the auth user." },
      { status: 500 }
    );
  }

  const userId = created.user.id;

  // ---------------------------------------------------------------------
  // 5. Create the profile + store the handoff credentials.
  //    If anything fails, roll the auth user back so we never orphan one.
  // ---------------------------------------------------------------------
  // A database trigger also creates a profile the moment the auth user exists,
  // so this is an upsert rather than an insert - whichever ran first, the row
  // ends up with the right username, package and the 'client' role.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      username,
      login_email: loginEmail,
      first_name: firstName,
      last_name: lastName,
      role: "client",
      package_name: body.package_name?.trim() || null,
      package_id: body.package_id || null,
      contact_email: contactEmail,
      // The six-month contract starts today - there is nothing to choose.
      contract_start: new Date().toISOString().slice(0, 10),
      contract_months: 6,
      session_limit: sessionLimit,
      must_change_password: true,
      created_by: user.id,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Encrypted at the application layer so the password never exists in the
  // database as readable text.
  const { error: credError } = await admin.from("client_credentials").upsert(
    {
      profile_id: userId,
      username,
      initial_password_enc: encryptSecret(password),
    },
    { onConflict: "profile_id" }
  );

  if (credError) {
    // Not fatal - the account works, the admin just loses the stored copy.
    console.error("Could not store client credentials:", credError.message);
  }

  await admin.from("notifications").insert({
    user_id: userId,
    // Fallback text for older rows; the template is what actually renders.
    title: "Welcome to Twelve East",
    message: "Your account is ready. Change your password from Settings after signing in.",
    link: "/settings",
    kind: "success",
    template: "welcome",
    params: {},
  });

  // Prove the account works before telling the admin it is ready. Catching a
  // broken login here is far better than the client discovering it later.
  let verified = false;
  let verifyError: string | null = null;

  try {
    const probe = createPlainClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { error: probeError } = await probe.auth.signInWithPassword({
      email: loginEmail,
      password,
    });
    if (probeError) verifyError = probeError.message;
    else verified = true;
  } catch (err) {
    verifyError = err instanceof Error ? err.message : "Verification could not run.";
  }

  return NextResponse.json({
    id: userId,
    username,
    password,
    login_email: loginEmail,
    full_name: `${firstName} ${lastName}`,
    session_limit: sessionLimit,
    verified,
    verifyError,
  });
}
