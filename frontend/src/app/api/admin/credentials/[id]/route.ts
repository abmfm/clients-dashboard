import { NextResponse } from "next/server";

import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the decrypted one-time password for a client.
 * Admin-only, and never included in any page payload - the admin has to ask
 * for it explicitly by clicking "reveal".
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("client_credentials")
    .select("initial_password_enc")
    .eq("profile_id", id)
    .maybeSingle();

  if (!data?.initial_password_enc) {
    return NextResponse.json({ error: "No stored password for this client." }, { status: 404 });
  }

  const password = decryptSecret(data.initial_password_enc);
  if (!password) {
    return NextResponse.json(
      { error: "Could not decrypt. CREDENTIALS_ENCRYPTION_KEY may have changed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ password });
}
