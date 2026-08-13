/**
 * One-time bootstrap: creates (or repairs) the studio admin account.
 *
 *   npm run create-admin
 *
 * Reads ADMIN_EMAIL / ADMIN_USERNAME / ADMIN_PASSWORD from .env.local.
 * Safe to run more than once - it will not duplicate the account.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.env.ADMIN_EMAIL || "admin@studioflow.app";
const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD;

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

if (!url || url.includes("YOUR-PROJECT-REF")) {
  fail("Set NEXT_PUBLIC_SUPABASE_URL in .env.local (Project Settings -> Data API -> Project URL).");
}
if (!secret) fail("Set SUPABASE_SERVICE_ROLE_KEY in .env.local.");
if (!password) fail("Set ADMIN_PASSWORD in .env.local.");

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// 1. Find or create the auth user
// ---------------------------------------------------------------------------
let userId;

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) fail(`Could not reach Supabase Auth: ${listError.message}`);

const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (existing) {
  userId = existing.id;
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (error) fail(`Could not reset the admin password: ${error.message}`);
  console.log(`  · Auth user already existed — password reset.`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, role: "admin" },
  });
  if (error) fail(`Could not create the auth user: ${error.message}`);
  userId = data.user.id;
  console.log(`  · Auth user created.`);
}

// ---------------------------------------------------------------------------
// 2. Upsert the profile with the admin role
// ---------------------------------------------------------------------------
const { error: profileError } = await admin.from("profiles").upsert(
  {
    id: userId,
    username,
    login_email: email,
    first_name: "Studio",
    last_name: "Admin",
    role: "admin",
    package_name: null,
    session_limit: 0,
    must_change_password: false,
    status: "active",
  },
  { onConflict: "id" }
);

if (profileError) {
  fail(
    `Could not write the profile: ${profileError.message}\n` +
      `    Did you run supabase/01_schema.sql and 02_policies.sql first?`
  );
}

console.log(`
  ✓ Admin ready

    Sign in at  /login
    Username    ${username}
    Email       ${email}
    Password    ${password}

  Change the password from Settings once you are in.
`);
