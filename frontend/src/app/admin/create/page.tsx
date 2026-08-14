import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/session";
import type { PackageRow } from "@/lib/types";
import { CreateClientView } from "./CreateClientView";

export const dynamic = "force-dynamic";

export default async function CreateClientPage() {
  const supabase = await createClient();

  const [, { data: packages }] = await Promise.all([
    requireAdmin(),
    supabase.from("packages").select("*").eq("is_active", true).order("sort_order"),
  ]);

  return <CreateClientView packages={(packages as PackageRow[]) ?? []} />;
}
