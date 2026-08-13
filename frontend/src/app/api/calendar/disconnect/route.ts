import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const admin = createAdminClient();
  await admin.from("calendar_accounts").delete().eq("profile_id", guard.userId);

  return NextResponse.json({ disconnected: true });
}
