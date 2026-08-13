import { requireAdmin } from "@/lib/supabase/session";
import { DiagnoseView } from "./DiagnoseView";

export const dynamic = "force-dynamic";

export default async function DiagnosePage() {
  await requireAdmin();
  return <DiagnoseView />;
}
